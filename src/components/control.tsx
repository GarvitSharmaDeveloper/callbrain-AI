"use client";
import clsx from "clsx";
import { ArrowRight, CheckCircle2, CreditCard, Database, Flame, Loader2, LogIn, Receipt, RotateCcw, Rocket, Siren, Ticket, Undo2, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { useStream, type ChangeView } from "./stream";
import { Badge, Button, TwMark, ago } from "./ui";

interface Cust { id: string; name: string }

const ACTIONS = [
  { action: "scenario_break", label: "Bad deploy hits Okta SSO", hint: "Full incident: deploy + ~200 failed logins + P1s + double charge", icon: Flame, tone: "bad", needsCustomer: false },
  { action: "login_burst", label: "Failed-login burst", hint: "Insert failed logins for a customer", icon: LogIn, tone: "warn", needsCustomer: true },
  { action: "p1_ticket", label: "Customer opens a P1", hint: "Insert an open P1 ticket", icon: Ticket, tone: "bad", needsCustomer: true },
  { action: "double_charge", label: "Double charge", hint: "Payment retry charges an invoice twice", icon: CreditCard, tone: "warn", needsCustomer: true },
  { action: "refund", label: "Issue refund", hint: "Finance refunds the latest payment", icon: Receipt, tone: "ok", needsCustomer: true },
  { action: "deploy", label: "Ship a deploy", hint: "Routine dispatch-ui release", icon: Rocket, tone: "neutral", needsCustomer: false },
  { action: "incident_declare", label: "Declare incident", hint: "Open INC-2041 (SEV2)", icon: Siren, tone: "bad", needsCustomer: false },
  { action: "scenario_rollback", label: "Roll back auth-service", hint: "Fix ships, incident resolved, promises kept", icon: Undo2, tone: "ok", needsCustomer: false },
] as const;

export function ControlRoom({ compact = false }: { compact?: boolean }) {
  const { changes, toast } = useStream();
  const [customers, setCustomers] = useState<Cust[]>([]);
  const [customer, setCustomer] = useState("cust_bluebird");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/customers").then((r) => r.json()).then((c) => Array.isArray(c) && setCustomers(c)).catch(() => {});
  }, []);

  const run = async (action: string) => {
    setBusy(action);
    try {
      const r = await fetch("/api/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, params: { customerId: customer } }) });
      const j = await r.json();
      if (!r.ok) toast(j.error || "Failed", "bad");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={clsx("grid gap-4", !compact && "lg:grid-cols-[380px_minmax(0,1fr)]")}>
      <div>
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Customer</span>
          <select value={customer} onChange={(e) => setCustomer(e.target.value)} className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 text-[13px] outline-none focus:border-brand">
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className={clsx("grid gap-1.5", compact ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-1")}>
          {ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <button key={a.action} disabled={!!busy} onClick={() => run(a.action)} className="group flex items-start gap-2.5 rounded-lg border border-line bg-surface px-3 py-2 text-left transition-colors hover:border-tw/40 hover:bg-tw-soft disabled:opacity-50">
                {busy === a.action ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-tw" /> : <Icon className={clsx("mt-0.5 size-4 shrink-0", a.tone === "bad" ? "text-bad" : a.tone === "warn" ? "text-warn" : a.tone === "ok" ? "text-ok" : "text-brand")} />}
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium leading-tight">{a.label}</span>
                  {!compact && <span className="block text-[11px] text-faint">{a.hint}{a.needsCustomer ? " · selected customer" : ""}</span>}
                </span>
              </button>
            );
          })}
        </div>
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => run("reset")} loading={busy === "reset"}><RotateCcw className="size-3.5" /> Reset demo data</Button>
      </div>
      <div className="min-w-0">
        {!compact && <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">What changed → what Triggerware detected</div>}
        <div className={clsx("space-y-2 overflow-y-auto scroll-thin", compact ? "max-h-72" : "max-h-[70vh]")}>
          {changes.length === 0 && <p className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-faint">Click any action. It writes real rows to Orbit&apos;s database. CallBrain doesn&apos;t tell Triggerware anything; you&apos;ll see Triggerware detect the change and push it back here.</p>}
          {changes.map((c) => <ChangeCard key={c.id} c={c} compact={compact} />)}
        </div>
      </div>
    </div>
  );
}

function ChangeCard({ c, compact }: { c: ChangeView; compact: boolean }) {
  const waiting = c.expect.filter((e) => !c.detections.some((d) => (e.endsWith("_") ? d.trigger.startsWith(e) : d.trigger === e)));
  return (
    <div className="slide-in rounded-xl border border-line bg-surface p-3">
      <div className="flex items-start gap-2">
        <Database className="mt-0.5 size-4 shrink-0 text-brand" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold leading-tight">{c.title}</span>
            <span className="ml-auto shrink-0 text-[10.5px] text-faint">{ago(c.at)}</span>
          </div>
          {!compact && <p className="mt-0.5 text-[12px] leading-snug text-muted">{c.explanation}</p>}
          <div className="mt-1 text-[11px] text-faint">wrote to <span className="font-mono">{c.table}</span></div>
        </div>
      </div>
      {c.expect.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-line pt-2">
          {c.detections.map((d) => (
            <div key={d.trigger} className="slide-in flex items-center gap-1.5 text-[12px]">
              <CheckCircle2 className="size-3.5 text-ok" />
              <TwMark className="text-[12px]" label="Detected" />
              <span>by <span className="font-mono">{d.trigger}</span></span>
              <Badge tone="tw" className="ml-auto">{(d.ms / 1000).toFixed(1)}s · {d.rows} row{d.rows === 1 ? "" : "s"}</Badge>
            </div>
          ))}
          {waiting.filter((w) => !w.endsWith("_")).map((w) => (
            <div key={w} className="flex items-center gap-1.5 text-[12px] text-faint">
              <Loader2 className="size-3.5 animate-spin text-tw" /> waiting for <span className="font-mono">{w}</span>…
            </div>
          ))}
          {c.signals.map((s) => (
            <div key={s.title} className="slide-in flex items-center gap-1.5 text-[12px]">
              <ArrowRight className="size-3.5 text-brand" />
              <span className="truncate">Signal: <span className="font-medium">{s.title}</span></span>
              <Zap className={clsx("ml-auto size-3 shrink-0", s.severity === "critical" ? "text-bad" : s.severity === "success" ? "text-ok" : "text-warn")} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
