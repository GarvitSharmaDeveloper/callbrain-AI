// Gemini adapter (Interactions API, stateless mode). Same contract as runClaude: optional tools with
// handlers, optional JSON-schema output. Retries across a model chain when a model is overloaded.

export interface GeminiTool { name: string; description: string; parameters: Record<string, unknown> }
export interface GeminiRunOpts {
  system: string;
  prompt: string;
  schema?: Record<string, unknown>;
  tools?: GeminiTool[];
  handlers?: Record<string, (input: Record<string, unknown>) => Promise<string>>;
  maxTurns?: number;
  thinking?: "low" | "medium" | "high";
}

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

function modelChain(): string[] {
  const preferred = (process.env.GEMINI_MODEL || "").split(",").map((s) => s.trim()).filter(Boolean);
  const defaults = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.5-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];
  return [...new Set([...preferred, ...defaults])];
}

// Remember which model last worked so we start there next time.
const g = globalThis as unknown as { __geminiGood?: string };

/** Gemini's schema dialect: drop keywords it doesn't accept. */
function clean(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(clean);
  if (schema && typeof schema === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema)) {
      if (k === "additionalProperties" || k === "strict") continue;
      out[k] = clean(v);
    }
    return out;
  }
  return schema;
}

type Step = { type: string; id?: string; name?: string; arguments?: Record<string, unknown>; content?: { type: string; text?: string }[] | string; [k: string]: unknown };

async function call(model: string, body: Record<string, unknown>): Promise<{ ok: true; steps: Step[] } | { ok: false; retry: boolean; error: string }> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "x-goog-api-key": process.env.GEMINI_API_KEY || "", "Content-Type": "application/json", "Api-Revision": "2026-05-20" },
    body: JSON.stringify({ ...body, model }),
    signal: AbortSignal.timeout(Number(process.env.GEMINI_TIMEOUT_MS || 45_000)),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }) as unknown as Response);
  const text = await res.text();
  console.log(`[gemini] ${model} → ${res.status}`);
  if (!res.ok) {
    const retry = res.status === 0 || res.status === 429 || res.status >= 500 || res.status === 404;
    return { ok: false, retry, error: `${model} → ${res.status}: ${text.slice(0, 240)}` };
  }
  const j = JSON.parse(text) as { steps?: Step[]; status?: string; error?: { message: string } };
  if (j.error) return { ok: false, retry: true, error: j.error.message };
  return { ok: true, steps: j.steps || [] };
}

// Free-tier keys allow ~5 requests/minute per model: track usage and rotate to models with budget.
const RPM = Number(process.env.GEMINI_RPM || 5);
const usage: Map<string, number[]> = ((globalThis as unknown as { __geminiUsage?: Map<string, number[]> }).__geminiUsage ||= new Map());
const cooling: Map<string, number> = ((globalThis as unknown as { __geminiCool?: Map<string, number> }).__geminiCool ||= new Map());
function hasBudget(model: string) {
  if ((cooling.get(model) || 0) > Date.now()) return false;
  const recent = (usage.get(model) || []).filter((t) => t > Date.now() - 60_000);
  usage.set(model, recent);
  return recent.length < RPM;
}
function record(model: string) {
  usage.set(model, [...(usage.get(model) || []), Date.now()]);
}

async function callWithFallback(body: Record<string, unknown>, pinned?: string): Promise<{ model: string; steps: Step[] }> {
  const ordered = [...new Set([g.__geminiGood, ...modelChain()].filter(Boolean) as string[])];
  const errors: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const chain = pinned ? [pinned] : ordered.filter(hasBudget);
    for (const model of chain) {
      record(model);
      const r = await call(model, body);
      if (!r.ok && /429|rate limit|503|high demand/i.test(r.error)) cooling.set(model, Date.now() + (/429|rate limit/i.test(r.error) ? 30_000 : 10_000));
      if (r.ok) {
        g.__geminiGood = model;
        return { model, steps: r.steps };
      }
      errors.push(r.error);
      if (!r.retry) throw new Error(r.error);
    }
    await new Promise((s) => setTimeout(s, 600));
  }
  throw new Error(`Gemini unavailable: ${errors.slice(-3).join(" | ")}`);
}

export async function runGemini<T>(opts: GeminiRunOpts): Promise<T> {
  const input: Step[] = [{ type: "user_input", content: opts.prompt }];
  const base: Record<string, unknown> = {
    store: false,
    system_instruction: opts.system,
    generation_config: { thinking_level: opts.thinking || "low" },
    ...(opts.tools?.length ? { tools: opts.tools.map((t) => ({ type: "function", name: t.name, description: t.description, parameters: clean(t.parameters) })) } : {}),
    ...(opts.schema ? { response_format: { type: "text", mime_type: "application/json", schema: clean(opts.schema) } } : {}),
  };
  let model: string | undefined;
  for (let turn = 0; turn < (opts.maxTurns ?? 6); turn++) {
    const r = await callWithFallback({ ...base, input }, model);
    model = r.model; // thought signatures are model-bound: stay on this model for the rest of the run
    const calls = r.steps.filter((s) => s.type === "function_call");
    if (!calls.length) {
      const text = r.steps
        .filter((s) => s.type === "model_output")
        .flatMap((s) => (typeof s.content === "string" ? [s.content] : (s.content || []).map((c) => c.text || "")))
        .join("");
      if (!opts.schema) return text as T;
      return parseJson<T>(text);
    }
    input.push(...r.steps);
    const results = await Promise.all(
      calls.map(async (c) => {
        let out: string;
        try {
          const h = opts.handlers?.[c.name!];
          if (!h) throw new Error(`Unknown tool ${c.name}`);
          out = await h(c.arguments || {});
        } catch (e) {
          out = `ERROR: ${(e as Error).message}`;
        }
        return { type: "function_result", name: c.name, call_id: c.id, result: [{ type: "text", text: out }] } as Step;
      }),
    );
    input.push(...results);
  }
  throw new Error("Gemini did not finish within the turn limit");
}

function parseJson<T>(text: string): T {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(t) as T;
  } catch {
    const m = t.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as T;
    throw new Error("Model did not return valid JSON");
  }
}
