"use client";
import { Pause, Play, RefreshCw, Sparkles, Trash2, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useStream } from "@/components/stream";
import { Badge, Button, Card, Empty, PageHeader, Sql, TwMark } from "@/components/ui";

interface Trig { name: string; description: string; sql: string; schedule?: string; enabled: boolean; kind: string; title: string; prompt?: string }

const EXAMPLES = [
  "Tell me when any Enterprise customer has more than 10 failed logins in the last 15 minutes",
  "Alert when a payment fails for a customer whose renewal is within 30 days",
  "Notify me when a P1 ticket has been open for more than 20 minutes without an assignee",
  "Watch for a deploy to billing-service",
];

export default function ReflexesPage() {
  const [items, setItems] = useState<Trig[]>([]);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<Trig | null>(null);
  const { toast, ready } = useStream();

  const load = useCallback(async () => {
    const r = await fetch("/api/triggers");
    const j = await r.json();
    if (Array.isArray(j)) setItems(j);
    setLoading(false);
  }, []);
  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  const create = async () => {
    setCreating(true);
    setCreated(null);
    try {
      const r = await fetch("/api/triggers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setCreated({ ...j, kind: "reflex", title: prompt });
      setPrompt("");
      toast("Reflex is live: Triggerware is watching.", "tw");
      load();
    } catch (e) {
      toast(String((e as Error).message), "bad");
    } finally {
      setCreating(false);
    }
  };

  const op = async (name: string, o: "run" | "enable" | "disable" | "delete") => {
    const r = o === "delete" ? await fetch(`/api/triggers/${name}`, { method: "DELETE" }) : await fetch(`/api/triggers/${name}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: o }) });
    const j = await r.json();
    if (!r.ok) toast(j.error, "bad");
    else if (o === "run") toast(`Ran now: +${j.added?.length ?? 0} / −${j.deleted?.length ?? 0} rows`, "tw");
    load();
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader title="Reflexes" subtitle={<>Give the company new reflexes in plain English. <TwMark className="text-sm" /> turns each sentence into a live trigger over production data, and CallBrain attaches company knowledge to every alert.</>} />

      <Card tone="tw" className="mb-6">
        <div className="p-4">
          <label className="mb-2 block text-sm font-medium">When should CallBrain speak up?</label>
          <div className="flex gap-2">
            <input value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && prompt.length > 8 && create()} placeholder="e.g. Tell me when an Enterprise customer opens a billing ticket" className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-tw" />
            <Button variant="tw" onClick={create} loading={creating} disabled={prompt.length < 8} className="h-10"><Sparkles className="size-4" /> Create reflex</Button>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {EXAMPLES.map((e) => <button key={e} onClick={() => setPrompt(e)} className="rounded-full border border-line px-2.5 py-1 text-[11.5px] text-muted hover:border-tw/40 hover:text-fg">{e}</button>)}
          </div>
          {created && (
            <div className="slide-in mt-4 rounded-lg border border-line p-3">
              <div className="mb-1.5 flex items-center gap-2 text-[13px] font-medium"><Zap className="size-3.5 fill-current text-tw" /> Triggerware compiled your sentence into <span className="font-mono text-tw">{created.name}</span></div>
              <Sql sql={created.sql} compact />
              <div className="mt-1.5 text-[11px] text-faint">Schedule: {created.schedule || "Triggerware default"} · status: enabled · watching</div>
            </div>
          )}
        </div>
      </Card>

      <Card title="Active triggers" icon={<Zap className="size-4 fill-current text-tw" />} action={<Button size="sm" variant="ghost" onClick={load}><RefreshCw className="size-3.5" /></Button>}>
        {loading ? <p className="text-sm text-faint">Loading…</p> : items.length === 0 ? <Empty title="No triggers yet" /> : (
          <ul className="divide-y divide-line">
            {items.map((t) => (
              <li key={t.name} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[12.5px] font-medium">{t.name}</span>
                  <Badge tone={t.kind === "reflex" ? "tw" : t.kind === "promise" ? "ok" : "neutral"}>{t.kind}</Badge>
                  <Badge tone={t.enabled ? "ok" : "neutral"}>{t.enabled ? "enabled" : "paused"}</Badge>
                  {t.schedule && <span className="text-[11px] text-faint">{t.schedule}</span>}
                  <div className="ml-auto flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => op(t.name, "run")} title="Run now"><Play className="size-3.5" /> Run now</Button>
                    <Button size="sm" variant="ghost" onClick={() => op(t.name, t.enabled ? "disable" : "enable")}>{t.enabled ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}</Button>
                    <Button size="sm" variant="ghost" onClick={() => op(t.name, "delete")}><Trash2 className="size-3.5" /></Button>
                  </div>
                </div>
                <p className="mt-1 text-[12.5px] text-muted">{t.title || t.description}</p>
                <Sql sql={t.sql} compact className="mt-1.5" />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
