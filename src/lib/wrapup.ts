// After the call: summary + every promise made becomes a Triggerware trigger that watches live
// data for its fulfilment ("Promise Keeper"). When the data changes, the customer is updated.
import { runClaude, S } from "./claude";
import { q } from "./db";
import { uid } from "./bus";
import { registerPromiseTrigger } from "./signals";
import { tsLit } from "./time";
import { SCHEMA_DOC, SQL_RULES } from "./schema";
import type { CopilotState, TranscriptLine } from "./copilot";

export interface WrapupResult {
  callId: string;
  summary: string;
  root_cause: string;
  resolution: string;
  sentiment_end: string;
  ticket_note: string;
  promises: { id: string; text: string; kind: string; owner: string; due_hours: number; watch_sql: string; trigger?: string; error?: string }[];
}

export async function wrapUp(input: { customerId: string; customerName: string; agent: string; transcript: TranscriptLine[]; copilot?: CopilotState | null; actions: string[] }): Promise<WrapupResult> {
  const now = new Date();
  const out = await runClaude<Omit<WrapupResult, "callId" | "promises"> & { promises: Omit<WrapupResult["promises"][number], "id" | "trigger">[] }>({
    system: [{ type: "text", text: `You close out support calls at Orbit. Produce a crisp summary and extract EVERY commitment the agent made to the customer.
For each promise, write watch_sql: a SELECT that returns NEW rows only once the promise is fulfilled (Triggerware will watch it and
fire when rows are added). Rows existing right now are the baseline and won't fire. Examples:
- refund issued: SELECT t1.id, t1.amount FROM refunds t1 WHERE t1.customer_id = '<id>'
- fix shipped: SELECT t1.id, t1.version FROM deploys t1 WHERE t1.service = 'auth-service' AND t1.created_at >= ${tsLit(now)}
- incident resolved: SELECT t1.id, t1.status FROM incidents t1 WHERE t1.status = 'resolved' AND t1.started_at >= ${tsLit(new Date(now.getTime() - 86400000))}
Statements like "I'll update you when it's fixed", "you'll get the refund", "I'll call you back" are ALL promises: include each one.
Use an empty string for promises that can't be verified from data.

Tables:\n${SCHEMA_DOC}\n\n${SQL_RULES}` }],
    prompt: JSON.stringify({ now: now.toISOString(), customer_id: input.customerId, customer: input.customerName, agent: input.agent, transcript: input.transcript, copilot_findings: input.copilot, actions_taken: input.actions }),
    schema: S.obj({
      summary: S.str(),
      root_cause: S.str(),
      resolution: S.str(),
      sentiment_end: S.enum(["calm", "concerned", "frustrated", "angry", "relieved"]),
      ticket_note: S.str(),
      promises: S.arr(S.obj({ text: S.str(), kind: S.enum(["refund", "fix", "callback", "other"]), owner: S.str(), due_hours: S.num(), watch_sql: S.str() })),
    }),
    effort: "low",
    maxTokens: 4000,
  });

  const callId = uid("call_");
  await q("INSERT INTO calls (id, customer_id, agent, started_at, ended_at, summary, sentiment) VALUES ($1,$2,$3,$4,$4,$5,$6)", [callId, input.customerId, input.agent, now.toISOString(), out.summary, out.sentiment_end]);

  const promises: WrapupResult["promises"] = [];
  for (const p of out.promises) {
    const id = uid("pr_");
    const due = new Date(now.getTime() + Math.max(1, p.due_hours) * 3600_000).toISOString();
    let sql = /^\s*select\b/i.test(p.watch_sql) ? p.watch_sql.trim().replace(/;$/, "") : "";
    // Defaults when the model couldn't express the promise as SQL.
    if (!sql && (p.kind === "fix" || /fix|roll(ed)? ?back|resolv|update you/i.test(p.text)))
      sql = `SELECT t1.id, t1.version FROM deploys t1 WHERE t1.service = 'auth-service' AND t1.created_at >= ${tsLit(now)}`;
    if (!sql && (p.kind === "refund" || /refund/i.test(p.text)))
      sql = `SELECT t1.id, t1.amount FROM refunds t1 WHERE t1.customer_id = '${input.customerId}' AND t1.created_at >= ${tsLit(now)}`;
    let trigger: string | undefined;
    let error: string | undefined;
    if (sql) {
      try {
        trigger = (await registerPromiseTrigger({ promiseId: id, customerId: input.customerId, text: p.text, sql })).name;
      } catch (e) {
        error = String((e as Error).message);
      }
    }
    await q("INSERT INTO call_promises (id, customer_id, call_id, text, kind, owner, due_at, status, trigger_name, watch_sql, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'open',$8,$9,$10)",
      [id, input.customerId, callId, p.text, p.kind, p.owner, due, trigger || null, sql || null, now.toISOString()]);
    promises.push({ ...p, id, watch_sql: sql, trigger, error });
  }
  return { callId, ...out, promises };
}
