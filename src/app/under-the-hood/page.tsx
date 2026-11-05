"use client";
import clsx from "clsx";
import { Activity, BookOpen, CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useStream } from "@/components/stream";
import { Badge, Card, PageHeader, Sql, TwMark, fmtTime } from "@/components/ui";

export default function UnderTheHood() {
  const { activity, mode } = useStream();
  const [docs, setDocs] = useState<{ id: string; title: string; owner: string; updated: string }[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then((s) => setDocs(s.knowledge || [])).catch(() => {});
  }, []);

  const stats = useMemo(() => {
    const ok = activity.filter((a) => a.ok);
    const byOp = new Map<string, number>();
    activity.forEach((a) => byOp.set(a.op.split(".")[0], (byOp.get(a.op.split(".")[0]) || 0) + 1));
    return {
      total: activity.length,
      avg: ok.length ? Math.round(ok.reduce((s, a) => s + a.ms, 0) / ok.length) : 0,
      rows: activity.reduce((s, a) => s + (a.rowCount || 0), 0),
      english: activity.filter((a) => a.op === "query.english").length,
      byOp: [...byOp.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [activity]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader title="Under the Hood" subtitle={<>Every live fact CallBrain uses comes from a <TwMark className="text-sm" /> call. This page logs all of them.</>} actions={<Badge tone={mode === "live" ? "ok" : "warn"}>{mode === "live" ? "live server" : "simulation"}</Badge>} />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Triggerware calls", stats.total],
          ["Avg latency", `${stats.avg} ms`],
          ["Rows read", stats.rows.toLocaleString()],
          ["Plain-English queries", stats.english],
        ].map(([l, v]) => (
          <div key={String(l)} className="rounded-xl border border-line bg-surface p-4">
            <div className="text-[11px] text-faint">{l}</div>
            <div className="mt-1 text-2xl font-semibold tracking-tight">{v}</div>
          </div>
        ))}
      </div>

      <Card className="mb-6" title="How it fits together">
        <div className="grid gap-3 text-[12.5px] md:grid-cols-4">
          {[
            ["1 · Live data", "Orbit's tickets, logins, deploys, billing and usage, exposed as Triggerware virtual tables."],
            ["2 · Triggerware", "Plain-English and SQL queries through cursors, triggers that push deltas via watch, saved queries, agents."],
            ["3 · Company brain", "Runbooks, policies, account notes and postmortems ground every answer, with citations."],
            ["4 · CallBrain", "During the call: diagnose, check blast radius, apply guardrails. After it: every promise becomes a trigger."],
          ].map(([t, d]) => (
            <div key={t} className={clsx("rounded-lg border p-3", t.includes("Triggerware") ? "border-tw/40 bg-tw-soft" : "border-line")}>
              <div className="mb-1 font-semibold">{t}</div>
              <div className="text-muted">{d}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card title="Triggerware activity" icon={<Activity className="size-4 text-tw" />} action={<div className="flex gap-1">{stats.byOp.slice(0, 4).map(([k, v]) => <Badge key={k}>{k} {v}</Badge>)}</div>}>
          <ul className="max-h-[640px] divide-y divide-line overflow-y-auto scroll-thin">
            {activity.map((a) => (
              <li key={a.id} className="py-2">
                <button className="flex w-full items-center gap-2 text-left" onClick={() => setOpen(open === a.id ? null : a.id)}>
                  {a.ok ? <CheckCircle2 className="size-3.5 text-ok" /> : <XCircle className="size-3.5 text-bad" />}
                  <span className="w-16 font-mono text-[11px] text-faint">{fmtTime(a.at)}</span>
                  <Badge tone={a.op.startsWith("trigger") ? "tw" : a.op.includes("english") ? "brand" : "neutral"}>{a.op}</Badge>
                  <span className="flex-1 truncate text-[12.5px]">{a.label || a.input}</span>
                  <span className="font-mono text-[11px] text-faint">{a.rowCount !== undefined ? `${a.rowCount} rows · ` : ""}{a.ms}ms</span>
                </button>
                {open === a.id && (
                  <div className="mt-2 space-y-1.5 pl-6">
                    {a.input && <p className="text-[12px] italic text-muted">{a.input}</p>}
                    {a.sql && <Sql sql={a.sql} compact />}
                    {a.error && <p className="text-[12px] text-bad">{a.error}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Company brain" icon={<BookOpen className="size-4 text-brand" />} className="h-fit">
          <ul className="space-y-2">
            {docs.map((d) => (
              <li key={d.id}>
                <div className="text-[12.5px] font-medium leading-snug">{d.title}</div>
                <div className="text-[11px] text-faint">{d.owner} · updated {d.updated}</div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
