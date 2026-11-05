"use client";
import { Bot, Boxes, Code2, Cpu, Database, Plug, Sparkles, Table2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useStream } from "@/components/stream";
import { Badge, Button, Card, PageHeader, TwMark } from "@/components/ui";

interface Sources { mode: string; tables: string[]; connectors: string[]; catalog: { name: string; description: string }[]; agents: string[]; runtimes: string[]; saved: string[] }

export default function DataPage() {
  const [src, setSrc] = useState<Sources | null>(null);
  const [table, setTable] = useState<{ name: string; prompt?: string; code: string; runtime: string; columns: { name: string; type: string }[] } | null>(null);
  const [tablePrompt, setTablePrompt] = useState("A table of current Atlassian Statuspage incidents for Okta from https://status.okta.com/api/v2/incidents/unresolved.json with columns id, name, status, impact, created_at");
  const [agentPrompt, setAgentPrompt] = useState("When login failures spike across customers, summarize which customers are affected, the most recent auth-service deploy, and draft a status-page update.");
  const [busy, setBusy] = useState<string | null>(null);
  const { toast, ready } = useStream();

  const load = useCallback(async () => setSrc(await (await fetch("/api/sources")).json()), []);
  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  const openTable = async (name: string) => {
    const r = await fetch(`/api/sources/table/${name}`);
    const j = await r.json();
    if (r.ok) setTable(j);
    else toast(j.error, "bad");
  };

  const create = async (kind: "table" | "agent") => {
    setBusy(kind);
    try {
      const r = await fetch("/api/sources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(kind === "table" ? { kind, prompt: tablePrompt, name: "okta_status_incidents" } : { kind, prompt: agentPrompt, triggers: ["cb_auth_failure_spike"] }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      toast(kind === "table" ? `Triggerware generated table ${j.name}` : `Triggerware agent ${j.name} created`, "tw");
      if (kind === "table") setTable(j);
      load();
    } catch (e) {
      toast(String((e as Error).message), "bad");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader title="Data Sources" subtitle={<>Everything CallBrain knows about live systems comes through <TwMark className="text-sm" />: virtual tables, connectors, saved queries, triggers and agents. New sources can be added in plain English.</>} actions={<Badge tone={src?.mode === "live" ? "ok" : "warn"}>{src?.mode === "live" ? "Live Triggerware server" : "Simulation mode"}</Badge>} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Virtual tables" icon={<Table2 className="size-4 text-tw" />} className="lg:col-span-1">
          <ul className="max-h-80 space-y-1 overflow-y-auto scroll-thin">
            {(src?.tables || []).map((t) => (
              <li key={t}><button onClick={() => openTable(t)} className="w-full rounded-md px-2 py-1 text-left font-mono text-[12px] hover:bg-surface-2">{t}</button></li>
            ))}
            {src && src.tables.length === 0 && <li className="text-xs text-faint">{src.mode === "live" ? "No tables yet: run setup." : "Simulation mode reads Orbit's database directly."}</li>}
          </ul>
        </Card>
        <Card title="Connectors & runtimes" icon={<Plug className="size-4 text-brand" />}>
          <div className="space-y-3 text-[12.5px]">
            <div><div className="mb-1 text-[11px] uppercase tracking-wide text-faint">Installed</div><div className="flex flex-wrap gap-1">{(src?.connectors || []).map((c) => <Badge key={c} tone="brand">{c}</Badge>)}</div></div>
            <div><div className="mb-1 text-[11px] uppercase tracking-wide text-faint">Runtimes</div><div className="flex flex-wrap gap-1">{(src?.runtimes || []).map((c) => <Badge key={c}><Cpu className="size-3" />{c}</Badge>)}</div></div>
            <div><div className="mb-1 text-[11px] uppercase tracking-wide text-faint">Catalog</div>
              <ul className="max-h-36 space-y-1 overflow-y-auto scroll-thin">{(src?.catalog || []).map((c) => <li key={c.name}><span className="font-medium">{c.name}</span> <span className="text-faint">· {c.description}</span></li>)}</ul>
            </div>
          </div>
        </Card>
        <Card title="Saved queries & agents" icon={<Boxes className="size-4 text-ok" />}>
          <div className="space-y-3 text-[12.5px]">
            <div><div className="mb-1 text-[11px] uppercase tracking-wide text-faint">Saved queries</div><div className="flex flex-wrap gap-1">{(src?.saved || []).map((c) => <Badge key={c}>{c}</Badge>)}</div></div>
            <div><div className="mb-1 text-[11px] uppercase tracking-wide text-faint">Triggerware agents</div><div className="flex flex-wrap gap-1">{(src?.agents || []).map((c) => <Badge key={c} tone="tw"><Bot className="size-3" />{c}</Badge>)}{src?.agents.length === 0 && <span className="text-faint">none yet</span>}</div></div>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card tone="tw" title="Add a data source in plain English" icon={<Sparkles className="size-4 text-tw" />}>
          <p className="mb-2 text-xs text-muted">Triggerware writes the connector code and registers a queryable table. The copilot can use it immediately.</p>
          <textarea value={tablePrompt} onChange={(e) => setTablePrompt(e.target.value)} rows={3} className="w-full rounded-lg border border-line bg-surface p-2.5 text-[13px] outline-none focus:border-tw" />
          <Button variant="tw" className="mt-2" onClick={() => create("table")} loading={busy === "table"}><Database className="size-3.5" /> Generate table</Button>
        </Card>
        <Card tone="tw" title="Create a Triggerware agent" icon={<Bot className="size-4 text-tw" />}>
          <p className="mb-2 text-xs text-muted">Agents run inside Triggerware and can be bound to triggers. This one wakes up on <span className="font-mono">cb_auth_failure_spike</span>.</p>
          <textarea value={agentPrompt} onChange={(e) => setAgentPrompt(e.target.value)} rows={3} className="w-full rounded-lg border border-line bg-surface p-2.5 text-[13px] outline-none focus:border-tw" />
          <Button variant="tw" className="mt-2" onClick={() => create("agent")} loading={busy === "agent"}><Bot className="size-3.5" /> Create agent</Button>
        </Card>
      </div>

      {table && (
        <Card className="mt-4" title={<span className="font-mono">{table.name}</span>} icon={<Code2 className="size-4 text-brand" />} action={<Badge>{table.runtime}</Badge>}>
          {table.prompt && <p className="mb-2 text-[12.5px] italic text-muted">“{table.prompt}”</p>}
          {table.columns?.length > 0 && <div className="mb-2 flex flex-wrap gap-1">{table.columns.map((c) => <Badge key={c.name}>{c.name}: {c.type}</Badge>)}</div>}
          <pre className="max-h-96 overflow-auto rounded-lg bg-code-bg p-3 font-mono text-[11.5px] leading-relaxed text-code-fg scroll-thin">{table.code}</pre>
        </Card>
      )}
    </div>
  );
}
