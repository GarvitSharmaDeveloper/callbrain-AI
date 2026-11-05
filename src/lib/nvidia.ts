// NVIDIA Nemotron via build.nvidia.com (OpenAI-compatible chat completions). Used for single-shot
// structured calls (copilot analysis, briefings, wrap-up, NL→SQL). Fast with thinking disabled.

const ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";

function models(): string[] {
  const pref = (process.env.NVIDIA_MODEL || "").split(",").map((s) => s.trim()).filter(Boolean);
  return [...new Set([...pref, "nvidia/nemotron-3.5-lightning-30b-a3b", "nvidia/nemotron-3.5-bolt-e4b"])];
}

function clean(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(clean);
  if (schema && typeof schema === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema)) if (k !== "strict") out[k] = clean(v);
    return out;
  }
  return schema;
}

export async function runNvidia<T>(opts: { system: string; prompt: string; schema?: Record<string, unknown>; maxTokens?: number }): Promise<T> {
  const errors: string[] = [];
  for (const model of models()) {
    const t0 = Date.now();
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          max_tokens: Math.min(opts.maxTokens ?? 4000, 8000),
          temperature: 0.2,
          chat_template_kwargs: { enable_thinking: false },
          messages: [
            { role: "system", content: opts.schema ? `${opts.system}\n\nRespond with ONLY a JSON object matching this JSON schema:\n${JSON.stringify(clean(opts.schema))}` : opts.system },
            { role: "user", content: opts.prompt },
          ],
          ...(opts.schema ? { response_format: { type: "json_schema", json_schema: { name: "output", schema: clean(opts.schema) } } } : {}),
        }),
        signal: AbortSignal.timeout(Number(process.env.NVIDIA_TIMEOUT_MS || 30_000)),
      });
      const text = await res.text();
      console.log(`[nvidia] ${model} → ${res.status} in ${Date.now() - t0}ms`);
      if (!res.ok) {
        errors.push(`${model} ${res.status}: ${text.slice(0, 200)}`);
        continue;
      }
      const content: string = JSON.parse(text).choices?.[0]?.message?.content || "";
      if (!opts.schema) return content as T;
      return parseJson<T>(content);
    } catch (e) {
      errors.push(`${model}: ${(e as Error).message}`);
    }
  }
  throw new Error(`Nemotron unavailable: ${errors.join(" | ")}`);
}

function parseJson<T>(text: string): T {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").replace(/<think>[\s\S]*?<\/think>/g, "");
  try {
    return JSON.parse(t) as T;
  } catch {
    const m = t.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as T;
    throw new Error("Model did not return valid JSON");
  }
}
