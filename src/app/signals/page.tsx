"use client";
import clsx from "clsx";
import { BellRing, CheckCircle2, ChevronDown, Handshake, Info, Siren, TriangleAlert, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import type { Signal } from "@/lib/bus";
import { MiniTable } from "@/components/call/panels";
import { useStream } from "@/components/stream";
import { Badge, Card, Empty, PageHeader, Sql, TwMark, ago } from "@/components/ui";

const sevStyle = {
  critical: { icon: Siren, cls: "border-bad/40", ic: "text-bad", tone: "bad" as const },
  warning: { icon: TriangleAlert, cls: "border-warn/40", ic: "text-warn", tone: "warn" as const },
  info: { icon: Info, cls: "border-line", ic: "text-brand", tone: "brand" as const },
  success: { icon: CheckCircle2, cls: "border-ok/40", ic: "text-ok", tone: "ok" as const },
};

interface PromiseRow { id: string; customer: string; text: string; status: string; owner: string; due_at: string; kept_at: string | null; trigger_name: string | null; watch_sql: string | null }

export default function SignalsPage() {
  const { signals, markSeen, promiseUpdates } = useStream();
  const [promises, setPromises] = useState<PromiseRow[]>([]);
  useEffect(() => {
    markSeen();
  }, [signals.length, markSeen]);
  useEffect(() => {
    fetch("/api/promises").then((r) => r.json()).then((p) => Array.isArray(p) && setPromises(p)).catch(() => {});
  }, [signals.length]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader
        title="Live Signals"
        subtitle={<>Triggerware watches Orbit&apos;s production data and <b>pushes</b> changes the moment they happen. CallBrain adds context from the company brain: what it means, which policy applies, and who owns it.</>}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          {signals.length === 0 && (
            <Card>
              <Empty icon={<BellRing className="size-6" />} title="Quiet for now" hint="Open the Director (bottom right) and run “Bad deploy hits Okta SSO” to watch Triggerware catch it." />
            </Card>
          )}
          {signals.map((s) => <SignalCard key={s.id} s={s} />)}
        </div>
        <Card title="Promise Keeper" icon={<Handshake className="size-4 text-brand" />} className="h-fit lg:sticky lg:top-6">
          <p className="mb-3 text-xs text-muted">Every commitment made on a call, watched by a Triggerware trigger until it&apos;s fulfilled.</p>
          {promises.length === 0 ? <p className="text-xs text-faint">No promises yet.</p> : (
            <ul className="space-y-2">
              {promises.map((p) => {
                const kept = promiseUpdates[p.id]?.status === "kept" || p.status === "kept";
                return (
                  <li key={p.id} className={clsx("rounded-lg border p-2.5", kept ? "border-ok/40 bg-ok-soft" : "border-line")}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[12.5px] font-medium leading-snug">{p.text}</span>
                      {kept ? <Badge tone="ok">kept</Badge> : p.trigger_name ? <Badge tone="tw"><Zap className="size-2.5 fill-current" />watching</Badge> : <Badge>open</Badge>}
                    </div>
                    <div className="mt-0.5 text-[11px] text-faint">{p.customer} · {p.owner}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function SignalCard({ s }: { s: Signal }) {
  const [open, setOpen] = useState(false);
  const st = sevStyle[s.severity];
  const Icon = st.icon;
  return (
    <div className={clsx("slide-in rounded-xl border bg-surface p-4", st.cls)}>
      <div className="flex items-start gap-3">
        <Icon className={clsx("mt-0.5 size-4.5 shrink-0", st.ic)} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[14px] font-semibold">{s.title}</h3>
            <Badge tone={st.tone}>{s.severity}</Badge>
            <span className="ml-auto text-[11px] text-faint">{ago(s.at)}</span>
          </div>
          <p className="mt-1 text-[13px] leading-snug text-muted">{s.summary}</p>
          {s.brief ? (
            <div className="mt-2.5 rounded-lg border border-brand/20 bg-brand-soft p-2.5 text-[12.5px] leading-snug whitespace-pre-wrap">{s.brief}
              {s.sources && s.sources.length > 0 && <div className="mt-1.5 text-[10.5px] text-brand">Sources: {s.sources.join(", ")}</div>}
            </div>
          ) : ["critical", "warning"].includes(s.severity) ? (
            <div className="mt-2.5 h-10 skeleton" />
          ) : null}
          <button onClick={() => setOpen(!open)} className="mt-2 flex items-center gap-1 text-[11.5px] text-tw hover:opacity-80">
            <Zap className="size-3 fill-current" /> Trigger <span className="font-mono">{s.trigger}</span> · +{s.added.length} / −{s.deleted.length} rows
            <ChevronDown className={clsx("size-3 transition-transform", open && "rotate-180")} />
          </button>
          {open && (
            <div className="mt-2 space-y-2">
              {s.sql && <Sql sql={s.sql} compact />}
              {s.added.length > 0 && <MiniTable rows={s.added.slice(0, 8).map((r) => Object.fromEntries((r as unknown[]).map((v, i) => [s.signature?.[i] || `col${i}`, v])))} />}
              <p className="text-[11px] text-faint">Delta pushed by <TwMark className="text-[11px]" /> via <span className="font-mono">triggers.watch</span></p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
