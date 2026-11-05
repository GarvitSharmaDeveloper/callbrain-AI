// Triggerware client — the live-data backbone of CallBrain.
//
// LIVE mode uses the official `triggerware` Node SDK (github.com/triggerware/tw2-sdks) against a
// Triggerware server (local `triggerware start` on localhost:5221, or a cloud instance over WS):
//   cursors.open({ prompt | sql })      natural-language or SQL queries over live tables
//   tables.create({ prompt })           virtual tables generated from plain English
//   triggers.create / watch / run       push-based change detection (added/deleted deltas)
//   queries.create / convert            saved queries, convertible into triggers
//   connectors / agents / runtimes      catalog, installed connectors, Triggerware agents
// SIMULATION mode mirrors the same semantics locally (Claude for NL→SQL, the app DB for
// execution, snapshot diffing for deltas) so the demo runs anywhere.

import type { TriggerwareClient } from "triggerware";
import { config, twLive, twMode } from "./config";
import { emit, uid } from "./bus";
import { getDb } from "./db";
import { runClaude, S } from "./claude";
import { SCHEMA_DOC, SQL_RULES, toTriggerwareSql } from "./schema";

export type Row = unknown[];
export interface QueryResult { sql: string; signature: string[]; rows: Row[]; ms: number }
export interface TriggerInfo { name: string; description: string; sql: string; schedule?: string; enabled: boolean; signature: string[]; prompt?: string }
export type DeltaCallback = (added: Row[], deleted: Row[]) => void | Promise<void>;

// ---------------------------------------------------------------------------------------------
// Instrumentation: every Triggerware call is timed and broadcast to the UI ("Triggerware live").
// ---------------------------------------------------------------------------------------------
async function track<T>(
  op: string,
  meta: { label?: string; input?: string },
  fn: () => Promise<T>,
  describe?: (r: T) => { sql?: string; rowCount?: number },
): Promise<T> {
  const t0 = Date.now();
  try {
    const r = await fn();
    emit({ type: "tw", data: { id: uid("tw_"), at: new Date().toISOString(), op, ...meta, ...(describe?.(r) || {}), ms: Date.now() - t0, ok: true, mode: twMode() } });
    return r;
  } catch (e) {
    emit({ type: "tw", data: { id: uid("tw_"), at: new Date().toISOString(), op, ...meta, ms: Date.now() - t0, ok: false, error: errMsg(e), mode: twMode() } });
    throw e;
  }
}
const errMsg = (e: unknown) => String((e as Error)?.message || e);

// ---------------------------------------------------------------------------------------------
// Live connection (one shared JSON-RPC peer; reconnects on failure)
// ---------------------------------------------------------------------------------------------
const g = globalThis as unknown as {
  __twClient?: Promise<TriggerwareClient> | null;
  __twSim?: SimState;
  __twWatchers?: Map<string, DeltaCallback>;
};
const watchers: Map<string, DeltaCallback> = g.__twWatchers || (g.__twWatchers = new Map());

async function client(): Promise<TriggerwareClient> {
  if (!g.__twClient) {
    g.__twClient = (async () => {
      const { TriggerwareClient } = await import("triggerware");
      const c = config.triggerware.wsUrl
        ? await TriggerwareClient.connectWs(config.triggerware.wsUrl, config.triggerware.apiKey)
        : await TriggerwareClient.connectTcp(config.triggerware.address);
      c.waitClosed().then(() => (g.__twClient = null)).catch(() => (g.__twClient = null));
      // Re-attach trigger watchers after a reconnect.
      for (const [name, cb] of watchers) await c.triggers.watch(name, cb).catch(() => {});
      return c;
    })().catch((e) => {
      g.__twClient = null;
      throw new Error(`Cannot reach Triggerware at ${config.triggerware.wsUrl || config.triggerware.address}: ${errMsg(e)}`);
    });
  }
  return g.__twClient;
}

// ---------------------------------------------------------------------------------------------
// Simulation engine
// ---------------------------------------------------------------------------------------------
interface SimTrigger extends TriggerInfo { snapshot: Set<string> | null }
interface SimState {
  triggers: Map<string, SimTrigger>;
  saved: Map<string, { name: string; description: string; sql: string }>;
  tables: Map<string, { name: string; prompt: string; code: string; runtime: string }>;
  agents: Map<string, { name: string; prompt: string; instructions: string; triggers: string[] }>;
  timer?: NodeJS.Timeout;
}
const sim: SimState = g.__twSim || (g.__twSim = { triggers: new Map(), saved: new Map(), tables: new Map(), agents: new Map() });

async function simSql(sql: string): Promise<{ signature: string[]; rows: Row[] }> {
  if (!/^\s*(select|with)\b/i.test(sql)) throw new Error("Triggerware queries are read-only: only SELECT is allowed");
  const db = await getDb();
  const r = await db.query(sql);
  return { signature: r.fields, rows: r.rows.map((o) => r.fields.map((f) => normalize(o[f]))) };
}

function normalize(v: unknown) {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string" && /^-?\d+\.\d+$/.test(v)) return Number(v);
  return v;
}

function timeAnchors() {
  const now = Date.now();
  const at = (ms: number) => new Date(now + ms).toISOString();
  const day = (d: number) => new Date(now + d * 86400000).toISOString().slice(0, 10);
  return `Precomputed literals (use these, do not do date math):
now='${at(0)}'  15 minutes ago='${at(-900000)}'  1 hour ago='${at(-3600000)}'  24 hours ago='${at(-86400000)}'
7 days ago='${at(-7 * 86400000)}'  30 days ago='${at(-30 * 86400000)}'  90 days ago='${at(-90 * 86400000)}'
today='${day(0)}'  in 7 days='${day(7)}'  in 30 days='${day(30)}'  in 90 days='${day(90)}'  7 days ago (date)='${day(-7)}'`;
}

async function simNlToSql(question: string): Promise<string> {
  const out = await runClaude<{ sql: string }>({
    system: [{ type: "text", text: `Translate the request into ONE SQL SELECT over these tables. Apply EVERY filter the request mentions; compute date/time thresholds from the current UTC time and inline them as literals in the documented format.\n${SCHEMA_DOC}\n\n${SQL_RULES}` }],
    prompt: `${timeAnchors()}\nRequest: ${question}`,
    schema: S.obj({ sql: S.str() }),
    effort: "low",
    maxTokens: 2000,
  });
  return out.sql.trim().replace(/;$/, "");
}

async function simDelta(t: SimTrigger): Promise<{ added: Row[]; deleted: Row[] }> {
  const r = await simSql(t.sql);
  if (!t.signature.length) t.signature = r.signature;
  const keys = new Map(r.rows.map((row) => [JSON.stringify(row), row]));
  if (!t.snapshot) {
    t.snapshot = new Set(keys.keys());
    return { added: [], deleted: [] };
  }
  const added = [...keys.entries()].filter(([k]) => !t.snapshot!.has(k)).map(([, v]) => v);
  const deleted = [...t.snapshot].filter((k) => !keys.has(k)).map((k) => JSON.parse(k) as Row);
  t.snapshot = new Set(keys.keys());
  return { added, deleted };
}

function startSimScheduler() {
  if (sim.timer) return;
  sim.timer = setInterval(async () => {
    for (const t of sim.triggers.values()) {
      if (!t.enabled) continue;
      try {
        const d = await simDelta(t);
        const cb = watchers.get(t.name);
        if (cb && (d.added.length || d.deleted.length)) {
          await cb(d.added, d.deleted);
        }
      } catch {
        /* ignore — surfaced on next manual run */
      }
    }
  }, config.triggerware.simPollMs);
}

// ---------------------------------------------------------------------------------------------
// Public client
// ---------------------------------------------------------------------------------------------
const colNames = (sig: { name: string }[] | readonly { name: string }[] | undefined) => (sig || []).map((c) => c.name);

export const tw = {
  mode: twMode,

  async health(): Promise<{ ok: boolean; detail: string }> {
    if (!twLive()) return { ok: true, detail: "simulation" };
    try {
      const h = await (await client()).system.health();
      return { ok: true, detail: h.status };
    } catch (e) {
      return { ok: false, detail: errMsg(e) };
    }
  },

  /** Ad-hoc query via a Triggerware cursor. "english" uses Triggerware's natural-language → SQL. */
  async query(text: string, opts: { language?: "english" | "sql"; label?: string; limit?: number } = {}): Promise<QueryResult> {
    const language = opts.language || "english";
    const t0 = Date.now();
    return track(
      `query.${language}`,
      { label: opts.label, input: text },
      async () => {
        if (twLive()) {
          const c = await client();
          let cur;
          if (language === "sql") {
            cur = await c.cursors.open({ sql: toTriggerwareSql(text), batchSize: opts.limit ?? 200, timeoutMs: 30000 });
          } else {
            try {
              cur = await c.cursors.open({ prompt: text, batchSize: opts.limit ?? 200, timeoutMs: 60000 });
            } catch {
              // Triggerware's NL agent unavailable → translate with our model, still execute on Triggerware.
              cur = await c.cursors.open({ sql: toTriggerwareSql(await simNlToSql(text)), batchSize: opts.limit ?? 200, timeoutMs: 30000 });
            }
          }
          const rows: Row[] = [];
          for (let r = await cur.next(); r && rows.length < (opts.limit ?? 200); r = await cur.next()) rows.push(r);
          if (!cur.exhausted) await cur.close().catch(() => {});
          return { sql: cur.sql, signature: colNames(cur.signature), rows, ms: Date.now() - t0 };
        }
        const sql = language === "sql" ? text : await simNlToSql(text);
        const r = await simSql(sql);
        return { sql, ...r, ms: Date.now() - t0 };
      },
      (r) => ({ sql: r.sql, rowCount: r.rows.length }),
    );
  },

  triggers: {
    /** Exact SQL trigger (falls back to Triggerware's plain-English trigger builder), or prompt-only. */
    async create(p: { name: string; description: string; sql?: string; prompt?: string }): Promise<TriggerInfo> {
      const name = slug(p.name);
      return track(
        "trigger.create",
        { label: name, input: p.prompt || p.description },
        async () => {
          if (twLive()) {
            const c = await client();
            let t;
            if (p.sql) {
              try {
                t = await c.triggers.create({ name, description: p.description, sql: toTriggerwareSql(p.sql), schedule: config.triggerware.schedule, enabled: true });
              } catch {
                t = await c.triggers.create({ name, prompt: `${p.description}. Check every 10 seconds. Use this SQL: ${toTriggerwareSql(p.sql)}`, enabled: true });
              }
            } else {
              try {
                t = await c.triggers.create({ name, prompt: p.prompt || p.description, enabled: true });
              } catch {
                const sql = await simNlToSql(`A monitoring query returning one row per matching item (identifier columns first) for: ${p.prompt || p.description}`);
                t = await c.triggers.create({ name, description: p.description, sql: toTriggerwareSql(sql), schedule: config.triggerware.schedule, enabled: true });
              }
            }
            if (!t.enabled) await c.triggers.enable(t.name).catch(() => {});
            return { name: t.name, description: t.description, sql: t.sql, schedule: t.schedule, enabled: true, signature: colNames(t.signature), prompt: t.prompt };
          }
          const sql = p.sql || (await simNlToSql(`A monitoring query returning one row per matching item (identifier columns first) for: ${p.prompt || p.description}`));
          const t: SimTrigger = { name, description: p.description, sql, schedule: config.triggerware.schedule, enabled: true, signature: [], prompt: p.prompt, snapshot: null };
          sim.triggers.set(name, t);
          await simDelta(t); // baseline
          startSimScheduler();
          return strip(t);
        },
        (t) => ({ sql: t.sql }),
      );
    },

    async list(): Promise<TriggerInfo[]> {
      if (twLive()) {
        const c = await client();
        const names = await c.triggers.list();
        if (!names.length) return [];
        const ts = await c.triggers.get(names);
        return (Array.isArray(ts) ? ts : [ts]).map((t) => ({ name: t.name, description: t.description, sql: t.sql, schedule: t.schedule, enabled: t.enabled, signature: colNames(t.signature), prompt: t.prompt }));
      }
      return [...sim.triggers.values()].map(strip);
    },

    /** Push-based: Triggerware calls us back with deltas whenever the trigger's result changes. */
    async watch(name: string, cb: DeltaCallback) {
      watchers.set(name, cb);
      return track("trigger.watch", { label: name }, async () => {
        if (twLive()) return (await client()).triggers.watch(name, cb);
        startSimScheduler();
        return "sim";
      });
    },

    /** Run a trigger immediately and get its delta (used by "check now"). */
    async run(name: string) {
      return track("trigger.run", { label: name }, async () => {
        if (twLive()) return (await client()).triggers.run(name, { timeoutMs: 30000 });
        const t = sim.triggers.get(name);
        if (!t) throw new Error(`No trigger ${name}`);
        const d = await simDelta(t);
        const cb = watchers.get(name);
        if (cb && (d.added.length || d.deleted.length)) await cb(d.added, d.deleted);
        return d;
      }, (d) => ({ rowCount: d.added.length + d.deleted.length }));
    },

    async setEnabled(name: string, enabled: boolean) {
      return track(enabled ? "trigger.enable" : "trigger.disable", { label: name }, async () => {
        if (twLive()) {
          const c = await client();
          return enabled ? c.triggers.enable(name) : c.triggers.disable(name);
        }
        const t = sim.triggers.get(name);
        if (t) t.enabled = enabled;
      });
    },

    async remove(name: string) {
      watchers.delete(name);
      return track("trigger.delete", { label: name }, async () => {
        if (twLive()) {
          const c = await client();
          await c.triggers.unwatch({ name }).catch(() => {});
          return c.triggers.delete(name);
        }
        sim.triggers.delete(name);
      });
    },
  },

  saved: {
    async create(name: string, description: string, sql: string) {
      return track("query.save", { label: name, input: description }, async () => {
        if (twLive()) {
          const q = await (await client()).queries.create({ name, description, sql: toTriggerwareSql(sql) });
          return { name: q.name };
        }
        sim.saved.set(name, { name, description, sql });
        return { name };
      }, () => ({ sql }));
    },
    async fetch(name: string): Promise<{ signature: string[]; rows: Row[] }> {
      return track("query.fetch", { label: name }, async () => {
        if (twLive()) {
          const q = (await (await client()).queries.get(name)) as import("triggerware").Query;
          await q.reset();
          const rows = await q.fetch({ rows: 200 });
          return { signature: colNames(q.signature), rows };
        }
        const s = sim.saved.get(name);
        if (!s) throw new Error(`No saved query ${name}`);
        return simSql(s.sql);
      }, (r) => ({ rowCount: r.rows.length }));
    },
    async list(): Promise<string[]> {
      if (twLive()) return (await client()).queries.list();
      return [...sim.saved.keys()];
    },
    /** Triggerware feature: turn any saved query into a live trigger. */
    async toTrigger(name: string, triggerName: string) {
      return track("query.convert", { label: `${name} → ${triggerName}` }, async () => {
        if (twLive()) return (await client()).queries.convert({ name, triggerName, schedule: config.triggerware.schedule, enabled: true });
        const s = sim.saved.get(name);
        if (!s) throw new Error(`No saved query ${name}`);
        return tw.triggers.create({ name: triggerName, description: s.description, sql: s.sql });
      });
    },
  },

  tables: {
    async list(): Promise<string[]> {
      if (twLive()) return (await client()).tables.list();
      return [...sim.tables.keys()];
    },
    async get(name: string): Promise<{ name: string; prompt?: string; code: string; runtime: string; columns: { name: string; type: string }[] }> {
      if (twLive()) {
        const t = (await (await client()).tables.get(name)) as import("triggerware").Table;
        return { name: t.name, prompt: t.prompt, code: t.code, runtime: t.runtime, columns: t.meta.columns };
      }
      const t = sim.tables.get(name);
      if (!t) throw new Error(`No table ${name}`);
      return { ...t, columns: [] };
    },
    /** Explicit table definition (meta + generator code). */
    async define(name: string, meta: { description: string; columns: { name: string; type: string }[]; generators: { name: string; inputs: string[] }[] }, code: string) {
      return track("table.define", { label: name }, async () => {
        if (!twLive()) return { name };
        const t = await (await client()).tables.create({ name, code, meta, runtime: "lua" });
        return { name: t.name };
      });
    },
    /** Plain English → a live virtual table (Triggerware writes the connector code). */
    async create(name: string, prompt: string) {
      return track("table.create", { label: name, input: prompt }, async () => {
        if (twLive()) {
          const t = await (await client()).tables.create({ name, prompt });
          return { name: t.name, code: t.code, runtime: t.runtime, columns: t.meta.columns };
        }
        const out = await runClaude<{ code: string }>({
          system: [{ type: "text", text: "Write a concise Node.js generator that fetches the described data source and returns rows. Output only code." }],
          prompt,
          schema: S.obj({ code: S.str() }),
          effort: "low",
          maxTokens: 3000,
        });
        sim.tables.set(name, { name, prompt, code: out.code, runtime: "node" });
        return { name, code: out.code, runtime: "node", columns: [] };
      });
    },
  },

  connectors: {
    async installed(): Promise<string[]> {
      if (twLive()) return (await client()).connectors.list();
      return ["tw"];
    },
    async catalog(): Promise<{ name: string; description: string }[]> {
      return track("connectors.catalog", {}, async () => {
        if (twLive()) return (await client()).connectors.catalog();
        return [{ name: "tw", description: "Built-in Triggerware connector" }];
      });
    },
  },

  agents: {
    async list(): Promise<string[]> {
      if (twLive()) return (await client()).agents.list();
      return [...sim.agents.keys()];
    },
    /** Triggerware agents: created from plain English, optionally bound to triggers. */
    async create(prompt: string, triggers: string[] = []) {
      return track("agent.create", { input: prompt }, async () => {
        if (twLive()) {
          const a = await (await client()).agents.create({ prompt });
          if (triggers.length) await (await client()).agents.update(a.name, { meta: { ...a.meta, triggers } }).catch(() => {});
          return { name: a.name, instructions: a.instructions, triggers };
        }
        const name = `agent_${uid()}`;
        sim.agents.set(name, { name, prompt, instructions: prompt, triggers });
        return { name, instructions: prompt, triggers };
      });
    },
  },

  async runtimes(): Promise<string[]> {
    if (twLive()) return (await client()).runtimes.list();
    return ["node"];
  },

  async ensureNodeRuntime() {
    if (!twLive()) return;
    const c = await client();
    const have = await c.runtimes.list();
    if (!have.includes("node")) await track("runtime.install", { label: "node" }, () => c.runtimes.install("node"));
  },
};

function strip(t: SimTrigger): TriggerInfo {
  const { snapshot: _s, ...rest } = t;
  void _s;
  return rest;
}

export function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 48) || uid("t_");
}

export function rowsToObjects(signature: string[], rows: Row[]) {
  return rows.map((r) => Object.fromEntries(signature.map((k, i) => [k || `col${i}`, r[i]])));
}
