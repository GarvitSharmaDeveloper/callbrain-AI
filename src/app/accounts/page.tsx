"use client";
import clsx from "clsx";
import { Radar, RefreshCw, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useStream } from "@/components/stream";
import { Badge, Button, Card, PageHeader, TwMark, fmtMoney } from "@/components/ui";

interface Acct { id: string; name: string; plan: string; arr: number; health: number; csm: string; open_p1: number }

export default function AccountsPage() {
  const [rows, setRows] = useState<Acct[]>([]);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);
  const { toast, ready, signals } = useStream();

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/accounts");
    const j = await r.json();
    if (Array.isArray(j)) setRows(j);
    else toast(j.error, "bad");
    setLoading(false);
  }, [toast]);
  useEffect(() => {
    if (ready) load();
  }, [ready, load, signals.length]);

  const convert = async () => {
    setConverting(true);
    const r = await fetch("/api/accounts", { method: "POST" });
    const j = await r.json();
    toast(r.ok ? "Saved query converted into a live trigger: cb_open_p1_watch" : j.error, r.ok ? "tw" : "bad");
    setConverting(false);
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        title="Account Radar"
        subtitle={<>A <TwMark className="text-sm" /> <b>saved query</b> ranks accounts by open P1s, health and ARR. One click converts it into a trigger, so the radar watches itself.</>}
        actions={
          <>
            <Button variant="secondary" onClick={load} loading={loading}><RefreshCw className="size-3.5" /> Refresh</Button>
            <Button variant="tw" onClick={convert} loading={converting}><Zap className="size-3.5 fill-current" /> Convert to trigger</Button>
          </>
        }
      />
      <Card title="Accounts at risk" icon={<Radar className="size-4 text-brand" />} action={<span className="font-mono text-[11px] text-faint">saved queries · cb_account_list + cb_open_p1_by_account</span>}>
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-faint">
              <tr><th className="pb-2 font-medium">Account</th><th className="pb-2 font-medium">Plan</th><th className="pb-2 text-right font-medium">ARR</th><th className="pb-2 font-medium">Health</th><th className="pb-2 font-medium">CSM</th><th className="pb-2 text-right font-medium">Open P1s</th></tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className={clsx("border-t border-line", Number(a.open_p1) > 0 && "bg-bad-soft/50")}>
                  <td className="py-2 font-medium">{a.name}</td>
                  <td className="py-2"><Badge tone={a.plan === "Enterprise" ? "brand" : "neutral"}>{a.plan}</Badge></td>
                  <td className="py-2 text-right font-mono text-[13px]">{fmtMoney(a.arr)}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2"><div className={clsx("h-full rounded-full", a.health < 70 ? "bg-bad" : a.health < 80 ? "bg-warn" : "bg-ok")} style={{ width: `${a.health}%` }} /></div>
                      <span className="text-xs text-muted">{a.health}</span>
                    </div>
                  </td>
                  <td className="py-2 text-muted">{a.csm}</td>
                  <td className="py-2 text-right">{Number(a.open_p1) > 0 ? <Badge tone="bad">{a.open_p1}</Badge> : <span className="text-faint">0</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
