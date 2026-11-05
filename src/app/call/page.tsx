"use client";
import clsx from "clsx";
import { ArrowRight, CheckCircle2, Clock, Headset, Mic, MicOff, Phone, PhoneIncoming, PhoneOff, Play, Send, User, Zap } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Briefing } from "@/lib/briefing";
import type { CopilotState, TranscriptLine } from "@/lib/copilot";
import type { WrapupResult } from "@/lib/wrapup";
import { BriefingPanel, CopilotPanel, LookupsPanel } from "@/components/call/panels";
import { DEMO_SCRIPT, Lookup, createRecognizer, postSse, type SpeechRec } from "@/components/call/lib";
import { useStream } from "@/components/stream";
import { Badge, Button, Card, Sql, TwMark, fmtMoney } from "@/components/ui";

interface Customer { id: string; name: string; plan: string; arr: number; sso_provider: string; health: number; csm: string }

export default function CallPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [docs, setDocs] = useState<Record<string, string>>({});
  const [active, setActive] = useState<Customer | null>(null);
  const [phase, setPhase] = useState<"queue" | "live" | "wrapup">("queue");
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [copilot, setCopilot] = useState<CopilotState | null>(null);
  const [thinking, setThinking] = useState(false);
  const [lookups, setLookups] = useState<Lookup[]>([]);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [actionsDone, setActionsDone] = useState<string[]>([]);
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [wrap, setWrap] = useState<WrapupResult | null>(null);
  const [wrapping, setWrapping] = useState(false);
  const [startedAt, setStartedAt] = useState<number>(0);
  const { toast, promiseUpdates, ready } = useStream();

  const round = useRef(0);
  const inflight = useRef(false);
  const pending = useRef(false);
  const latest = useRef<{ transcript: TranscriptLine[]; copilot: CopilotState | null }>({ transcript: [], copilot: null });
  latest.current = { transcript, copilot };

  useEffect(() => {
    if (!ready) return;
    fetch("/api/customers").then((r) => r.json()).then((c) => Array.isArray(c) && setCustomers(c)).catch(() => {});
  }, [ready]);
  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then((s) => setDocs(Object.fromEntries((s.knowledge || []).map((d: { id: string; title: string }) => [d.id, d.title])))).catch(() => {});
  }, []);

  const accept = async (c: Customer) => {
    setActive(c);
    setPhase("live");
    setStartedAt(Date.now());
    setBriefing(null);
    setBriefingError(null);
    setTranscript([]);
    setCopilot(null);
    setLookups([]);
    setActionsDone([]);
    setActionLog([]);
    setWrap(null);
    try {
      const r = await fetch("/api/briefing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerId: c.id }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setBriefing(j);
    } catch (e) {
      setBriefingError(String((e as Error).message));
    }
  };

  const runCopilot = useCallback(async () => {
    if (!active) return;
    if (inflight.current) {
      pending.current = true;
      return;
    }
    inflight.current = true;
    setThinking(true);
    const r = ++round.current;
    try {
      await postSse("/api/copilot", { customerId: active.id, customerName: active.name, transcript: latest.current.transcript, previous: latest.current.copilot }, (type, data) => {
        const d = data as Record<string, unknown>;
        if (type === "query_start") {
          setLookups((ls) => [{ id: `${r}.${d.id}`, mode: d.mode as Lookup["mode"], text: String(d.text), purpose: String(d.purpose), done: false, round: r }, ...ls]);
        } else if (type === "query_end") {
          setLookups((ls) => ls.map((l) => (l.id === `${r}.${d.id}` ? { ...l, sql: String(d.sql), rowCount: Number(d.rowCount), ms: Number(d.ms), preview: d.preview as Lookup["preview"], error: d.error as string | undefined, done: true } : l)));
        } else if (type === "result") {
          const st = d.state as CopilotState;
          // Remap source ids (tw:q2) to this round's lookup ids (tw:3.q2).
          const fix = (ids: string[]) => ids.map((x) => (x.startsWith("tw:") && !x.includes(".") ? `tw:${r}.${x.slice(3)}` : x));
          setCopilot({
            ...st,
            diagnosis: st.diagnosis.map((x) => ({ ...x, sources: fix(x.sources) })),
            answer_cards: st.answer_cards.map((x) => ({ ...x, sources: fix(x.sources) })),
            guardrails: st.guardrails.map((x) => ({ ...x, sources: fix(x.sources) })),
          });
        } else if (type === "error") {
          toast(`Copilot: ${String(d.message)}`, "bad");
        }
      });
    } catch (e) {
      toast(`Copilot error: ${(e as Error).message}`, "bad");
    } finally {
      inflight.current = false;
      setThinking(false);
      if (pending.current) {
        pending.current = false;
        runCopilot();
      }
    }
  }, [active, toast]);

  const addLine = useCallback((line: TranscriptLine) => {
    setTranscript((t) => {
      const next = [...t, line];
      latest.current = { ...latest.current, transcript: next };
      return next;
    });
    setTimeout(() => runCopilot(), 50);
  }, [runCopilot]);

  // As soon as the call connects, scan live data for possible issues (no guidance until the customer raises something).
  useEffect(() => {
    if (phase === "live" && active) runCopilot();
  }, [phase, active, runCopilot]);

  const onAction = async (a: CopilotState["actions"][number]) => {
    if (!active) return;
    setActionBusy(a.kind);
    try {
      const r = await fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: a.kind, customerId: active.id, detail: a.detail }) });
      const j = await r.json();
      toast(j.message || j.error, r.ok ? "ok" : "bad");
      if (r.ok) {
        setActionsDone((x) => [...x, a.kind]);
        setActionLog((x) => [...x, `${a.label}: ${j.message}`]);
      }
    } finally {
      setActionBusy(null);
    }
  };

  const endCall = async () => {
    if (!active) return;
    setWrapping(true);
    try {
      const r = await fetch("/api/wrapup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerId: active.id, customerName: active.name, agent: "Alex Rivera", transcript, copilot, actions: actionLog }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setWrap(j);
      setPhase("wrapup");
    } catch (e) {
      toast(`Wrap-up failed: ${(e as Error).message}`, "bad");
    } finally {
      setWrapping(false);
    }
  };

  const askTw = async (question: string) => {
    const id = `ask${Date.now() % 100000}`;
    setLookups((ls) => [{ id, mode: "english", text: question, purpose: question, done: false, round: 0 }, ...ls]);
    const r = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
    const j = await r.json();
    setLookups((ls) => ls.map((l) => (l.id === id ? { ...l, done: true, sql: j.sql, rowCount: j.rowCount, ms: j.ms, preview: j.rows?.slice(0, 5), error: r.ok ? undefined : j.error } : l)));
    setHighlight(id);
    setTimeout(() => setHighlight(null), 4000);
  };

  const showLookup = (id: string) => {
    setHighlight(id);
    document.getElementById(`lookup-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => setHighlight(null), 2500);
  };

  if (phase === "queue" || !active) return <Queue customers={customers} onAccept={accept} />;

  if (phase === "wrapup" && wrap) return <Wrapup wrap={wrap} customer={active} promiseUpdates={promiseUpdates} onBack={() => setPhase("queue")} />;

  return (
    <div className="flex h-screen flex-col">
      <CallHeader customer={active} startedAt={startedAt} sentiment={copilot?.sentiment} onEnd={endCall} ending={wrapping} />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[300px_minmax(0,1fr)_400px] lg:overflow-hidden">
        <div className="min-h-0 overflow-y-auto scroll-thin lg:pr-1">
          {briefingError ? <Card title="Briefing unavailable"><p className="text-xs text-bad">{briefingError}</p></Card> : <BriefingPanel b={briefing} loading={!briefing} docs={docs} />}
        </div>
        <div className="flex min-h-0 flex-col gap-4">
          <Transcript lines={transcript} onAdd={addLine} thinking={thinking} />
          <LookupsPanel lookups={lookups} highlight={highlight} onAsk={askTw} />
        </div>
        <div className="min-h-0 overflow-y-auto scroll-thin lg:pr-1">
          <CopilotPanel
            state={copilot}
            thinking={thinking}
            docs={docs}
            onLookup={showLookup}
            onAction={onAction}
            onUseReply={(t) => addLine({ speaker: "agent", text: t })}
            actionBusy={actionBusy}
            actionsDone={actionsDone}
          />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------

function Queue({ customers, onAccept }: { customers: Customer[]; onAccept: (c: Customer) => void }) {
  const bluebird = customers.find((c) => c.id === "cust_bluebird");
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Live Call</h1>
        <p className="mt-1 text-sm text-muted">CallBrain listens to the call, checks Orbit&apos;s live systems through <TwMark className="text-sm" />, and hands you the answer, the policy and the next step.</p>
      </div>
      {bluebird ? (
        <div className="slide-in mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-brand/30 bg-surface p-5 shadow-sm">
          <div className="grid size-12 place-items-center rounded-full bg-brand text-white">
            <PhoneIncoming className="ringing size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-brand">Incoming call · Enterprise priority line</div>
            <div className="text-lg font-semibold">Dana Whitfield · {bluebird.name}</div>
            <div className="text-sm text-muted">IT Director · {fmtMoney(bluebird.arr)} ARR · {bluebird.sso_provider} SSO · CSM {bluebird.csm}</div>
          </div>
          <Button variant="primary" onClick={() => onAccept(bluebird)} className="h-11 px-5">
            <Phone className="size-4" /> Accept call
          </Button>
        </div>
      ) : (
        <div className="mb-6 h-24 skeleton rounded-2xl" />
      )}
      <Card title="Or start a call with any customer" icon={<Headset className="size-4 text-muted" />}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {customers.map((c) => (
            <button key={c.id} onClick={() => onAccept(c)} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-left hover:border-brand/40 hover:bg-brand-soft">
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">{c.name}</span>
                <span className="block text-[11px] text-faint">{c.plan} · {fmtMoney(c.arr)} · {c.sso_provider}</span>
              </span>
              <ArrowRight className="size-3.5 text-faint" />
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function CallHeader({ customer, startedAt, sentiment, onEnd, ending }: { customer: Customer; startedAt: number; sentiment?: string; onEnd: () => void; ending: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - startedAt) / 1000));
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-3">
      <div className="grid size-9 place-items-center rounded-full bg-brand-soft text-brand"><User className="size-4" /></div>
      <div className="min-w-0">
        <div className="text-[15px] font-semibold leading-tight">{customer.id === "cust_bluebird" ? "Dana Whitfield" : "Customer"} · {customer.name}</div>
        <div className="text-xs text-muted">{customer.plan} · {fmtMoney(customer.arr)} ARR · {customer.sso_provider} SSO</div>
      </div>
      <Badge tone="ok" className="ml-2"><span className="size-1.5 rounded-full bg-ok pulse-tw" /> On call</Badge>
      <span className="flex items-center gap-1 font-mono text-sm text-muted"><Clock className="size-3.5" />{String(Math.floor(s / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}</span>
      {sentiment && <Badge tone={sentiment === "calm" ? "ok" : sentiment === "concerned" ? "warn" : "bad"}>customer {sentiment}</Badge>}
      <div className="ml-auto">
        <Button variant="danger" onClick={onEnd} loading={ending}><PhoneOff className="size-4" /> End call & wrap up</Button>
      </div>
    </header>
  );
}

function Transcript({ lines, onAdd, thinking }: { lines: TranscriptLine[]; onAdd: (l: TranscriptLine) => void; thinking: boolean }) {
  const [speaker, setSpeaker] = useState<"customer" | "agent">("agent");
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [scriptIdx, setScriptIdx] = useState(0);
  const rec = useRef<SpeechRec | null>(null);
  const speakerRef = useRef(speaker);
  speakerRef.current = speaker;
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [lines.length, interim]);

  const toggleMic = () => {
    if (listening) {
      rec.current?.stop();
      setListening(false);
      return;
    }
    const r = createRecognizer();
    if (!r) {
      alert("Speech recognition needs Chrome. Use the text box or the demo script instead.");
      return;
    }
    r.onresult = (e) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          const t = res[0].transcript.trim();
          if (t) onAdd({ speaker: speakerRef.current, text: t });
        } else interimText += res[0].transcript;
      }
      setInterim(interimText);
    };
    r.onend = () => {
      setListening(false);
      setInterim("");
    };
    r.onerror = () => setListening(false);
    r.start();
    rec.current = r;
    setListening(true);
  };

  const submit = () => {
    if (!text.trim()) return;
    onAdd({ speaker, text: text.trim() });
    setText("");
  };

  return (
    <Card
      className="flex min-h-[320px] flex-1 flex-col overflow-hidden [&>div]:flex [&>div]:min-h-0 [&>div]:flex-1 [&>div]:flex-col"
      title="Live transcript"
      icon={<Mic className="size-4 text-brand" />}
      action={
        scriptIdx < DEMO_SCRIPT.length ? (
          <Button size="sm" variant="ghost" onClick={() => { onAdd({ speaker: "customer", text: DEMO_SCRIPT[scriptIdx] }); setScriptIdx((i) => i + 1); }}>
            <Play className="size-3" /> Demo line {scriptIdx + 1}/{DEMO_SCRIPT.length}
          </Button>
        ) : null
      }
    >
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto scroll-thin pb-2">
        {lines.length === 0 && !interim && <p className="py-10 text-center text-sm text-faint">Start talking (mic), type, or play the demo script. The copilot reacts to every line.</p>}
        {lines.map((l, i) => (
          <div key={i} className={clsx("slide-in flex", l.speaker === "agent" && "justify-end")}>
            <div className={clsx("max-w-[85%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-snug", l.speaker === "customer" ? "rounded-tl-sm bg-surface-2" : "rounded-tr-sm bg-brand text-white")}>
              <div className={clsx("mb-0.5 text-[10.5px] font-semibold uppercase tracking-wide", l.speaker === "customer" ? "text-faint" : "text-white/70")}>{l.speaker === "customer" ? "Customer" : "You"}</div>
              {l.text}
            </div>
          </div>
        ))}
        {interim && <div className="text-[13px] italic text-faint">{interim}…</div>}
        {thinking && <div className="flex items-center gap-1.5 text-[11.5px] text-tw"><Zap className="size-3 fill-current" /> checking live data…</div>}
        <div ref={end} />
      </div>
      <div className="mt-2 flex items-center gap-2 border-t border-line pt-3">
        <div className="flex rounded-lg border border-line p-0.5 text-xs">
          {(["customer", "agent"] as const).map((s) => (
            <button key={s} onClick={() => setSpeaker(s)} className={clsx("rounded-md px-2 py-1 capitalize", speaker === s ? "bg-surface-2 font-medium text-fg" : "text-faint")}>{s === "agent" ? "Me" : "Customer"}</button>
          ))}
        </div>
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder={`Type what the ${speaker === "agent" ? "agent" : "customer"} said…`} className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-brand" />
        <Button size="md" variant="secondary" onClick={submit} aria-label="Send"><Send className="size-4" /></Button>
        <Button size="md" variant={listening ? "danger" : "primary"} onClick={toggleMic} aria-label="Microphone">{listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}</Button>
      </div>
    </Card>
  );
}

function Wrapup({ wrap, customer, promiseUpdates, onBack }: { wrap: WrapupResult; customer: Customer; promiseUpdates: Record<string, { status: string; kept_at: string }>; onBack: () => void }) {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ok">Call complete · notes written automatically</div>
          <h1 className="text-xl font-semibold tracking-tight">{customer.name}</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/signals"><Button variant="secondary">Watch signals</Button></Link>
          <Button variant="primary" onClick={onBack}>Next call</Button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Summary"><p className="text-[13.5px] leading-relaxed">{wrap.summary}</p></Card>
        <Card title="Root cause & resolution">
          <p className="text-[13px] leading-relaxed"><span className="font-medium">Cause: </span>{wrap.root_cause}</p>
          <p className="mt-2 text-[13px] leading-relaxed"><span className="font-medium">Resolution: </span>{wrap.resolution}</p>
          <div className="mt-3 text-xs text-muted">Customer left the call: <Badge tone={wrap.sentiment_end === "relieved" || wrap.sentiment_end === "calm" ? "ok" : "warn"}>{wrap.sentiment_end}</Badge></div>
        </Card>
      </div>
      <Card className="mt-4" tone="tw" title={<span className="flex items-center gap-1.5">Promises · watched by <TwMark className="text-[13px]" /></span>}>
        <p className="mb-3 text-xs text-muted">Each commitment you made is now a Triggerware trigger on live data. When it&apos;s fulfilled, CallBrain marks it kept and updates the customer automatically. Nobody has to remember.</p>
        <ul className="space-y-3">
          {wrap.promises.map((p) => {
            const kept = promiseUpdates[p.id]?.status === "kept";
            return (
              <li key={p.id} className={clsx("rounded-lg border p-3", kept ? "border-ok/40 bg-ok-soft" : "border-line")}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[13.5px] font-medium">{p.text}</div>
                    <div className="text-[11.5px] text-muted">Owner {p.owner} · due in {p.due_hours}h · {p.kind}</div>
                  </div>
                  {kept ? <Badge tone="ok"><CheckCircle2 className="size-3" /> kept</Badge> : p.trigger ? <Badge tone="tw"><Zap className="size-3 fill-current" /> watching</Badge> : <Badge>manual</Badge>}
                </div>
                {p.watch_sql && <Sql sql={p.watch_sql} compact className="mt-2" />}
                {p.error && <p className="mt-1 text-[11px] text-bad">{p.error}</p>}
              </li>
            );
          })}
          {wrap.promises.length === 0 && <li className="text-sm text-faint">No promises were made on this call.</li>}
        </ul>
      </Card>
      <Card className="mt-4" title="Ticket note"><p className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted">{wrap.ticket_note}</p></Card>
    </div>
  );
}
