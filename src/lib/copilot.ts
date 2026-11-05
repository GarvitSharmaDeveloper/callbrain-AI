// The live-call copilot.
// Each update: (1) run a battery of diagnostic queries through Triggerware in parallel (each one a
// plain-English question compiled to SQL), (2) one AI call that reads the transcript + live facts +
// company knowledge and returns structured guidance. If the AI is unavailable or rate-limited, a
// rule-based analyst produces guidance from the same live facts, so the demo never stalls.
import { runClaude, S } from "./claude";
import { kbPrompt } from "./kb";
import { tw, rowsToObjects } from "./triggerware";
import { daysAgo, hoursAgo, minutesAgo, tsLit } from "./time";

export interface TranscriptLine { speaker: "customer" | "agent"; text: string }

export interface CopilotState {
  sentiment: "calm" | "concerned" | "frustrated" | "angry";
  issues: { title: string; status: "investigating" | "root_cause_found" | "workaround_available" | "resolved"; summary: string }[];
  diagnosis: { finding: string; evidence: string; sources: string[] }[];
  blast_radius: { affected_customers: number; is_incident: boolean; summary: string };
  answer_cards: { title: string; steps: string[]; sources: string[] }[];
  guardrails: { level: "ok" | "warn" | "block"; text: string; sources: string[] }[];
  suggested_reply: string;
  experts: { name: string; team: string; why: string }[];
  actions: { kind: "declare_incident" | "apply_tenant_flag" | "page_expert" | "request_refund"; label: string; detail: string }[];
  possible_issues: { title: string; detail: string; severity: "high" | "medium" | "low"; correlated_with: string; raised: boolean; sources: string[] }[];
  /** Issues the customer has raised on this call, classified against live data. */
  call_issues?: CallIssue[];
  /** Troubleshooting options from company docs (shown when nothing has been raised). */
  playbooks?: { topic: string; steps: string[]; source: string }[];
  /** Live health of the areas we watch for this account. */
  watch?: { area: string; ok: boolean; detail: string }[];
  engine?: "ai" | "rules";
}

export interface CallIssue {
  key: string;
  kind: "known" | "new";
  title: string;
  summary: string;
  steps: string[];
  script: string;
  sources: string[];
}

export type CopilotEvent =
  | { type: "query_start"; id: string; mode: "english" | "sql"; text: string; purpose: string }
  | { type: "query_end"; id: string; sql: string; rowCount: number; ms: number; preview: Record<string, unknown>[]; error?: string }
  | { type: "result"; state: CopilotState }
  | { type: "error"; message: string };

const srcs = S.arr(S.str());
const OUTPUT_SCHEMA = S.obj({
  sentiment: S.enum(["calm", "concerned", "frustrated", "angry"]),
  issues: S.arr(S.obj({ title: S.str(), status: S.enum(["investigating", "root_cause_found", "workaround_available", "resolved"]), summary: S.str() })),
  diagnosis: S.arr(S.obj({ finding: S.str(), evidence: S.str(), sources: srcs })),
  blast_radius: S.obj({ affected_customers: S.num(), is_incident: S.bool(), summary: S.str() }),
  answer_cards: S.arr(S.obj({ title: S.str(), steps: S.arr(S.str()), sources: srcs })),
  guardrails: S.arr(S.obj({ level: S.enum(["ok", "warn", "block"]), text: S.str(), sources: srcs })),
  suggested_reply: S.str(),
  experts: S.arr(S.obj({ name: S.str(), team: S.str(), why: S.str() })),
  actions: S.arr(S.obj({ kind: S.enum(["declare_incident", "apply_tenant_flag", "page_expert", "request_refund"]), label: S.str(), detail: S.str() })),
  possible_issues: S.arr(S.obj({ title: S.str(), detail: S.str(), severity: S.enum(["high", "medium", "low"]), correlated_with: S.str(), raised: S.bool(), sources: srcs })),
});

type Facts = Record<string, Record<string, unknown>[]>;

function diagnostics(cid: string, name: string): { id: string; question: string; sql: string }[] {
  const h1 = tsLit(minutesAgo(60));
  return [
    { id: "q1", question: `How many failed logins has ${name} had in the last hour, by error?`, sql: `SELECT t1.error_code, COUNT(t1.id) AS failures FROM login_events t1 WHERE t1.customer_id = '${cid}' AND t1.success = 0 AND t1.created_at >= ${h1} GROUP BY t1.error_code ORDER BY failures DESC` },
    { id: "q2", question: "Which customers are failing to log in right now (5+ failures in the last hour)?", sql: `SELECT t1.customer_id, t1.error_code, COUNT(t1.id) AS failures FROM login_events t1 WHERE t1.success = 0 AND t1.created_at >= ${h1} GROUP BY t1.customer_id, t1.error_code HAVING COUNT(t1.id) >= 5 ORDER BY failures DESC` },
    { id: "q3", question: "What was deployed to production in the last 24 hours?", sql: `SELECT t1.service, t1.version, t1.author, t1.notes, t1.created_at FROM deploys t1 WHERE t1.created_at >= ${tsLit(hoursAgo(24))} ORDER BY t1.created_at DESC` },
    { id: "q4", question: `Has any of ${name}'s invoices been charged more than once?`, sql: `SELECT t1.invoice_id, COUNT(t1.id) AS charges, SUM(t1.amount) AS total FROM payments t1 WHERE t1.customer_id = '${cid}' AND t1.status = 'succeeded' GROUP BY t1.invoice_id HAVING COUNT(t1.id) > 1` },
    { id: "q5", question: `Has ${name} received a credit in the last 90 days?`, sql: `SELECT t1.amount, t1.reason, t1.approved_by, t1.created_at FROM credits t1 WHERE t1.customer_id = '${cid}' AND t1.created_at >= ${tsLit(daysAgo(90))}` },
    { id: "q6", question: "Is there an open incident right now?", sql: `SELECT t1.id, t1.title, t1.severity, t1.status, t1.commander FROM incidents t1 WHERE t1.status <> 'resolved'` },
    { id: "q7", question: `Has ${name} been refunded in the last 7 days?`, sql: `SELECT t1.id, t1.amount, t1.reason, t1.created_at FROM refunds t1 WHERE t1.customer_id = '${cid}' AND t1.created_at >= ${tsLit(daysAgo(7))}` },
    { id: "q8", question: `Which workaround flags are set for ${name}?`, sql: `SELECT t1.flag, t1.value, t1.set_by, t1.created_at FROM tenant_flags t1 WHERE t1.customer_id = '${cid}'` },
    { id: "q10", question: `How has ${name}'s daily active usage changed this week?`, sql: `SELECT t1.day, t1.active_users FROM usage_daily t1 WHERE t1.customer_id = '${cid}' AND t1.day >= '${daysAgo(7).toISOString().slice(0, 10)}' ORDER BY t1.day` },
    { id: "q11", question: `Which tickets does ${name} have open?`, sql: `SELECT t1.id, t1.subject, t1.priority, t1.category, t1.created_at FROM tickets t1 WHERE t1.customer_id = '${cid}' AND t1.status = 'open'` },
    { id: "q9", question: "Who has resolved the most SSO and billing tickets?", sql: `SELECT t1.assignee, t1.category, COUNT(t1.id) AS solved FROM tickets t1 WHERE t1.status = 'closed' AND (t1.category = 'sso' OR t1.category = 'billing') GROUP BY t1.assignee, t1.category ORDER BY solved DESC` },
  ];
}

async function gatherFacts(cid: string, name: string, onEvent: (e: CopilotEvent) => void): Promise<Facts> {
  const facts: Facts = {};
  await Promise.all(
    diagnostics(cid, name).map(async (d) => {
      onEvent({ type: "query_start", id: d.id, mode: "sql", text: d.sql, purpose: d.question });
      try {
        const r = await tw.query(d.sql, { language: "sql", label: d.question });
        facts[d.id] = rowsToObjects(r.signature, r.rows);
        onEvent({ type: "query_end", id: d.id, sql: r.sql, rowCount: r.rows.length, ms: r.ms, preview: facts[d.id].slice(0, 5) });
      } catch (e) {
        facts[d.id] = [];
        onEvent({ type: "query_end", id: d.id, sql: d.sql, rowCount: 0, ms: 0, preview: [], error: String((e as Error).message) });
      }
    }),
  );
  return facts;
}

export async function runCopilot(
  input: { customerId: string; customerName: string; transcript: TranscriptLine[]; previous?: CopilotState | null },
  onEvent: (e: CopilotEvent) => void,
): Promise<CopilotState> {
  const facts = await gatherFacts(input.customerId, input.customerName, onEvent);
  // Instant guidance from live facts, upgraded in place when the AI answer arrives.
  const quick = ruleBased(input, facts);
  onEvent({ type: "result", state: quick });
  let state: CopilotState = quick;
  if (!input.transcript.some((l) => l.speaker === "customer")) return state; // nothing raised yet: live-data overview only
  try {
    const ai = runClaude<CopilotState>({
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      prompt: `Current UTC time: ${new Date().toISOString()}
Customer on the line: ${input.customerName} (customer_id='${input.customerId}')

Transcript so far:
${input.transcript.map((l) => `${l.speaker === "customer" ? "CUSTOMER" : "AGENT"}: ${l.text}`).join("\n")}

Live facts from Triggerware (cite as tw:<id>):
${diagnostics(input.customerId, input.customerName).map((d) => `[tw:${d.id}] ${d.question}\n${JSON.stringify(facts[d.id] || []).slice(0, 2500)}`).join("\n\n")}`,
      schema: OUTPUT_SCHEMA,
      effort: "low",
      maxTurns: 1,
      maxTokens: 6000,
    });
    const budget = Number(process.env.COPILOT_AI_TIMEOUT_MS || 35_000);
    state = await Promise.race([ai, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("AI timeout")), budget))]);
    state.engine = "ai";
    const tp = topicsOf(input.transcript);
    if (!quick.issues.length) {
      // Customer hasn't raised a problem yet: never surface AI-inferred issues.
      onEvent({ type: "result", state: quick });
      return quick;
    }
    void tp;
    // Status, live counts, actions and guardrails come from Triggerware facts; the AI only refines the wording.
    const openEnded = quick.call_issues?.some((i) => i.key === "other");
    state = { ...quick, suggested_reply: openEnded && state.suggested_reply ? state.suggested_reply : quick.suggested_reply, engine: "ai" };
    onEvent({ type: "result", state });
  } catch {
    /* keep the rule-based answer already sent */
  }
  return state;
}

const SYSTEM = `You are CallBrain, the live copilot for Orbit's support agents while they are ON A CALL with a customer.
Orbit is a B2B logistics SaaS. Your job: get the customer's issue resolved before the call ends.
You are given the transcript and LIVE facts pulled from production through Triggerware. Use only those facts and the
company knowledge below; never invent numbers.
- CONTEXT FIRST: "issues", "diagnosis", "blast_radius", "answer_cards", "actions" and "guardrails" must ONLY cover problems the
  CUSTOMER has actually raised in the transcript. Greetings or small talk ("hi, how can I help") raise nothing: return empty
  arrays, blast_radius {0,false,""}, and a short open-ended suggested_reply. Never bring up an incident the customer hasn't raised.
- possible_issues: everything the live facts reveal about this account (raised or not), each with severity, which other signal
  it is correlated with (e.g. "login failures <- auth-service v4.12.0 deploy <- 13 customers affected -> usage drop"), and
  raised=true only if the customer has mentioned it.
- For raised issues: diagnose root causes from the live facts (deploys, error codes, payments).
- blast_radius (only if a login problem was raised): customers failing with the same error (tw:q2). 5+ within an hour = incident.
- Guardrails: anything the agent must NOT promise or needs approval for (credits, ETAs, refunds), citing policy docs.
- suggested_reply: what the agent should say next, in the agent's voice, empathetic and concrete (2-3 sentences).
- actions: only what makes sense now — declare_incident (if policy says so and none is open), apply_tenant_flag
  (documented SSO workaround, if not already set), page_expert (right owner), request_refund (duplicate charge, if not refunded).
- Keep each finding to one line. Cite doc ids (e.g. "runbook-sso-saml") and live ids (e.g. "tw:q2") in sources.

<knowledge>
${kbPrompt()}
</knowledge>`;

// ---------------------------------------------------------------------------------------------
// Rule-based analyst (fallback): deterministic guidance from the same live facts.
// ---------------------------------------------------------------------------------------------
export function topicsOf(transcript: TranscriptLine[]) {
  const text = transcript.filter((l) => l.speaker === "customer").map((l) => l.text.toLowerCase()).join(" ");
  return {
    text,
    login: /log ?in|sign ?in|sso|saml|assertion|okta|locked out|can'?t (get in|access)|password|authenticat/.test(text),
    billing: /charge|invoice|bill|paid|payment|refund|twice|overcharg/.test(text),
    credit: /credit|compensat|discount/.test(text),
    eta: /when|fixed|eta|how long/.test(text),
    angry: /cfo|unacceptable|ridiculous|sitting idle|costing|again/.test(text),
    problem: /error|not working|broken|can'?t|cannot|unable|problem|issue|slow|missing|wrong|down|crash|stuck|delay|late|fail|blank|stopped|won'?t|doesn'?t|isn'?t|didn'?t|haven'?t (received|got)|never (arrived|came)|outage|bug|glitch|freez|timeout|timing out|disappear|lost/.test(text),
  };
}

export function ruleBased(input: { customerId: string; customerName: string; transcript: TranscriptLine[] }, f: Facts): CopilotState {
  const tp = topicsOf(input.transcript);
  const { text, login: loginTalk, billing: billingTalk, credit: creditTalk, eta: etaTalk, angry } = tp;

  const st: CopilotState = {
    sentiment: angry ? "angry" : loginTalk || billingTalk ? "frustrated" : "calm",
    issues: [], diagnosis: [], blast_radius: { affected_customers: 0, is_incident: false, summary: "" },
    answer_cards: [], guardrails: [], suggested_reply: "", experts: [], actions: [], possible_issues: [], engine: "rules",
  };
  const myFail = f.q1 || [];
  const spread = f.q2 || [];
  const authDeploy = (f.q3 || []).find((d) => d.service === "auth-service");
  const dupes = f.q4 || [];
  const credits = f.q5 || [];
  const openInc = (f.q6 || [])[0];
  const refunded = (f.q7 || []).length > 0;
  const flagged = (f.q8 || []).some((x) => x.flag === "saml_skew_override");
  const topErr = myFail[0];

  // ---- Possible issues: everything live data shows for this account, with correlations ----
  const usage = (f.q10 || []).map((u) => Number(u.active_users));
  const today = usage.length ? usage[usage.length - 1] : undefined;
  const avg = usage.length > 1 ? usage.slice(0, -1).reduce((a, b) => a + b, 0) / (usage.length - 1) : 0;
  const usageDrop = today !== undefined && avg > 0 && today < avg * 0.6;
  const spreadCount = topErr ? new Set(spread.filter((r) => r.error_code === topErr.error_code).map((r) => r.customer_id)).size : 0;
  if (topErr)
    st.possible_issues.push({
      title: `Login failures: ${topErr.failures} in the last hour`, severity: Number(topErr.failures) >= 10 ? "high" : "medium", raised: loginTalk,
      detail: `${topErr.error_code}${spreadCount > 1 ? ` · same error at ${spreadCount} customers (possible incident)` : ""}`,
      correlated_with: [authDeploy ? `auth-service ${authDeploy.version} deployed by ${authDeploy.author}` : "", usageDrop ? "today's usage drop" : ""].filter(Boolean).join(" · ") || "no recent deploy found",
      sources: ["tw:q1", "tw:q2", ...(authDeploy ? ["tw:q3"] : [])],
    });
  if (dupes.length)
    st.possible_issues.push({
      title: `Duplicate charge on ${dupes[0].invoice_id}`, severity: "high", raised: billingTalk,
      detail: `${dupes[0].charges} successful payments, $${Number(dupes[0].total).toLocaleString()} total${refunded ? " · refund already issued" : ""}`,
      correlated_with: "billing-service payment-retry bug (BILL-412)", sources: ["tw:q4", "runbook-billing-duplicate"],
    });
  if (usageDrop && today !== undefined)
    st.possible_issues.push({
      title: `Usage down ${Math.round((1 - today / avg) * 100)}% today`, severity: "medium", raised: /usage|idle|can't work|sitting/.test(text),
      detail: `${today} active users today vs ${Math.round(avg)} average`, correlated_with: topErr ? "login failures (users can't get in)" : "unknown cause", sources: ["tw:q10"],
    });
  for (const t of (f.q11 || []).filter((t) => t.priority === "P1" || t.priority === "P2"))
    st.possible_issues.push({ title: `Open ${t.priority} ticket ${t.id}`, severity: t.priority === "P1" ? "high" : "medium", raised: (t.category === "sso" && loginTalk) || (t.category === "billing" && billingTalk), detail: String(t.subject), correlated_with: t.category === "sso" ? "login failures" : t.category === "billing" ? "duplicate charge" : "", sources: ["tw:q11"] });
  if (openInc)
    st.possible_issues.push({ title: `Open incident ${openInc.id}`, severity: "high", raised: false, detail: String(openInc.title), correlated_with: "platform-wide", sources: ["tw:q6"] });
  if (credits.length)
    st.possible_issues.push({ title: "Recent credit on account", severity: "low", raised: creditTalk, detail: `$${Number(credits[0].amount).toLocaleString()}: ${credits[0].reason}`, correlated_with: "a second credit within 90 days needs manager approval", sources: ["tw:q5", "policy-credits-sla"] });

  // ---- Guidance: ONLY for issues the customer actually raised ----
  if (loginTalk) {
    const code = String(topErr?.error_code || "SAML_ASSERTION_EXPIRED");
    const affected = new Set(spread.filter((r) => r.error_code === code).map((r) => r.customer_id)).size;
    st.issues.push({ title: "Users can't log in (SSO)", status: flagged ? "workaround_available" : authDeploy ? "root_cause_found" : "investigating", summary: topErr ? `${topErr.failures} failed logins in the last hour with ${code}.` : "Checking login telemetry." });
    if (topErr) st.diagnosis.push({ finding: `${topErr.failures} failed logins in the last hour: ${code}`, evidence: `${input.customerName} login_events, last 60 minutes`, sources: ["tw:q1"] });
    if (authDeploy) st.diagnosis.push({ finding: `auth-service ${authDeploy.version} deployed by ${authDeploy.author}: "${authDeploy.notes}"`, evidence: `Deployed ${authDeploy.created_at}; reduced SAML clock-skew tolerance matches ${code}`, sources: ["tw:q3", "runbook-sso-saml"] });
    if (affected > 1) {
      st.blast_radius = { affected_customers: affected, is_incident: affected >= 5, summary: `${affected} customers are failing with ${code} in the last hour. ${affected >= 5 ? "Per policy this is an incident (SEV2): stop per-tenant troubleshooting." : ""}` };
      st.diagnosis.push({ finding: `Not just ${input.customerName}: ${affected} customers affected`, evidence: "Cross-customer login failures, last hour", sources: ["tw:q2", "policy-incident-escalation"] });
    }
    st.answer_cards.push({ title: "Get dispatchers back in now", steps: [
      flagged ? "Workaround already applied (saml_skew_override=300): ask users to retry login." : "Apply tenant flag saml_skew_override=300 (takes effect within 60s), then ask users to retry.",
      "Meanwhile, tenant admins can use Admin magic-link login (Settings → Security → Break-glass) so dispatch keeps moving.",
      authDeploy ? `Permanent fix: Identity on-call reverts auth-service ${authDeploy.version}.` : "Escalate to Identity on-call if the workaround doesn't help.",
    ], sources: ["runbook-sso-saml"] });
    if (affected >= 5 && !openInc) st.actions.push({ kind: "declare_incident", label: "Declare SEV2 incident", detail: `${affected} customers failing with ${code}; Identity on-call becomes commander.` });
    if (!flagged) st.actions.push({ kind: "apply_tenant_flag", label: "Apply SSO workaround", detail: "Set saml_skew_override=300 for this tenant and verify logins live." });
    st.actions.push({ kind: "page_expert", label: "Page Identity on-call (Leo Park)", detail: "Leo Park · Identity on-call" });
    st.experts.push({ name: "Priya Raman", team: "Identity", why: "SSO/SAML SME; built the saml_skew_override flag (INC-1987)" });
  }
  if (billingTalk) {
    const d = dupes[0];
    st.issues.push({ title: "Charged twice", status: refunded ? "resolved" : d ? "root_cause_found" : "investigating", summary: d ? `Invoice ${d.invoice_id} has ${d.charges} successful payments.` : "No duplicate payment found yet." });
    if (d) {
      st.diagnosis.push({ finding: `Invoice ${d.invoice_id} charged ${d.charges}× (payment-retry bug)`, evidence: `Total $${Number(d.total).toLocaleString()} across ${d.charges} successful payments`, sources: ["tw:q4", "runbook-billing-duplicate"] });
      st.answer_cards.push({ title: "Duplicate charge: what to tell them", steps: ["Duplicate charges caused by Orbit are refunded in full, no approval needed (Refund Policy §2).", "Refund lands within 3 business days; banks may take 5–10 days to show it.", "Their invoice stays paid; no action needed from them."], sources: ["policy-refunds", "runbook-billing-duplicate"] });
      if (!refunded) st.actions.push({ kind: "request_refund", label: "File duplicate-charge refund", detail: `Refund the second payment on ${d.invoice_id} (no approval needed).` });
      st.guardrails.push({ level: "warn", text: "Don't promise a same-day refund; only the VP Finance can expedite.", sources: ["policy-refunds"] });
    }
  }
  if (creditTalk) {
    if (credits.length) st.guardrails.push({ level: "block", text: `They already received a $${Number(credits[0].amount).toLocaleString()} credit (${credits[0].reason}). A second credit within 90 days needs Support Manager approval (Sam Ortiz).`, sources: ["tw:q5", "policy-credits-sla"] });
  }
  if (loginTalk && (st.blast_radius.is_incident || openInc)) st.guardrails.push({ level: "warn", text: "Incident in progress: don't give your own ETA. Promise a personal update when it's resolved.", sources: ["policy-incident-escalation"] });

  if (!st.issues.length) st.suggested_reply = input.transcript.some((l) => l.speaker === "customer") ? "Happy to help. What's going on with your account today?" : `Hi, thanks for calling Orbit Support. I have the ${input.customerName} account open. How can I help today?`;
  else if (etaTalk) st.suggested_reply = "Engineering is actively rolling back the change that caused this, and I'll personally update you the moment it's resolved. Meanwhile I've applied a workaround so your dispatchers can log in now, and your duplicate charge refund is filed. It'll arrive within 3 business days.";
  else if (creditTalk && credits.length) st.suggested_reply = "I understand this is costing you real money. I can't approve a second credit myself, but I'll take it to my manager today with the full impact. First, let me get your team logged back in right now.";
  else st.suggested_reply = `I'm really sorry. Your dispatchers being locked out during peak is serious. I can see exactly what's happening: ${authDeploy ? "a change we shipped this morning is rejecting Okta logins" : "logins are failing"}${dupes.length ? ", and yes, you were charged twice on your November invoice. That's our error and it'll be refunded in full" : ""}. Let me fix access first.`;
  classify(st, tp, { topErr, spreadCount, authDeploy, dupes, openInc, credits, refunded, flagged, usageDrop, today, avg, openTickets: f.q11 || [] }, input);
  return st;
}

// ---------------------------------------------------------------------------------------------
// Call status: what the customer raised, matched against what live data already knows.
// ---------------------------------------------------------------------------------------------
const PLAYBOOKS = [
  { topic: "Can't log in / SSO errors", source: "runbook-sso-saml", steps: ["Ask for the exact error text (assertion expired, signature invalid, ACS mismatch).", "Check if it's one user, the whole tenant, or many customers.", "Workaround: tenant flag saml_skew_override=300, or Admin magic-link login."] },
  { topic: "Charged twice / billing", source: "runbook-billing-duplicate", steps: ["Look up payments on the invoice; two successful payments = duplicate.", "Orbit-caused duplicates are refunded in full, no approval (Refund Policy §2).", "Refund within 3 business days; never promise same-day."] },
  { topic: "Asking for a credit", source: "policy-credits-sla", steps: ["Only after the outage is confirmed as Orbit-caused.", "Up to 10% of the monthly fee; one agent-approved credit per 90 days.", "Second credit within 90 days → Support Manager (Sam Ortiz)."] },
  { topic: "Upset customer", source: "support-tone-guide", steps: ["Acknowledge the impact in their words first.", "Say what you know, what you're doing, and when they'll hear next.", "Never guess an ETA; close with explicit commitments and an owner."] },
];

function classify(
  st: CopilotState,
  tp: ReturnType<typeof topicsOf>,
  f: { topErr?: Record<string, unknown>; spreadCount: number; authDeploy?: Record<string, unknown>; dupes: Record<string, unknown>[]; openInc?: Record<string, unknown>; credits: Record<string, unknown>[]; refunded: boolean; flagged: boolean; usageDrop: boolean; today?: number; avg: number; openTickets: Record<string, unknown>[] },
  input: { customerName: string; transcript: TranscriptLine[] },
) {
  const issues: CallIssue[] = [];
  const failures = Number(f.topErr?.failures || 0);

  if (tp.login) {
    if (failures >= 5 || (f.openInc && /sso|login|auth/i.test(String(f.openInc.title)))) {
      const code = String(f.topErr?.error_code || "SSO error");
      issues.push({
        key: "login", kind: "known",
        title: "Known issue: SSO login failures",
        summary: `${failures} failed logins in the last hour (${code})${f.spreadCount >= 5 ? ` · same error at ${f.spreadCount} customers → incident` : ""}${f.authDeploy ? ` · caused by auth-service ${f.authDeploy.version} deployed this morning` : ""}.`,
        steps: [
          f.flagged ? "Workaround already applied (saml_skew_override=300): ask users to retry now." : "Apply the workaround: tenant flag saml_skew_override=300 (works within 60s).",
          "Meanwhile admins can use Admin magic-link login (Settings → Security → Break-glass).",
          f.spreadCount >= 5 ? "Incident policy: don't troubleshoot further, link the ticket to the incident, no ETAs." : "If it doesn't help, page Identity on-call (Leo Park).",
        ],
        script: `I can see exactly what's happening. A change we made this morning is rejecting Okta logins${f.spreadCount >= 5 ? ", and it's affecting other customers too, so it has our engineers' full attention" : ""}. I'm applying a workaround for your team right now so your dispatchers can get back in.`,
        sources: ["tw:q1", "tw:q2", "tw:q3", "runbook-sso-saml"],
      });
    } else {
      issues.push({
        key: "login", kind: "new",
        title: "New issue: customer can't log in",
        summary: `Live data shows no login failures for ${input.customerName} in the last hour, so this is freshly reported. Treat it as new and gather details.`,
        steps: ["Ask for the exact error text and one affected user's email.", "Ask: one user, a few, or the whole team? Since when?", "Try Admin magic-link login to unblock them; log a P2 and alert Identity on-call."],
        script: "I'm sorry you're locked out. I know how disruptive that is. I'm going to stay on this with you. Can you tell me the exact error message you see, and whether it's everyone or just some users?",
        sources: ["runbook-sso-saml", "support-tone-guide"],
      });
    }
  }

  if (tp.billing) {
    const d = f.dupes[0];
    if (d) {
      issues.push({
        key: "billing", kind: "known",
        title: `Known issue: duplicate charge on ${d.invoice_id}`,
        summary: `${d.charges} successful payments ($${Number(d.total).toLocaleString()} total) from the payment-retry bug.${f.refunded ? " Refund already issued." : ""}`,
        steps: ["Confirm it: our retry job charged the invoice twice (known bug BILL-412).", "Refund the duplicate in full, no approval needed (Refund Policy §2).", "Refund lands in 3 business days; the invoice stays paid."],
        script: "You're right, you were charged twice. That's our error, not yours. I'm refunding the duplicate in full right now; you'll see it within 3 business days, and your invoice stays paid.",
        sources: ["tw:q4", "policy-refunds", "runbook-billing-duplicate"],
      });
    } else {
      issues.push({
        key: "billing", kind: "new",
        title: "New issue: billing question",
        summary: "No duplicate or failed payments in live data for this account, so this is freshly reported.",
        steps: ["Ask which invoice and amount looks wrong.", "Compare with their latest payments; check for a card-side pending charge.", "If unresolved, open a billing ticket and promise a reply within 1 business day."],
        script: "Thanks for flagging that. I want to get this right for you. Which invoice or charge looks off? I'll check it against our payment records while we talk.",
        sources: ["runbook-billing-duplicate", "support-tone-guide"],
      });
    }
  }

  if (tp.problem && !tp.login && !tp.billing) {
    const last = [...input.transcript].reverse().find((l) => l.speaker === "customer")?.text || "";
    issues.push({
      key: "other", kind: "new",
      title: "New issue reported",
      summary: `"${last.slice(0, 110)}${last.length > 110 ? "…" : ""}" No matching signal in live data yet.`,
      steps: ["Acknowledge the impact and capture specifics: what, who, since when, error text.", "Check if other customers reported the same in the last hour.", "Log a ticket with priority by impact; tell them when they'll hear next."],
      script: "I'm sorry this is happening. Thanks for your patience. Let me make sure I understand exactly what you're seeing, and I'll tell you exactly what I'm doing about it and when you'll hear from me.",
      sources: ["support-tone-guide", "policy-incident-escalation"],
    });
  }

  st.call_issues = issues;
  st.playbooks = PLAYBOOKS;
  st.watch = [
    { area: "Logins", ok: failures < 5, detail: failures >= 5 ? `${failures} failures/1h` : "healthy" },
    { area: "Billing", ok: !f.dupes.length, detail: f.dupes.length ? "duplicate charge" : "ok" },
    { area: "Tickets", ok: !f.openTickets.some((t) => t.priority === "P1"), detail: f.openTickets.length ? `${f.openTickets.length} open` : "none open" },
    { area: "Usage", ok: !f.usageDrop, detail: f.usageDrop && f.today !== undefined ? `${f.today} vs ${Math.round(f.avg)} avg` : "normal" },
    { area: "Incidents", ok: !f.openInc, detail: f.openInc ? String(f.openInc.id) : "none" },
  ];
  if (issues.length) st.suggested_reply = issues[issues.length - 1].script;
}
