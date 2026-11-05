// Pre-call briefing: parallel live lookups through Triggerware + an AI summary grounded in the KB.
import { runClaude, S } from "./claude";
import { kbPrompt } from "./kb";
import { tw, rowsToObjects } from "./triggerware";
import { daysAgo, minutesAgo, tsLit } from "./time";

export interface Briefing {
  customer: Record<string, unknown>;
  stats: { openTickets: number; failedLogins1h: number; succeededLogins1h: number; topError: string | null; duplicateCharge: boolean; creditsLast90d: number; usageToday: number | null; usageAvg: number };
  usage: { day: string; active_users: number }[];
  openTickets: Record<string, unknown>[];
  queries: { label: string; sql: string; rows: number; ms: number }[];
  ai: { headline: string; likely_reason: string; mood: "calm" | "concerned" | "frustrated" | "angry"; risk: "low" | "medium" | "high"; talking_points: string[]; watch_outs: string[]; sources: string[] };
}

export async function buildBriefing(customerId: string): Promise<Briefing> {
  const id = customerId.replace(/'/g, "");
  const lookups: [string, string][] = [
    ["Account profile", `SELECT t1.id, t1.name, t1.plan, t1.arr, t1.region, t1.csm, t1.sso_provider, t1.health, t1.renewal_date FROM customers t1 WHERE t1.id = '${id}'`],
    ["Open tickets", `SELECT t1.id, t1.subject, t1.priority, t1.status, t1.created_at FROM tickets t1 WHERE t1.customer_id = '${id}' AND t1.status = 'open'`],
    ["Logins, last hour", `SELECT t1.success, t1.error_code, COUNT(t1.id) AS n FROM login_events t1 WHERE t1.customer_id = '${id}' AND t1.created_at >= ${tsLit(minutesAgo(60))} GROUP BY t1.success, t1.error_code`],
    ["Payments, last 7 days", `SELECT t1.id, t1.invoice_id, t1.amount, t1.status, t1.failure_reason, t1.created_at FROM payments t1 WHERE t1.customer_id = '${id}' AND t1.created_at >= ${tsLit(daysAgo(7))}`],
    ["Credits history", `SELECT t1.amount, t1.reason, t1.approved_by, t1.created_at FROM credits t1 WHERE t1.customer_id = '${id}'`],
    ["Usage trend", `SELECT t1.day, t1.active_users FROM usage_daily t1 WHERE t1.customer_id = '${id}' AND t1.day >= '${daysAgo(8).toISOString().slice(0, 10)}' ORDER BY t1.day`],
    ["Open promises", `SELECT t1.text, t1.status, t1.owner, t1.due_at FROM call_promises t1 WHERE t1.customer_id = '${id}' AND t1.status = 'open'`],
  ];
  const results = await Promise.all(lookups.map(([label, sql]) => tw.query(sql, { language: "sql", label })));
  const [profile, tickets, logins, payments, credits, usage, promises] = results.map((r) => rowsToObjects(r.signature, r.rows));

  const failed = logins.filter((l) => Number(l.success) === 0);
  const failedCount = failed.reduce((s, l) => s + Number(l.n), 0);
  const okCount = logins.filter((l) => Number(l.success) === 1).reduce((s, l) => s + Number(l.n), 0);
  const topError = failed.sort((a, b) => Number(b.n) - Number(a.n))[0]?.error_code as string | undefined;
  const byInvoice = new Map<string, number>();
  payments.filter((p) => p.status === "succeeded").forEach((p) => byInvoice.set(String(p.invoice_id), (byInvoice.get(String(p.invoice_id)) || 0) + 1));
  const usageRows = usage.map((u) => ({ day: String(u.day).slice(0, 10), active_users: Number(u.active_users) }));
  const today = new Date().toISOString().slice(0, 10);
  const past = usageRows.filter((u) => u.day !== today);

  const stats = {
    openTickets: tickets.length,
    failedLogins1h: failedCount,
    succeededLogins1h: okCount,
    topError: topError || null,
    duplicateCharge: [...byInvoice.values()].some((n) => n > 1),
    creditsLast90d: credits.filter((c) => new Date(String(c.created_at)) > daysAgo(90)).length,
    usageToday: usageRows.find((u) => u.day === today)?.active_users ?? null,
    usageAvg: past.length ? Math.round(past.reduce((s, u) => s + u.active_users, 0) / past.length) : 0,
  };

  const ai = await runClaude<Briefing["ai"]>({
    system: [{ type: "text", text: `You prepare a support agent for an incoming customer call at Orbit (B2B logistics SaaS) in under 10 seconds of reading. Use the live data and the company knowledge. Be specific with numbers. Cite knowledge doc ids in sources.\n\n<knowledge>\n${kbPrompt()}\n</knowledge>`, cache_control: { type: "ephemeral" } }],
    prompt: JSON.stringify({ now: new Date().toISOString(), profile: profile[0], stats, open_tickets: tickets, payments, credits, open_promises: promises, usage: usageRows }),
    schema: S.obj({
      headline: S.str("One line: who is calling and the situation"),
      likely_reason: S.str("Most likely reason they are calling, with evidence"),
      mood: S.enum(["calm", "concerned", "frustrated", "angry"]),
      risk: S.enum(["low", "medium", "high"]),
      talking_points: S.arr(S.str()),
      watch_outs: S.arr(S.str()),
      sources: S.arr(S.str()),
    }),
    effort: "low",
    maxTokens: 3000,
  });

  return {
    customer: profile[0] || { id },
    stats,
    usage: usageRows,
    openTickets: tickets,
    queries: results.map((r, i) => ({ label: lookups[i][0], sql: r.sql, rows: r.rows.length, ms: r.ms })),
    ai,
  };
}
