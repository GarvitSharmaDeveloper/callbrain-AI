// Process-wide event bus used to fan out Triggerware activity and live signals to SSE clients.
import { EventEmitter } from "events";

export type BusEvent =
  | { type: "tw"; data: TwActivity }
  | { type: "signal"; data: Signal }
  | { type: "promise"; data: unknown }
  | { type: "demo"; data: { message: string } }
  | { type: "change"; data: unknown };

export interface TwActivity {
  id: string;
  at: string;
  op: string; // e.g. "query.english", "query.sql", "trigger.create", "trigger.poll"
  label?: string;
  input?: string;
  sql?: string;
  rowCount?: number;
  ms: number;
  ok: boolean;
  error?: string;
  mode: "live" | "simulation";
}

export interface Signal {
  id: string;
  at: string;
  trigger: string;
  title: string;
  severity: "info" | "warning" | "critical" | "success";
  summary: string;
  customers?: string[];
  added: unknown[][];
  deleted: unknown[][];
  signature?: string[];
  sql?: string;
  brief?: string;
  sources?: string[];
}

const g = globalThis as unknown as {
  __cbBus?: EventEmitter;
  __cbTw?: TwActivity[];
  __cbSignals?: Signal[];
};

export const bus: EventEmitter = g.__cbBus || (g.__cbBus = new EventEmitter().setMaxListeners(200));
export const twLog: TwActivity[] = g.__cbTw || (g.__cbTw = []);
export const signalLog: Signal[] = g.__cbSignals || (g.__cbSignals = []);

export function emit(ev: BusEvent) {
  if (ev.type === "tw") {
    twLog.unshift(ev.data);
    if (twLog.length > 500) twLog.length = 500;
  }
  if (ev.type === "signal") {
    const i = signalLog.findIndex((x) => x.id === ev.data.id);
    if (i >= 0) {
      signalLog[i] = { ...signalLog[i], ...ev.data };
      bus.emit("event", ev);
      return;
    }
    signalLog.unshift(ev.data);
    if (signalLog.length > 200) signalLog.length = 200;
  }
  bus.emit("event", ev);
}

export const uid = (p = "") => p + Math.random().toString(36).slice(2, 10);
