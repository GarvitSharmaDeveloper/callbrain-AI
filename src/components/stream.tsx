"use client";
// One app-wide SSE connection: Triggerware activity, live signals, promise updates, demo notices.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Signal, TwActivity } from "@/lib/bus";

interface Toast { id: number; text: string; tone: "ok" | "tw" | "bad" | "neutral" }

export interface ChangeView {
  id: string;
  at: string;
  action: string;
  title: string;
  explanation: string;
  table: string;
  rows: Record<string, unknown>[];
  expect: string[];
  detections: { trigger: string; ms: number; rows: number; at: string }[];
  signals: { title: string; severity: string }[];
}
const matches = (expect: string[], trigger: string) => expect.some((e) => (e.endsWith("_") ? trigger.startsWith(e) : trigger === e));

interface StreamState {
  mode: "live" | "simulation" | null;
  connected: boolean;
  ready: boolean;
  bootError: string | null;
  signals: Signal[];
  activity: TwActivity[];
  promiseUpdates: Record<string, { status: string; kept_at: string }>;
  toasts: Toast[];
  toast: (text: string, tone?: Toast["tone"]) => void;
  unseenSignals: number;
  markSeen: () => void;
  changes: ChangeView[];
}

const Ctx = createContext<StreamState | null>(null);
export const useStream = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStream outside provider");
  return v;
};

export function StreamProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<StreamState["mode"]>(null);
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [activity, setActivity] = useState<TwActivity[]>([]);
  const [promiseUpdates, setPromiseUpdates] = useState<StreamState["promiseUpdates"]>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [unseenSignals, setUnseen] = useState(0);
  const [changes, setChanges] = useState<ChangeView[]>([]);
  const seq = useRef(0);
  const seen = useRef(new Set<string>());

  const toast = useCallback((text: string, tone: Toast["tone"] = "neutral") => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, text, tone }].slice(-4));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  useEffect(() => {
    // Hydrate history, then subscribe.
    fetch("/api/status")
      .then((r) => r.json())
      .then((s) => {
        setMode(s.mode);
        setSignals(s.signals || []);
        setActivity(s.activity || []);
        if (s.bootError) setBootError(s.bootError);
      })
      .catch(() => {});

    const es = new EventSource("/api/stream");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.addEventListener("hello", (e) => setMode(JSON.parse((e as MessageEvent).data).mode));
    es.addEventListener("ready", () => {
      setReady(true);
      setBootError(null);
    });
    es.addEventListener("boot_error", (e) => setBootError(JSON.parse((e as MessageEvent).data).message));
    es.addEventListener("tw", (e) => {
      const a = JSON.parse((e as MessageEvent).data) as TwActivity;
      setActivity((xs) => [a, ...xs].slice(0, 300));
      if (a.op === "trigger.delta" && a.label) {
        const t = new Date(a.at).getTime();
        setChanges((cs) => {
          // Attribute the delta to the most recent change that expects this trigger.
          const i = cs.findIndex((c) => matches(c.expect, a.label!) && new Date(c.at).getTime() <= t + 1000);
          if (i < 0) return cs;
          const c = cs[i];
          if (c.detections.some((d) => d.trigger === a.label)) return cs;
          const copy = cs.slice();
          copy[i] = { ...c, detections: [...c.detections, { trigger: a.label!, ms: Math.max(0, t - new Date(c.at).getTime()), rows: a.rowCount || 0, at: a.at }] };
          return copy;
        });
      }
    });
    es.addEventListener("signal", (e) => {
      const s = JSON.parse((e as MessageEvent).data) as Signal;
      if (!seen.current.has(s.id)) {
        seen.current.add(s.id);
        setUnseen((n) => n + 1);
      }
      setChanges((cs) => {
        const i = cs.findIndex((c) => matches(c.expect, s.trigger) && new Date(c.at).getTime() <= new Date(s.at).getTime() + 1000);
        if (i < 0 || cs[i].signals.some((x) => x.title === s.title)) return cs;
        const copy = cs.slice();
        copy[i] = { ...cs[i], signals: [...cs[i].signals, { title: s.title, severity: s.severity }] };
        return copy;
      });
      setSignals((xs) => {
        const i = xs.findIndex((x) => x.id === s.id);
        if (i >= 0) {
          const copy = xs.slice();
          copy[i] = { ...copy[i], ...s };
          return copy;
        }
        return [s, ...xs].slice(0, 150);
      });
    });
    es.addEventListener("promise", (e) => {
      const p = JSON.parse((e as MessageEvent).data);
      setPromiseUpdates((m) => ({ ...m, [p.id]: p }));
      toast("Promise kept — Triggerware saw it happen. Customer notified.", "ok");
    });
    es.addEventListener("change", (e) => {
      const c = JSON.parse((e as MessageEvent).data);
      if (c.action === "reset") {
        setSignals([]);
        setChanges([{ ...c, detections: [], signals: [] }]);
        return;
      }
      setChanges((cs) => (cs.some((x) => x.id === c.id) ? cs : [{ ...c, detections: [], signals: [] }, ...cs].slice(0, 30)));
    });
    es.addEventListener("demo", (e) => toast(JSON.parse((e as MessageEvent).data).message, "neutral"));
    return () => es.close();
  }, [toast]);

  return (
    <Ctx.Provider value={{ mode, connected, ready, bootError, signals, activity, promiseUpdates, toasts, toast, unseenSignals, markSeen: () => setUnseen(0), changes }}>
      {children}
    </Ctx.Provider>
  );
}
