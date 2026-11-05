"use client";
import clsx from "clsx";
import {
  AlertOctagon, AlertTriangle, BookOpen, CheckCircle2, CircleDot, Gauge, Lightbulb, Link2, Loader2, MessageSquareQuote, Radar,
  Search, ShieldAlert, ShieldCheck, Siren, UserRoundSearch, Users, Wand2, Zap,
} from "lucide-react";
import { useState } from "react";
import type { Briefing } from "@/lib/briefing";
import type { CopilotState } from "@/lib/copilot";
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
      <Card title="Talking points" icon={<Lightbulb className="size-4 text-warn" />}>
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
      </Card>
      <Card title={<span className="flex items-center gap-1.5">Fetched live via <TwMark className="text-[13px]" /></span>}>
        <ul className="space-y-1">
          {b.queries.map((q) => (
            <li key={q.label} className="flex items-center justify-between text-[11.5px]">
              <span className="text-muted">{q.label}</span>
              <span className="font-mono text-faint">{q.rows} rows · {q.ms}ms</span>
            </li>
          ))}
        </ul>
      </Card>
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
// Right column: live copilot
// ------------------------------------------------------------------------------------------
const issueTone = { investigating: "warn", root_cause_found: "brand", workaround_available: "ok", resolved: "ok" } as const;

export function CopilotPanel({
  state, thinking, docs, onLookup, onAction, onUseReply, actionBusy, actionsDone,
}: {
  state: CopilotState | null; thinking: boolean; docs: Record<string, string>; onLookup: (id: string) => void;
  onAction: (a: CopilotState["actions"][number]) => void; onUseReply: (t: string) => void; actionBusy: string | null; actionsDone: string[];
}) {
  if (!state)
    return (
      <Card title="Copilot" icon={<Wand2 className="size-4 text-brand" />}>
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          {thinking ? <Loader2 className="size-5 animate-spin text-brand" /> : <MessageSquareQuote className="size-6 text-faint" />}
          <p className="text-sm text-muted">{thinking ? "Listening and checking live data…" : "Listening. Insights appear as the customer talks."}</p>
        </div>
      </Card>
    );
  const br = state.blast_radius;
  return (
    <div className="space-y-3">
      {br && br.affected_customers > 1 && state.issues.length > 0 && (
        <div className={clsx("slide-in rounded-xl border p-3", br.is_incident ? "border-bad/40 bg-bad-soft" : "border-warn/40 bg-warn-soft")}>
          <div className={clsx("flex items-center gap-2 text-sm font-semibold", br.is_incident ? "text-bad" : "text-warn")}>
            <Siren className="size-4" /> {br.is_incident ? "This is an incident, not a one-off" : "Other customers affected"}
            <Badge tone={br.is_incident ? "bad" : "warn"} className="ml-auto"><Users className="size-3" /> {br.affected_customers} customers</Badge>
          </div>
          <p className="mt-1 text-[12.5px] leading-snug">{br.summary}</p>
        </div>
      )}

      {state.suggested_reply && (
        <div className="slide-in rounded-xl border border-brand/30 bg-brand-soft p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-brand">
              Say next
              {state.engine === "rules" ? (
                <Badge tone="tw" className="normal-case tracking-normal">{thinking ? "live facts · AI refining…" : "live facts"}</Badge>
              ) : (
                <Badge tone="brand" className="normal-case tracking-normal">AI</Badge>
              )}
            </span>
            <Button size="sm" variant="ghost" onClick={() => onUseReply(state.suggested_reply)}>Use</Button>
          </div>
          <p className="text-[13px] leading-snug">“{state.suggested_reply}”</p>
        </div>
      )}

      {state.possible_issues?.length > 0 && (
        <Card
          title="Possible issues on this account"
          icon={<Radar className="size-4 text-tw" />}
          action={<span className="text-[10.5px] text-faint">from live data · {state.possible_issues.filter((p) => p.raised).length}/{state.possible_issues.length} raised</span>}
        >
          <ul className="space-y-2">
            {state.possible_issues.map((p) => (
              <li key={p.title} className={clsx("rounded-lg border px-2.5 py-2", p.raised ? "border-brand/40 bg-brand-soft" : "border-line")}>
                <div className="flex items-start gap-2">
                  <span className={clsx("mt-1.5 size-2 shrink-0 rounded-full", p.severity === "high" ? "bg-bad" : p.severity === "medium" ? "bg-warn" : "bg-faint")} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[12.5px] font-medium leading-snug">{p.title}</span>
                      {p.raised ? <Badge tone="brand">raised</Badge> : <Badge>not raised yet</Badge>}
                    </div>
                    <p className="text-[11.5px] leading-snug text-muted">{p.detail}</p>
                    {p.correlated_with && <p className="mt-0.5 flex items-center gap-1 text-[11px] text-tw"><Link2 className="size-3 shrink-0" /> {p.correlated_with}</p>}
                    <Sources ids={p.sources} docs={docs} onLookup={onLookup} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {state.issues.length > 0 && (
        <Card title="Issues on this call" icon={<AlertOctagon className="size-4 text-bad" />} action={thinking ? <Loader2 className="size-3.5 animate-spin text-brand" /> : null}>
          <ul className="space-y-2.5">
            {state.issues.map((i) => (
              <li key={i.title}>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[13px] font-medium leading-snug">{i.title}</span>
                  <Badge tone={issueTone[i.status]}>{i.status.replace(/_/g, " ")}</Badge>
                </div>
                <p className="mt-0.5 text-[12px] leading-snug text-muted">{i.summary}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {state.diagnosis.length > 0 && (
        <Card title="Live diagnosis" icon={<Search className="size-4 text-tw" />} tone="tw">
          <ul className="space-y-3">
            {state.diagnosis.map((d, i) => (
              <li key={i} className="slide-in">
                <p className="text-[13px] font-medium leading-snug">{d.finding}</p>
                <p className="mt-0.5 text-[12px] leading-snug text-muted">{d.evidence}</p>
                <Sources ids={d.sources} docs={docs} onLookup={onLookup} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {state.answer_cards.map((a) => (
        <Card key={a.title} title={a.title} icon={<BookOpen className="size-4 text-brand" />}>
          <ol className="space-y-1.5">
            {a.steps.map((s, i) => (
              <li key={i} className="flex gap-2 text-[12.5px] leading-snug">
                <span className="mt-px grid size-4 shrink-0 place-items-center rounded-full bg-surface-2 text-[10px] font-semibold text-muted">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <Sources ids={a.sources} docs={docs} onLookup={onLookup} />
        </Card>
      ))}

      {state.guardrails.length > 0 && (
        <Card title="Guardrails" icon={<ShieldAlert className="size-4 text-warn" />}>
          <ul className="space-y-2">
            {state.guardrails.map((g, i) => (
              <li key={i} className={clsx("rounded-lg border p-2 text-[12.5px] leading-snug", g.level === "block" ? "border-bad/30 bg-bad-soft" : g.level === "warn" ? "border-warn/30 bg-warn-soft" : "border-ok/30 bg-ok-soft")}>
                <div className="flex gap-2">
                  {g.level === "ok" ? <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-ok" /> : <ShieldAlert className={clsx("mt-0.5 size-3.5 shrink-0", g.level === "block" ? "text-bad" : "text-warn")} />}
                  <span>{g.text}</span>
                </div>
                <Sources ids={g.sources} docs={docs} onLookup={onLookup} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {(state.actions.length > 0 || state.experts.length > 0) && (
        <Card title="Do it now" icon={<Zap className="size-4 text-tw" />}>
          <div className="flex flex-col gap-2">
            {state.actions.map((a) => {
              const done = actionsDone.includes(a.kind);
              return (
                <button key={a.kind + a.label} disabled={done || !!actionBusy} onClick={() => onAction(a)} className={clsx("flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors", done ? "border-ok/30 bg-ok-soft" : "border-line hover:border-brand/40 hover:bg-brand-soft")}>
                  {actionBusy === a.kind ? <Loader2 className="mt-0.5 size-4 animate-spin text-brand" /> : done ? <CheckCircle2 className="mt-0.5 size-4 text-ok" /> : <Zap className="mt-0.5 size-4 text-tw" />}
                  <span>
                    <span className="block text-[13px] font-medium">{a.label}</span>
                    <span className="block text-[11.5px] text-muted">{a.detail}</span>
                  </span>
                </button>
              );
            })}
            {state.experts.map((e) => (
              <div key={e.name} className="flex items-start gap-2 rounded-lg border border-dashed border-line px-3 py-2">
                <UserRoundSearch className="mt-0.5 size-4 text-brand" />
                <span>
                  <span className="block text-[13px] font-medium">{e.name} <span className="font-normal text-faint">· {e.team}</span></span>
                  <span className="block text-[11.5px] text-muted">{e.why}</span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------
// Live lookups (Triggerware activity for this call)
// ------------------------------------------------------------------------------------------
export function LookupsPanel({ lookups, highlight, onAsk }: { lookups: Lookup[]; highlight: string | null; onAsk?: (q: string) => Promise<void> }) {
  const [open, setOpen] = useState<string | null>(null);
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
      action={<span className="text-[11px] text-faint">{lookups.filter((l) => l.done).length} queries · {lookups.reduce((s, l) => s + (l.rowCount || 0), 0)} rows</span>}
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
          {lookups.map((l) => {
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
