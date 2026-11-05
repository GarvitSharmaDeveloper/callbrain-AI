// One-click actions from the copilot, plus Director (demo control) steps. Every action writes to
// Orbit's database; Triggerware triggers watching those tables pick the change up and fire.
import { emit, signalLog } from "./bus";
import { getDb, q } from "./db";
import { scenarioBreakSso, scenarioRefund, scenarioRollback, seedBaseline } from "./seed";
import { resetSignals } from "./signals";
import { tw, rowsToObjects } from "./triggerware";
import { minutesAgo, tsLit } from "./time";

export async function runAction(kind: string, customerId: string, detail = "") {
  const now = new Date().toISOString();
  switch (kind) {
    case "declare_incident": {
      const open = await q<{ id: string }>("SELECT id FROM incidents WHERE status <> 'resolved'");
      if (open.length) return { ok: true, message: `Linked to existing incident ${open[0].id}` };
      await q("INSERT INTO incidents (id, title, severity, status, service, commander, started_at) VALUES ('INC-2041', $1, 'SEV2', 'investigating', 'auth-service', 'Leo Park', $2)",
        ["SSO logins failing for Okta tenants (SAML_ASSERTION_EXPIRED)", now]);
      return { ok: true, message: "Declared INC-2041 (SEV2). Identity on-call Leo Park paged. Customer ticket linked." };
    }
    case "apply_tenant_flag": {
      await q("INSERT INTO tenant_flags (customer_id, flag, value, set_by, created_at) VALUES ($1, 'saml_skew_override', '300', 'CallBrain', $2)", [customerId, now]);
      await q("INSERT INTO login_events (customer_id, user_email, success, error_code, created_at) SELECT $1, 'dispatcher' || g || '@tenant.com', 1, NULL, $2::timestamptz FROM generate_series(1, 8) g", [customerId, now]);
      // Verify the workaround with a live Triggerware query.
      const r = await tw.query(`SELECT t1.success, COUNT(t1.id) AS n FROM login_events t1 WHERE t1.customer_id = '${customerId}' AND t1.created_at >= ${tsLit(minutesAgo(1))} GROUP BY t1.success`, { language: "sql", label: "Verify workaround: logins in the last minute" });
      const rows = rowsToObjects(r.signature, r.rows);
      const ok = rows.find((x) => Number(x.success) === 1)?.n ?? 0;
      return { ok: true, message: `Applied saml_skew_override=300. Triggerware confirms ${ok} successful logins in the last minute.` };
    }
    case "page_expert":
      emit({ type: "demo", data: { message: `Paged with full call context: ${detail || "Identity on-call"}` } });
      return { ok: true, message: `Paged ${detail || "the owner"} with the call context and live evidence.` };
    case "request_refund":
      return { ok: true, message: "Refund request filed with Billing Ops (Refund Policy §2 — no approval needed). It'll be tracked as a promise at wrap-up." };
    default:
      return { ok: false, message: `Unknown action ${kind}` };
  }
}

export async function runDirector(step: string) {
  const db = await getDb();
  switch (step) {
    case "reset":
      await seedBaseline(db);
      await resetSignals();
      return "Demo data reset. Triggers re-registered with Triggerware.";
    case "break_sso":
      await scenarioBreakSso(db);
      return "auth-service v4.12.0 deployed → Okta logins failing, P1 tickets arriving, Bluebird double-charged.";
    case "refund":
      await scenarioRefund(db);
      return "Billing Ops issued Bluebird's refund.";
    case "rollback":
      await scenarioRollback(db);
      return "Identity rolled back auth-service (v4.12.1). Logins recovering.";
    default:
      throw new Error(`Unknown step ${step}`);
  }
}

// ---------------------------------------------------------------------------------------------
// Control Room: granular data changes. Each returns a narrated change record; the UI then watches
// for the Triggerware trigger(s) that should detect it and shows the detection latency.
// ---------------------------------------------------------------------------------------------
export interface ChangeRecord {
  id: string;
  at: string;
  action: string;
  title: string;
  explanation: string;
  table: string;
  rows: Record<string, unknown>[];
  expect: string[];
}

const nameOf = async (id: string) => (await q<{ name: string }>("SELECT name FROM customers WHERE id = $1", [id]))[0]?.name || id;

export async function runControl(action: string, p: Record<string, string | number>): Promise<ChangeRecord> {
  const db = await getDb();
  const now = new Date();
  const iso = now.toISOString();
  const base = { id: `chg_${now.getTime()}`, at: iso, action };
  const cust = String(p.customerId || "cust_bluebird");

  switch (action) {
    case "login_burst": {
      const n = Math.min(80, Math.max(1, Number(p.count || 12)));
      const code = String(p.errorCode || "SAML_ASSERTION_EXPIRED");
      const rows = Array.from({ length: n }, (_, k) => ({ customer_id: cust, user_email: `dispatcher${k}@tenant.com`, success: 0, error_code: code, created_at: new Date(now.getTime() - k * 7000).toISOString() }));
      for (const r of rows) await q("INSERT INTO login_events (customer_id, user_email, success, error_code, created_at) VALUES ($1,$2,$3,$4,$5)", [r.customer_id, r.user_email, r.success, r.error_code, r.created_at]);
      return { ...base, title: `${n} failed logins at ${await nameOf(cust)}`, explanation: `Inserted ${n} rows into login_events with error ${code}. The trigger cb_auth_failure_spike groups failures per customer in the last hour; at 5+ it crosses the threshold and Triggerware pushes the new row.`, table: "login_events", rows: rows.slice(0, 5), expect: ["cb_auth_failure_spike"] };
    }
    case "p1_ticket": {
      const id = `T-${6000 + Math.floor(Math.random() * 3000)}`;
      const subject = String(p.subject || "Dispatch board not loading for all users");
      const row = { id, customer_id: cust, subject, priority: "P1", status: "open", category: "dispatch", created_at: iso };
      await q("INSERT INTO tickets (id, customer_id, subject, priority, status, category, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)", [row.id, row.customer_id, row.subject, row.priority, row.status, row.category, row.created_at]);
      return { ...base, title: `${await nameOf(cust)} opened P1 ${id}`, explanation: "Inserted one open P1 row into tickets. The trigger cb_p1_tickets watches open P1s; the new row appears in its result set, so Triggerware pushes it as an added delta.", table: "tickets", rows: [row], expect: ["cb_p1_tickets"] };
    }
    case "deploy": {
      const service = String(p.service || "dispatch-ui");
      const row = { id: `dep_${now.getTime() % 1e7}`, service, version: String(p.version || `v3.${Math.floor(Math.random() * 40)}.0`), author: String(p.author || "Jordan Lee"), notes: String(p.notes || "Routine release"), created_at: iso };
      await q("INSERT INTO deploys (id, service, version, author, notes, created_at) VALUES ($1,$2,$3,$4,$5,$6)", [row.id, row.service, row.version, row.author, row.notes, row.created_at]);
      return { ...base, title: `Deployed ${service} ${row.version}`, explanation: "Inserted a row into deploys. The trigger cb_deploys sees a new row and Triggerware pushes it; the copilot uses deploy history to explain new errors.", table: "deploys", rows: [row], expect: ["cb_deploys"] };
    }
    case "double_charge": {
      const inv = (await q<{ id: string; amount: string }>("SELECT id, amount FROM invoices WHERE customer_id = $1 ORDER BY issued_at DESC LIMIT 1", [cust]))[0];
      if (!inv) throw new Error("No invoice for that customer");
      const rows = [0, 1].map((k) => ({ id: `pay_x${now.getTime() % 1e7}_${k}`, invoice_id: inv.id, customer_id: cust, amount: Number(inv.amount), status: "succeeded", created_at: new Date(now.getTime() + k * 1000).toISOString() }));
      for (const r of rows) await q("INSERT INTO payments (id, invoice_id, customer_id, amount, status, created_at) VALUES ($1,$2,$3,$4,$5,$6)", [r.id, r.invoice_id, r.customer_id, r.amount, r.status, r.created_at]);
      return { ...base, title: `Payment retry double-charged ${await nameOf(cust)}`, explanation: `Inserted 2 successful payments for invoice ${inv.id}. cb_duplicate_charges groups successful payments per invoice and fires when an invoice has more than one.`, table: "payments", rows, expect: ["cb_duplicate_charges"] };
    }
    case "refund": {
      const payRow = (await q<{ id: string; amount: string }>("SELECT id, amount FROM payments WHERE customer_id = $1 AND status = 'succeeded' ORDER BY created_at DESC LIMIT 1", [cust]))[0];
      const row = { id: `rf_${now.getTime() % 1e7}`, customer_id: cust, payment_id: payRow?.id || "n/a", amount: Number(payRow?.amount || 0), reason: "Duplicate charge (payment retry)", issued_by: "Ana Gomez", created_at: iso };
      await q("INSERT INTO refunds (id, customer_id, payment_id, amount, reason, issued_by, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)", [row.id, row.customer_id, row.payment_id, row.amount, row.reason, row.issued_by, row.created_at]);
      return { ...base, title: `Refund issued to ${await nameOf(cust)}`, explanation: "Inserted into refunds. cb_refunds fires, and any promise trigger watching refunds for this customer fires too: the promise is marked kept and the customer is notified.", table: "refunds", rows: [row], expect: ["cb_refunds", "cb_promise_"] };
    }
    case "incident_declare": {
      const r = await runAction("declare_incident", cust);
      return { ...base, title: "Incident declared", explanation: `${r.message} cb_incidents watches the incidents table.`, table: "incidents", rows: await q("SELECT id, title, severity, status FROM incidents WHERE status <> 'resolved'"), expect: ["cb_incidents"] };
    }
    case "scenario_break": {
      await scenarioBreakSso(db, now);
      return { ...base, title: "Bad deploy: auth-service v4.12.0", explanation: "Inserted a deploy, ~200 failed SSO logins across 13 Okta customers, 4 tickets (3 P1), a duplicate payment and a usage drop. Watch four independent triggers detect it.", table: "deploys, login_events, tickets, payments", rows: [{ deploy: "auth-service v4.12.0", failed_logins: "~200", p1_tickets: 3, duplicate_payment: "Bluebird INV-8800" }], expect: ["cb_deploys", "cb_auth_failure_spike", "cb_p1_tickets", "cb_duplicate_charges"] };
    }
    case "scenario_rollback": {
      await scenarioRollback(db, now);
      return { ...base, title: "Rollback: auth-service v4.12.1", explanation: "Inserted the fix deploy, resolved open incidents and added successful logins. Promise triggers watching for the fix fire.", table: "deploys, incidents, login_events", rows: [{ deploy: "auth-service v4.12.1", incidents: "resolved" }], expect: ["cb_deploys", "cb_incidents", "cb_promise_"] };
    }
    case "reset": {
      signalLog.length = 0;
      await seedBaseline(db, now);
      await resetSignals();
      return { ...base, title: "Demo data reset", explanation: "Re-seeded Orbit's database (40 customers, 24h of logins, 60 days of tickets, 3 months of billing) and re-registered every trigger with Triggerware.", table: "all", rows: [], expect: [] };
    }
    default:
      throw new Error(`Unknown control action ${action}`);
  }
}
