import { config } from "./config";

// Human/LLM-readable description of the live tables Triggerware exposes.
export const SCHEMA_DOC = `
customers(id, name, plan, arr, region, csm, sso_provider, health, renewal_date)
contacts(id, customer_id, name, email, role, phone)
employees(id, name, email, team, role, on_call)            -- on_call is 0/1
tickets(id, customer_id, subject, priority 'P1'..'P4', status 'open'|'closed', category, assignee, created_at, resolved_at, resolution)
login_events(id, customer_id, user_email, success 0/1, error_code, created_at)
deploys(id, service, version, author, notes, created_at)
incidents(id, title, severity, status 'investigating'|'resolved', service, commander, started_at, resolved_at)
invoices(id, customer_id, amount, status, issued_at, due_at)
payments(id, invoice_id, customer_id, amount, status 'succeeded'|'failed', failure_reason, created_at)
credits(id, customer_id, amount, reason, approved_by, created_at)
refunds(id, customer_id, payment_id, amount, reason, issued_by, created_at)
usage_daily(customer_id, day, active_users, shipments_created)
calls(id, customer_id, agent, started_at, ended_at, summary, sentiment)
call_promises(id, customer_id, call_id, text, kind, owner, due_at, status, created_at, kept_at)
tenant_flags(customer_id, flag, value, set_by, created_at)
`.trim();

export const SQL_RULES = `
SQL rules (Triggerware dialect — STRICT): read-only SELECT. Alias tables t1, t2, ... and qualify every column (t1.id).
Join with comma-separated tables + WHERE equality (the JOIN keyword is NOT supported). Supported: comparisons (=, <, >, <=, >=, <>),
AND, OR, IS NULL, IS NOT NULL, arithmetic, GROUP BY, HAVING, ORDER BY, COUNT/SUM/AVG/MIN/MAX. NOT supported: LIMIT, IN, LIKE,
BETWEEN, NOT, CAST, TIMESTAMP literals, subqueries, window or scalar functions (no NOW(), LOWER(), DATE_TRUNC...).
All *_at columns are ISO-8601 UTC strings like '2026-01-15T09:00:00.000Z' — filter time ranges by comparing with a string in
exactly that format: t1.created_at >= '2026-01-15T09:00:00.000Z'. usage_daily.day and customers.renewal_date are 'YYYY-MM-DD'
strings. Flags like success/on_call are 0/1 numbers. No trailing semicolon.
`.trim();

export const TABLE_COLUMNS: Record<string, [string, "number" | "string" | "ts"][]> = {
  customers: [["id", "string"], ["name", "string"], ["plan", "string"], ["arr", "number"], ["region", "string"], ["csm", "string"], ["sso_provider", "string"], ["health", "number"], ["renewal_date", "string"]],
  contacts: [["id", "string"], ["customer_id", "string"], ["name", "string"], ["email", "string"], ["role", "string"], ["phone", "string"]],
  employees: [["id", "string"], ["name", "string"], ["email", "string"], ["team", "string"], ["role", "string"], ["on_call", "number"]],
  tickets: [["id", "string"], ["customer_id", "string"], ["subject", "string"], ["priority", "string"], ["status", "string"], ["category", "string"], ["assignee", "string"], ["created_at", "ts"], ["resolved_at", "ts"], ["resolution", "string"]],
  login_events: [["id", "number"], ["customer_id", "string"], ["user_email", "string"], ["success", "number"], ["error_code", "string"], ["created_at", "ts"]],
  deploys: [["id", "string"], ["service", "string"], ["version", "string"], ["author", "string"], ["notes", "string"], ["created_at", "ts"]],
  incidents: [["id", "string"], ["title", "string"], ["severity", "string"], ["status", "string"], ["service", "string"], ["commander", "string"], ["started_at", "ts"], ["resolved_at", "ts"]],
  invoices: [["id", "string"], ["customer_id", "string"], ["amount", "number"], ["status", "string"], ["issued_at", "ts"], ["due_at", "ts"]],
  payments: [["id", "string"], ["invoice_id", "string"], ["customer_id", "string"], ["amount", "number"], ["status", "string"], ["failure_reason", "string"], ["created_at", "ts"]],
  credits: [["id", "string"], ["customer_id", "string"], ["amount", "number"], ["reason", "string"], ["approved_by", "string"], ["created_at", "ts"]],
  refunds: [["id", "string"], ["customer_id", "string"], ["payment_id", "string"], ["amount", "number"], ["reason", "string"], ["issued_by", "string"], ["created_at", "ts"]],
  usage_daily: [["customer_id", "string"], ["day", "string"], ["active_users", "number"], ["shipments_created", "number"]],
  calls: [["id", "string"], ["customer_id", "string"], ["agent", "string"], ["started_at", "ts"], ["ended_at", "ts"], ["summary", "string"], ["sentiment", "string"]],
  call_promises: [["id", "string"], ["customer_id", "string"], ["call_id", "string"], ["text", "string"], ["kind", "string"], ["owner", "string"], ["due_at", "ts"], ["status", "string"], ["trigger_name", "string"], ["watch_sql", "string"], ["created_at", "ts"], ["kept_at", "ts"]],
  tenant_flags: [["customer_id", "string"], ["flag", "string"], ["value", "string"], ["set_by", "string"], ["created_at", "ts"]],
};
export const TABLES = Object.keys(TABLE_COLUMNS);

// Live mode: rewrites bare table names to the names registered in Triggerware (prefix) and removes
// LIMIT clauses (Triggerware applies limits itself).
export function toTriggerwareSql(sql: string) {
  const p = config.triggerware.tablePrefix;
  let out = sql.replace(/\s+LIMIT\s+\d+\s*$/i, "").replace(/;\s*$/, "");
  if (p) out = out.replace(new RegExp(`(?<![\\w.'])(${TABLES.join("|")})(?![\\w'])`, "g"), `${p}$1`);
  return out;
}
