"use client";
import clsx from "clsx";
import {
  AlertTriangle, BookOpen, CheckCircle2, CircleDot, Gauge, Lightbulb, Loader2, ShieldAlert, ShieldCheck, Sparkles, Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { Briefing } from "@/lib/briefing";
import type { CallIssue, CopilotState } from "@/lib/copilot";
import { Badge, Button, Card, Skeleton, Sql, TwMark, fmtMoney } from "../ui";
import type { Lookup } from "./lib";

// ------------------------------------------------------------------------------------------
// Source chips: knowledge docs and live Triggerware lookups
// ------------------------------------------------------------------------------------------
export function Sources({ ids, docs, onLookup }: { ids: string[]; docs: Record<string, string>; onLookup?: (id: string) => void }) {
  if (!ids?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {ids.map((id) => {
        const tw = id.startsWith("tw:");
        return tw ? (
          <button key={id} onClick={() => onLookup?.(id.slice(3))} className="inline-flex items-center gap-1 rounded-md border border-tw/25 bg-tw-soft px-1.5 py-0.5 text-[10.5px] font-medium text-tw hover:opacity-80">
            <Zap className="size-2.5 fill-current" /> live {id.slice(3)}
          </button>
        ) : (
          <span key={id} title={docs[id] || id} className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[10.5px] text-muted">
            <BookOpen className="size-2.5" /> {docs[id] || id}
          </span>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------------------------------
// Left column: pre-call briefing
// ------------------------------------------------------------------------------------------
const moodTone = { calm: "ok", concerned: "warn", frustrated: "bad", angry: "bad", relieved: "ok" } as const;

export function BriefingPanel({ b, loading, docs }: { b: Briefing | null; loading: boolean; docs: Record<string, string> }) {
  if (loading || !b)
    return (
      <Card title="Pre-call briefing" icon={<Gauge className="size-4 text-brand" />} action={<span className="flex items-center gap-1 text-[11px] text-tw"><Loader2 className="size-3 animate-spin" /> 7 live lookups</span>}>
        <div className="space-y-3">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="w-full" />
          <Skeleton className="w-5/6" />
          <div className="grid grid-cols-2 gap-2 pt-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        </div>
      </Card>
    );
  const c = b.customer as Record<string, string | number>;
  const s = b.stats;
  const max = Math.max(1, ...b.usage.map((u) => u.active_users));
  const renewDays = c.renewal_date ? Math.round((new Date(String(c.renewal_date)).getTime() - Date.now()) / 86400000) : null;
  return (
    <div className="space-y-3">
      <Card title="Pre-call briefing" icon={<Gauge className="size-4 text-brand" />} action={<Badge tone={b.ai.risk === "high" ? "bad" : b.ai.risk === "medium" ? "warn" : "ok"}>{b.ai.risk} risk</Badge>}>
        <p className="text-[13.5px] font-medium leading-snug">{b.ai.headline}</p>
        <div className="mt-3 rounded-lg border border-brand/20 bg-brand-soft p-2.5">
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-brand">Likely calling about</div>
          <p className="text-[12.5px] leading-snug">{b.ai.likely_reason}</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat label="ARR" value={fmtMoney(c.arr)} sub={`${c.plan} · ${c.sso_provider} SSO`} />
          <Stat label="Renewal" value={renewDays !== null ? `${renewDays} days` : "—"} sub={`CSM ${c.csm}`} tone={renewDays !== null && renewDays < 45 ? "warn" : undefined} />
          <Stat label="Failed logins · 1h" value={String(s.failedLogins1h)} sub={s.topError || "none"} tone={s.failedLogins1h > 10 ? "bad" : undefined} />
          <Stat label="Open tickets" value={String(s.openTickets)} sub={s.duplicateCharge ? "duplicate charge!" : "billing ok"} tone={s.duplicateCharge ? "bad" : undefined} />
        </div>
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[11px] text-faint">
            <span>Active users (8 days)</span>
            {s.usageToday !== null && <span className={clsx(s.usageToday < s.usageAvg * 0.6 && "font-medium text-bad")}>today {s.usageToday} vs avg {s.usageAvg}</span>}
          </div>
          <div className="flex h-10 items-end gap-1">
            {b.usage.map((u, i) => (
              <div key={u.day} title={`${u.day}: ${u.active_users}`} className={clsx("flex-1 rounded-sm", i === b.usage.length - 1 && u.active_users < s.usageAvg * 0.6 ? "bg-bad" : "bg-brand/60")} style={{ height: `${(u.active_users / max) * 100}%` }} />
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted">
          Mood: <Badge tone={moodTone[b.ai.mood]}>{b.ai.mood}</Badge>
        </div>
      </Card>
      <details className="group rounded-xl border border-line bg-surface">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-[13px] font-semibold">
          <Lightbulb className="size-4 text-warn" /> Talking points
          <span className="ml-auto text-[11px] font-normal text-faint group-open:hidden">show ▾</span>
        </summary>
        <div className="border-t border-line p-4">
        <ul className="space-y-1.5 text-[12.5px] leading-snug">
          {b.ai.talking_points.map((t, i) => <li key={i} className="flex gap-2"><CircleDot className="mt-0.5 size-3 shrink-0 text-brand" />{t}</li>)}
        </ul>
        {b.ai.watch_outs.length > 0 && (
          <div className="mt-3 border-t border-line pt-3">
            <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-bad">Watch out</div>
            <ul className="space-y-1.5 text-[12.5px] leading-snug">
              {b.ai.watch_outs.map((t, i) => <li key={i} className="flex gap-2"><AlertTriangle className="mt-0.5 size-3 shrink-0 text-bad" />{t}</li>)}
            </ul>
          </div>
        )}
        <Sources ids={b.ai.sources} docs={docs} />
        </div>
      </details>
      <p className="px-1 text-[11px] text-faint">Briefing built from {b.queries.length} live <TwMark className="text-[11px]" /> lookups in {Math.max(...b.queries.map((q) => q.ms))}ms.</p>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "bad" | "warn" }) {
  return (
    <div className={clsx("rounded-lg border p-2", tone === "bad" ? "border-bad/30 bg-bad-soft" : tone === "warn" ? "border-warn/30 bg-warn-soft" : "border-line bg-surface-2")}>
      <div className="text-[10.5px] text-faint">{label}</div>
      <div className={clsx("text-base font-semibold tracking-tight", tone === "bad" && "text-bad", tone === "warn" && "text-warn")}>{value}</div>
      {sub && <div className="truncate text-[10.5px] text-muted">{sub}</div>}
    </div>
  );
}

// ------------------------------------------------------------------------------------------
// Right column: live copilot — one clear status, updated with every line of the call.
// ------------------------------------------------------------------------------------------
export function CopilotPanel({
  state, thinking, docs, onLookup, onAction, onUseReply, actionBusy, actionsDone,
}: {
  state: CopilotState | null; thinking: boolean; docs: Record<string, string>; onLookup: (id: string) => void;
  onAction: (a: CopilotState["actions"][number]) => void; onUseReply: (t: string) => void; actionBusy: string | null; actionsDone: string[];
}) {
  // Remember when each issue first appeared so freshly surfaced ones can be highlighted.
  const [firstSeen, setFirstSeen] = useState<Record<string, number>>({});
  const [, tick] = useState(0);
  const issues = state?.call_issues || [];
  const keys = issues.map((i) => `${i.key}:${i.kind}`).join("|");
  useEffect(() => {
    if (!keys) return;
    setFirstSeen((m) => {
      const next = { ...m };
      for (const k of keys.split("|")) if (!next[k]) next[k] = Date.now();
      return next;
    });
    const t = setTimeout(() => tick((n) => n + 1), 8000);
    return () => clearTimeout(t);
  }, [keys]);

  if (!state)
    return (
      <Card>
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Loader2 className="size-5 animate-spin text-brand" />
          <p className="text-sm text-muted">Checking live data for this account…</p>
        </div>
      </Card>
    );

  const hasKnown = issues.some((i) => i.kind === "known");
  const hasNew = issues.some((i) => i.kind === "new");
  const headline = !issues.length ? "none" : hasKnown && hasNew ? "mixed" : hasKnown ? "known" : "new";

  const actionsFor = (i: CallIssue): CopilotState["actions"] => {
    if (i.kind === "new") return [{ kind: "page_expert", label: "Log ticket & alert the owner", detail: i.key === "login" ? "Identity on-call (Leo Park)" : i.key === "billing" ? "Billing Ops (Ana Gomez)" : "Support Manager (Sam Ortiz)" }];
    const want = i.key === "login" ? ["apply_tenant_flag", "declare_incident", "page_expert"] : i.key === "billing" ? ["request_refund"] : [];
    return state.actions.filter((a) => want.includes(a.kind));
  };

  return (
    <div className="space-y-3">
      {/* Status header */}
      <div
        className={clsx(
          "rounded-xl border p-3.5 transition-colors",
          headline === "none" && "border-ok/40 bg-ok-soft",
          headline === "known" && "border-warn/50 bg-warn-soft",
          headline === "new" && "border-brand/50 bg-brand-soft",
          headline === "mixed" && "border-bad/40 bg-bad-soft",
        )}
      >
        <div className="flex items-center gap-2">
          {headline === "none" ? <ShieldCheck className="size-5 text-ok" /> : headline === "new" ? <Sparkles className="size-5 text-brand" /> : <AlertTriangle className={clsx("size-5", headline === "known" ? "text-warn" : "text-bad")} />}
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">Call status</div>
            <div className="text-[15px] font-semibold leading-tight">
              {headline === "none" && "No related issues"}
              {headline === "known" && `Known issue${issues.length > 1 ? "s" : ""}: workaround available`}
              {headline === "new" && "New issue: freshly reported"}
              {headline === "mixed" && `${issues.length} issues: known + new`}
            </div>
          </div>
          {thinking && <Loader2 className="size-4 animate-spin text-muted" />}
        </div>
        <p className="mt-1.5 text-[12px] leading-snug text-muted">
          {headline === "none" ? "Nothing the customer has said matches a problem yet. Listening and checking live data on every line." : "Matched against live data from Triggerware on every line of the call."}
        </p>
        {state.watch && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {state.watch.map((w) => (
              <span key={w.area} title={w.detail} className={clsx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px]", w.ok ? "border-line bg-surface text-muted" : "border-warn/40 bg-surface text-warn")}>
                <span className={clsx("size-1.5 rounded-full", w.ok ? "bg-ok" : "bg-warn")} />
                {w.area}{!w.ok && `: ${w.detail}`}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* One card per issue the customer raised */}
      {issues.map((i) => {
        const fresh = Date.now() - (firstSeen[`${i.key}:${i.kind}`] || 0) < 8000;
        const acts = actionsFor(i);
        return (
          <section key={i.key} className={clsx("slide-in overflow-hidden rounded-xl border bg-surface", i.kind === "known" ? "border-warn/50" : "border-brand/50", fresh && "ring-2 ring-offset-1 ring-offset-bg", fresh && (i.kind === "known" ? "ring-warn/40" : "ring-brand/40"))}>
            <header className={clsx("flex items-center gap-2 px-3.5 py-2", i.kind === "known" ? "bg-warn-soft" : "bg-brand-soft")}>
              <Badge tone={i.kind === "known" ? "warn" : "brand"}>{i.kind === "known" ? "KNOWN ISSUE" : "NEW ISSUE"}</Badge>
              {fresh && <span className="text-[10.5px] font-semibold text-tw">● just surfaced</span>}
            </header>
            <div className="space-y-3 p-3.5">
              <div>
                <h3 className="text-[14px] font-semibold leading-snug">{i.title.replace(/^(Known issue|New issue): /, "")}</h3>
                <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{i.summary}</p>
              </div>
              <div>
                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-faint">{i.kind === "known" ? "Workaround" : "Next steps"}</div>
                <ol className="space-y-1">
                  {i.steps.map((st, n) => (
                    <li key={n} className="flex gap-2 text-[12.5px] leading-snug">
                      <span className="mt-px grid size-4 shrink-0 place-items-center rounded-full bg-surface-2 text-[10px] font-semibold text-muted">{n + 1}</span>
                      {st}
                    </li>
                  ))}
                </ol>
              </div>
              <div className="rounded-lg border border-line bg-surface-2 p-2.5">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">{i.kind === "known" ? "Say this" : "Calm & reassure"}</span>
                  <Button size="sm" variant="ghost" onClick={() => onUseReply(i.script)}>Use</Button>
                </div>
                <p className="text-[13px] leading-snug">“{i.script}”</p>
              </div>
              {acts.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {acts.map((a) => {
                    const done = actionsDone.includes(a.kind);
                    return (
                      <Button key={a.kind + a.label} size="sm" variant={done ? "secondary" : i.kind === "known" ? "tw" : "primary"} disabled={done || !!actionBusy} loading={actionBusy === a.kind} onClick={() => onAction(a)}>
                        {done ? <CheckCircle2 className="size-3.5 text-ok" /> : <Zap className="size-3.5" />} {a.label}
                      </Button>
                    );
                  })}
                </div>
              )}
              <Sources ids={i.sources} docs={docs} onLookup={onLookup} />
            </div>
          </section>
        );
      })}

      {/* Guardrails only when something applies */}
      {issues.length > 0 && state.guardrails.length > 0 && (
        <Card title="Don't promise" icon={<ShieldAlert className="size-4 text-bad" />}>
          <ul className="space-y-1.5">
            {state.guardrails.map((g, n) => (
              <li key={n} className="flex gap-2 text-[12.5px] leading-snug">
                <ShieldAlert className={clsx("mt-0.5 size-3.5 shrink-0", g.level === "block" ? "text-bad" : "text-warn")} />
                {g.text}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* No issues: what to say + troubleshooting options from company docs */}
      {!issues.length && (
        <>
          {state.suggested_reply && (
            <div className="rounded-xl border border-line bg-surface p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-faint">Say next</span>
                <Button size="sm" variant="ghost" onClick={() => onUseReply(state.suggested_reply)}>Use</Button>
              </div>
              <p className="text-[13px] leading-snug">“{state.suggested_reply}”</p>
            </div>
          )}
          <Card title="Troubleshooting options (from company docs)" icon={<BookOpen className="size-4 text-brand" />}>
            <div className="space-y-1">
              {(state.playbooks || []).map((p) => (
                <details key={p.topic} className="group rounded-lg border border-line px-3 py-2 open:bg-surface-2">
                  <summary className="cursor-pointer list-none text-[12.5px] font-medium">
                    <span className="mr-1.5 inline-block text-faint transition-transform group-open:rotate-90">›</span>
                    If they say: {p.topic}
                  </summary>
                  <ol className="mt-1.5 space-y-1 pl-4">
                    {p.steps.map((st, n) => <li key={n} className="list-decimal text-[12px] leading-snug text-muted">{st}</li>)}
                  </ol>
                  <div className="mt-1.5 text-[10.5px] text-faint"><BookOpen className="mr-1 inline size-3" />{docs[p.source] || p.source}</div>
                </details>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------
// Live lookups (Triggerware activity for this call)
// ------------------------------------------------------------------------------------------
export function LookupsPanel({ lookups, highlight, onAsk }: { lookups: Lookup[]; highlight: string | null; onAsk?: (q: string) => Promise<void> }) {
  const [open, setOpen] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState(false);
  const ask = async () => {
    if (!onAsk || q.trim().length < 4) return;
    setAsking(true);
    try {
      await onAsk(q.trim());
      setQ("");
    } finally {
      setAsking(false);
    }
  };
  return (
    <Card
      title={<span className="flex items-center gap-1.5"><TwMark className="text-[13px]" label="Triggerware" /> live lookups</span>}
      action={
        <button onClick={() => setExpanded(!expanded)} className="text-[11px] text-faint hover:text-fg">
          {lookups.filter((l) => l.done).length} queries · {lookups.reduce((s, l) => s + (l.rowCount || 0), 0)} rows · {expanded ? "hide ▴" : "show ▾"}
        </button>
      }
      tone="tw"
    >
      {onAsk && (
        <div className="mb-3 flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} placeholder="Ask Triggerware anything… e.g. which Enterprise customers renew this month?" className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] outline-none focus:border-tw" />
          <Button size="sm" variant="tw" onClick={ask} loading={asking} disabled={q.trim().length < 4}><Zap className="size-3 fill-current" /> Ask</Button>
        </div>
      )}
      {lookups.length === 0 ? (
        <p className="py-2 text-center text-xs text-faint">The copilot will query live production data through Triggerware as the call unfolds.</p>
      ) : (
        <ul className="max-h-80 space-y-1.5 overflow-y-auto scroll-thin">
          {(expanded || highlight ? lookups : lookups.filter((l) => l.id.includes("ask")).slice(0, 2)).map((l) => {
            const isOpen = open === l.id || highlight === l.id;
            return (
              <li key={l.id} id={`lookup-${l.id}`} className={clsx("slide-in rounded-lg border px-2.5 py-2", highlight === l.id ? "border-tw bg-tw-soft" : "border-line")}>
                <button className="flex w-full items-center gap-2 text-left" onClick={() => setOpen(isOpen ? null : l.id)}>
                  {l.done ? (l.error ? <AlertTriangle className="size-3.5 text-bad" /> : <CheckCircle2 className="size-3.5 text-ok" />) : <Loader2 className="size-3.5 animate-spin text-tw" />}
                  <span className="font-mono text-[10.5px] text-faint">{l.id}</span>
                  <span className="flex-1 truncate text-[12.5px] font-medium">{l.purpose || l.text}</span>
                  <Badge tone={l.mode === "english" ? "tw" : "neutral"}>{l.mode === "english" ? "plain English" : "SQL"}</Badge>
                  {l.done && !l.error && <span className="font-mono text-[10.5px] text-faint">{l.rowCount} rows · {l.ms}ms</span>}
                </button>
                {isOpen && (
                  <div className="mt-2 space-y-1.5">
                    {l.mode === "english" && <p className="text-[12px] italic text-muted">“{l.text}”</p>}
                    {l.sql && <Sql sql={l.sql} compact />}
                    {l.error && <p className="text-[11.5px] text-bad">{l.error}</p>}
                    {l.preview && l.preview.length > 0 && <MiniTable rows={l.preview} />}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function MiniTable({ rows }: { rows: Record<string, unknown>[] }) {
  const cols = Object.keys(rows[0] || {});
  return (
    <div className="overflow-x-auto rounded-md border border-line scroll-thin">
      <table className="w-full text-[11px]">
        <thead className="bg-surface-2 text-faint">
          <tr>{cols.map((c) => <th key={c} className="px-2 py-1 text-left font-medium">{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {cols.map((c) => <td key={c} className="max-w-[180px] truncate px-2 py-1 font-mono">{String(r[c] ?? "")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
