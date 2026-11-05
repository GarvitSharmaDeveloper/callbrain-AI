"use client";
import clsx from "clsx";
import { Activity, BellRing, Brain, Clapperboard, Database, Gauge, Headset, Radar, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { StreamProvider, useStream } from "./stream";
import { Button, TwMark } from "./ui";
import { ControlRoom } from "./control";

const NAV = [
  { href: "/call", label: "Live Call", icon: Headset },
  { href: "/control", label: "Control Room", icon: Gauge },
  { href: "/signals", label: "Signals", icon: BellRing, badge: true },
  { href: "/reflexes", label: "Reflexes", icon: Sparkles },
  { href: "/accounts", label: "Accounts", icon: Radar },
  { href: "/data", label: "Data Sources", icon: Database },
  { href: "/under-the-hood", label: "Under the Hood", icon: Activity },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <StreamProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <Toasts />
      <Director />
    </StreamProvider>
  );
}

function Sidebar() {
  const path = usePathname();
  const { unseenSignals, markSeen } = useStream();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
      <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
        <div className="grid size-8 place-items-center rounded-lg bg-brand text-white">
          <Brain className="size-4.5" />
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-tight">CallBrain</div>
          <div className="text-[11px] text-faint">Orbit Support</div>
        </div>
      </div>
      <nav className="flex flex-col gap-0.5 px-3">
        {NAV.map(({ href, label, icon: Icon, badge }) => {
          const active = path?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={badge ? markSeen : undefined}
              className={clsx("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors", active ? "bg-brand-soft font-medium text-brand" : "text-muted hover:bg-surface-2 hover:text-fg")}
            >
              <Icon className="size-4" />
              <span className="flex-1">{label}</span>
              {badge && unseenSignals > 0 && !active && <span className="rounded-full bg-tw px-1.5 text-[10px] font-semibold text-white">{unseenSignals}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto p-3">
        <TwStatus />
      </div>
    </aside>
  );
}

function TwStatus() {
  const { mode, connected, ready, bootError, activity } = useStream();
  const live = mode === "live";
  const state = bootError ? "error" : !connected ? "offline" : ready ? "ok" : "booting";
  return (
    <div className="rounded-xl border border-tw/30 bg-tw-soft p-3">
      <div className="flex items-center justify-between">
        <TwMark className="text-xs" />
        <span className={clsx("size-2 rounded-full", state === "ok" ? "bg-ok pulse-tw" : state === "error" ? "bg-bad" : "bg-warn")} />
      </div>
      <div className="mt-1.5 text-[11px] leading-snug text-muted">
        {state === "error" ? <span className="text-bad">{bootError}</span> : state === "booting" ? "Registering triggers…" : state === "offline" ? "Reconnecting…" : live ? "Connected · live triggers watching" : "Simulation mode · triggers watching"}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-faint">
        <span>{activity.length} calls this session</span>
        <span className="font-medium uppercase tracking-wide">{live ? "LIVE" : "SIM"}</span>
      </div>
    </div>
  );
}

function Toasts() {
  const { toasts } = useStream();
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={clsx("slide-in pointer-events-auto max-w-lg rounded-lg border px-4 py-2.5 text-sm shadow-lg", t.tone === "ok" ? "border-ok/30 bg-ok-soft text-ok" : t.tone === "tw" ? "border-tw/30 bg-tw-soft text-tw" : t.tone === "bad" ? "border-bad/30 bg-bad-soft text-bad" : "border-line bg-surface text-fg")}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

function Director() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  if (path?.startsWith("/control")) return null;
  return (
    <div className="fixed bottom-4 right-4 z-40">
      {open ? (
        <div className="slide-in w-[420px] max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold"><Clapperboard className="size-4" /> Control Room</div>
            <button onClick={() => setOpen(false)} className="text-faint hover:text-fg" aria-label="Close"><X className="size-4" /></button>
          </div>
          <ControlRoom compact />
        </div>
      ) : (
        <Button size="sm" variant="tw" onClick={() => setOpen(true)} className="shadow-md">
          <Clapperboard className="size-3.5" /> Control Room
        </Button>
      )}
    </div>
  );
}
