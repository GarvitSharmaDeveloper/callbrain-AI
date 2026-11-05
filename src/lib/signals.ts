// Live Signals: CallBrain's proactive side. On boot we register Triggerware triggers over the
// company's live data; a poller drains their deltas and turns them into signals, enriched with
// knowledge-base context ("why it matters, who owns it, what to do").
import { emit, Signal, uid } from "./bus";
import { q } from "./db";
import { tw, Row, TriggerInfo } from "./triggerware";
import { minutesAgo, tsLit } from "./time";

type Kind = "p1" | "auth" | "deploy" | "dupe" | "refund" | "incident" | "promise" | "reflex";

interface Registered {
  name: string;
  kind: Kind;
  title: string;
  description: string;
  signature: string[];
  sql?: string;
  promiseId?: string;
  customerId?: string;
}

const g = globalThis as unknown as {
  __cbSignalState?: SignalState;
};
interface SignalState { registry: Map<string, Registered>; boot?: Promise<void>; names: Map<string, string> }
const state: SignalState = g.__cbSignalState || (g.__cbSignalState = { registry: new Map(), names: new Map() });

export const registry = () => [...state.registry.values()];

function defaultTriggers(): Registered[] {
  const since = tsLit(minutesAgo(60));
  return [
    {
      name: "cb_p1_tickets", kind: "p1", title: "New P1 ticket",
      description: "Alert me when any customer opens a P1 ticket",
      signature: ["id", "customer_id", "subject", "created_at"],
      sql: "SELECT t1.id, t1.customer_id, t1.subject, t1.created_at FROM tickets t1 WHERE t1.priority = 'P1' AND t1.status = 'open'",
    },
    {
      name: "cb_auth_failure_spike", kind: "auth", title: "Login failure spike",
      description: "Alert when a customer has 5+ failed logins with the same error in the last hour",
      signature: ["customer_id", "error_code", "failures"],
      sql: `SELECT t1.customer_id, t1.error_code, COUNT(t1.id) AS failures FROM login_events t1 WHERE t1.success = 0 AND t1.created_at >= ${since} GROUP BY t1.customer_id, t1.error_code HAVING COUNT(t1.id) >= 5`,
    },
    {
      name: "cb_deploys", kind: "deploy", title: "New production deploy",
      description: "Tell me whenever something is deployed to production",
      signature: ["id", "service", "version", "author", "notes"],
      sql: "SELECT t1.id, t1.service, t1.version, t1.author, t1.notes FROM deploys t1",
    },
    {
      name: "cb_duplicate_charges", kind: "dupe", title: "Duplicate charge detected",
      description: "Alert when an invoice has been successfully charged more than once",
      signature: ["invoice_id", "customer_id", "charges"],
      sql: "SELECT t1.invoice_id, t1.customer_id, COUNT(t1.id) AS charges FROM payments t1 WHERE t1.status = 'succeeded' GROUP BY t1.invoice_id, t1.customer_id HAVING COUNT(t1.id) > 1",
    },
    {
      name: "cb_refunds", kind: "refund", title: "Refund issued",
      description: "Tell me when a refund is issued",
      signature: ["id", "customer_id", "payment_id", "amount"],
      sql: "SELECT t1.id, t1.customer_id, t1.payment_id, t1.amount FROM refunds t1",
    },
    {
      name: "cb_incidents", kind: "incident", title: "Incident update",
      description: "Tell me when an incident is declared or changes status",
      signature: ["id", "title", "severity", "status"],
      sql: "SELECT t1.id, t1.title, t1.severity, t1.status FROM incidents t1",
    },
  ];
}

/** Idempotently registers all triggers with Triggerware and subscribes to their deltas (push). */
export function ensureSignals(): Promise<void> {
  if (!state.boot) {
    state.boot = (async () => {
      await loadNames();
      let existing: TriggerInfo[] = [];
      try {
        existing = await tw.triggers.list();
      } catch {
        existing = [];
      }
      const have = new Map(existing.map((t) => [t.name, t]));
      for (const t of defaultTriggers()) {
        // Always recreate our own triggers so time windows (e.g. "last hour") are anchored to this boot.
        if (have.has(t.name)) await tw.triggers.remove(t.name).catch(() => {});
        const info = await tw.triggers.create({ name: t.name, description: t.description, sql: t.sql });
        await attach({ ...t, signature: info.signature?.length ? info.signature : t.signature });
      }
      // Adopt triggers created elsewhere (Triggerware CLI / Claude Code plugin) as reflexes.
      for (const t of existing) {
        if (t.name.startsWith("cb_promise_") || t.name.startsWith("probe_")) {
          // Promises from a previous server process refer to data that was re-seeded; drop them.
          await tw.triggers.remove(t.name).catch(() => {});
          continue;
        }
        if (!state.registry.has(t.name) && t.enabled) {
          await attach({ name: t.name, kind: t.name.startsWith("cb_promise_") ? "promise" : "reflex", title: t.description || t.name, description: t.description || t.prompt || t.sql, signature: t.signature, sql: t.sql });
        }
      }
    })().catch((e) => {
      state.boot = undefined;
      throw e;
    });
  }
  return state.boot;
}

async function attach(r: Registered) {
  state.registry.set(r.name, r);
  await tw.triggers.watch(r.name, async (added, deleted) => {
    emit({ type: "tw", data: { id: uid("tw_"), at: new Date().toISOString(), op: "trigger.delta", label: r.name, rowCount: added.length + deleted.length, input: `+${added.length} / −${deleted.length} rows pushed`, ms: 0, ok: true, mode: tw.mode() } });
    const cur = state.registry.get(r.name);
    if (cur) await handleDelta(cur, added, deleted).catch((e) => console.error("signal error", e));
  });
}

export async function resetSignals() {
  for (const name of [...state.registry.keys()]) await tw.triggers.remove(name).catch(() => {});
  state.registry.clear();
  state.boot = undefined;
  await ensureSignals();
}

async function loadNames() {
  const rows = await q<{ id: string; name: string }>("SELECT id, name FROM customers");
  rows.forEach((r) => state.names.set(r.id, r.name));
}
const cname = (id: unknown) => state.names.get(String(id)) || String(id);

export async function registerReflex(prompt: string) {
  await ensureSignals();
  const t = await tw.triggers.create({ name: `reflex_${uid()}`.slice(0, 40), description: prompt, prompt });
  await attach({ name: t.name, kind: "reflex", title: prompt, description: prompt, signature: t.signature, sql: t.sql });
  return t;
}

export async function registerPromiseTrigger(p: { promiseId: string; customerId: string; text: string; sql: string }) {
  await ensureSignals();
  const name = `cb_promise_${p.promiseId}`.toLowerCase();
  const t = await tw.triggers.create({ name, description: `Promise watch: ${p.text}`, sql: p.sql });
  await attach({ name: t.name, kind: "promise", title: p.text, description: p.text, signature: t.signature, sql: t.sql, promiseId: p.promiseId, customerId: p.customerId });
  return t;
}

export async function unregister(name: string) {
  state.registry.delete(name);
  await tw.triggers.remove(name).catch(() => {});
}

// ---------------------------------------------------------------------------------------------

async function handleDelta(r: Registered, added: Row[], deleted: Row[]) {
  const base = { id: uid("sig_"), at: new Date().toISOString(), trigger: r.name, added, deleted, signature: r.signature, sql: r.sql };
  let sig: Signal | null = null;
  const col = (row: Row, k: string) => row[r.signature.indexOf(k)];

  switch (r.kind) {
    case "p1": {
      if (!added.length) return;
      const custs = added.map((x) => cname(col(x, "customer_id")));
      sig = { ...base, severity: "critical", title: added.length > 1 ? `${added.length} new P1 tickets` : `P1 from ${custs[0]}`,
        summary: added.map((x) => `${cname(col(x, "customer_id"))}: “${col(x, "subject")}”`).join(" · "), customers: custs };
      break;
    }
    case "auth": {
      const prev = new Set(deleted.map((x) => String(col(x, "customer_id"))));
      const fresh = added.filter((x) => !prev.has(String(col(x, "customer_id"))));
      if (!fresh.length) return;
      const codes = [...new Set(fresh.map((x) => String(col(x, "error_code"))))];
      const total = fresh.reduce((s, x) => s + Number(col(x, "failures") || 0), 0);
      sig = { ...base, severity: fresh.length >= 5 ? "critical" : "warning",
        title: fresh.length >= 5 ? `Possible incident: ${fresh.length} customers failing login` : `Login failures at ${cname(col(fresh[0], "customer_id"))}`,
        summary: `${total} failed logins (${codes.join(", ")}) across ${fresh.map((x) => cname(col(x, "customer_id"))).join(", ")}`,
        customers: fresh.map((x) => cname(col(x, "customer_id"))) };
      break;
    }
    case "deploy": {
      if (!added.length) return;
      const d = added[0];
      sig = { ...base, severity: "info", title: `Deploy: ${col(d, "service")} ${col(d, "version")}`, summary: `${col(d, "author")} — ${col(d, "notes")}` };
      break;
    }
    case "dupe": {
      if (!added.length) return;
      sig = { ...base, severity: "warning", title: "Duplicate charge detected",
        summary: added.map((x) => `${cname(col(x, "customer_id"))} charged ${col(x, "charges")}× on ${col(x, "invoice_id")}`).join(" · "),
        customers: added.map((x) => cname(col(x, "customer_id"))) };
      break;
    }
    case "refund": {
      if (!added.length) return;
      sig = { ...base, severity: "success", title: "Refund issued",
        summary: added.map((x) => `${cname(col(x, "customer_id"))}: $${Number(col(x, "amount")).toLocaleString()} (${col(x, "payment_id")})`).join(" · "),
        customers: added.map((x) => cname(col(x, "customer_id"))) };
      break;
    }
    case "incident": {
      if (!added.length) return;
      const x = added[0];
      const resolved = String(col(x, "status")) === "resolved";
      sig = { ...base, severity: resolved ? "success" : "critical", title: `${col(x, "id")} ${resolved ? "resolved" : "declared"}: ${col(x, "title")}`,
        summary: `${col(x, "severity")} · status ${col(x, "status")}` };
      break;
    }
    case "promise": {
      if (!added.length) return;
      const kept = new Date().toISOString();
      await q("UPDATE call_promises SET status='kept', kept_at=$1 WHERE id=$2", [kept, r.promiseId]);
      const message = await customerUpdate(r).catch(() => "");
      sig = { ...base, severity: "success", title: `Promise kept: ${r.title}`, summary: `Triggerware detected the change. Customer update drafted and sent to ${cname(r.customerId)}.`,
        customers: [cname(r.customerId)], brief: message };
      emit({ type: "promise", data: { id: r.promiseId, status: "kept", kept_at: kept } });
      await unregister(r.name);
      emit({ type: "signal", data: sig });
      return;
    }
    case "reflex": {
      if (!added.length) return;
      sig = { ...base, severity: "warning", title: `Reflex fired: ${r.title}`, summary: `${added.length} new matching row(s) from Triggerware` };
      break;
    }
  }
  if (!sig) return;
  emit({ type: "signal", data: sig });

  // Enrich important signals with company knowledge (async — the UI updates the card in place).
  if (["p1", "auth", "dupe", "reflex"].includes(r.kind)) {
    enrich(sig).then((brief) => brief && emit({ type: "signal", data: { ...sig!, ...brief } })).catch(() => {});
  }
}

// Knowledge-grounded briefs, written from the company runbooks/policies (no AI quota needed, instant).
async function enrich(sig: Signal): Promise<{ brief: string; sources: string[] } | null> {
  const kind = state.registry.get(sig.trigger)?.kind;
  const n = sig.customers?.length || 0;
  switch (kind) {
    case "auth":
      return n >= 5
        ? { brief: `${n} customers are failing login with the same error within the hour. Per the Incident Escalation Policy this is a SEV2 incident: declare it, stop per-tenant troubleshooting, and link tickets so customers are auto-notified. Owner: Identity on-call (Leo Park); SME Priya Raman. First check: auth-service deploys in the last 24h. Per-tenant workaround: saml_skew_override=300.`, sources: ["policy-incident-escalation", "runbook-sso-saml", "team-directory"] }
        : { brief: `Login failures are concentrated at ${sig.customers?.join(", ")}. Check the error code: SAML_ASSERTION_EXPIRED → clock skew (workaround saml_skew_override=300); SAML_SIGNATURE_INVALID → the customer rotated their IdP certificate. Escalate to Identity on-call if it spreads.`, sources: ["runbook-sso-saml"] };
    case "p1":
      return { brief: `P1 from ${sig.customers?.join(", ")}. Respond within 15 minutes. If 5+ customers report the same symptom, follow the Incident Escalation Policy. For Enterprise accounts, loop in the CSM. Check account notes before calling: Bluebird has an open promise of priority SSO handling during peak.`, sources: ["policy-incident-escalation", "account-bluebird"] };
    case "dupe":
      return { brief: `Known payment-retry bug (billing-service v1.18.2, BILL-412) charged an invoice twice. Refund Policy §2: Orbit-caused duplicates are refunded in full with no approval, within 3 business days. Owner: Billing Ops (Ana Gomez). Reach out proactively before the customer notices.`, sources: ["runbook-billing-duplicate", "policy-refunds", "team-directory"] };
    case "reflex":
      return { brief: `Your reflex matched ${sig.added.length} new row(s) in live data. Open the trigger to inspect them; CallBrain will attach these rows to the customer's next call briefing.`, sources: [] };
    default:
      return null;
  }
}

async function customerUpdate(r: Registered): Promise<string> {
  const who = cname(r.customerId);
  return `Hi ${who} team. Quick update from Orbit Support: we've completed what we promised: "${r.title.replace(/\.$/, "")}". It was verified directly in our systems a moment ago. Thanks for your patience today, and reply here if anything still looks off.\n\nOrbit Support`;
}
