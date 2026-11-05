"use client";
import type { CopilotEvent } from "@/lib/copilot";

/** POST + read a server-sent-events response. */
export async function postSse(url: string, body: unknown, onEvent: (type: string, data: unknown) => void, signal?: AbortSignal) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  if (!res.body) throw new Error("No stream");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const ev = /^event: (.*)$/m.exec(chunk)?.[1] || "message";
      const data = /^data: (.*)$/m.exec(chunk)?.[1];
      if (data) onEvent(ev, JSON.parse(data));
    }
  }
}

export interface Lookup {
  id: string;
  mode: "english" | "sql";
  text: string;
  purpose: string;
  sql?: string;
  rowCount?: number;
  ms?: number;
  preview?: Record<string, unknown>[];
  error?: string;
  done: boolean;
  round: number;
}

export type { CopilotEvent };

export const DEMO_SCRIPT = [
  "Hi, this is Dana Whitfield from Bluebird Logistics. None of our dispatchers can log in since this morning — they get some 'assertion expired' error. It's peak season and our trucks are sitting idle.",
  "And on top of that, Marcus in finance says we were charged twice for November. Honestly, after what happened in August, this is going straight to our CFO.",
  "Can you at least give us a credit for today? This is costing us real money.",
  "Okay. So when will this actually be fixed, and how will I know?",
];

// Minimal typing for the Web Speech API (Chrome).
export interface SpeechRec {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
}
export function createRecognizer(): SpeechRec | null {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  const C = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!C) return null;
  const r = new C();
  r.continuous = true;
  r.interimResults = true;
  r.lang = "en-US";
  return r;
}
