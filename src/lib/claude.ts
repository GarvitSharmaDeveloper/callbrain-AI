// Thin wrapper around the Anthropic SDK: a manual tool loop with structured JSON output.
import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config";

const g = globalThis as unknown as { __cbAnthropic?: Anthropic };
export const anthropic = () => g.__cbAnthropic || (g.__cbAnthropic = new Anthropic());

export type ToolHandler = (input: Record<string, unknown>) => Promise<string>;

export interface RunOpts {
  system: Anthropic.Beta.BetaTextBlockParam[];
  prompt: string;
  schema?: Record<string, unknown>;
  tools?: Anthropic.Beta.BetaTool[];
  handlers?: Record<string, ToolHandler>;
  effort?: "low" | "medium" | "high";
  maxTurns?: number;
  maxTokens?: number;
}

/** Providers to try, in order. Default: NVIDIA Nemotron (fast) → Gemini → Claude, filtered by which keys are set. */
export function aiProviders(): ("nvidia" | "gemini" | "claude")[] {
  const order = (process.env.AI_PROVIDERS || "nvidia,gemini,claude").split(",").map((s) => s.trim()) as ("nvidia" | "gemini" | "claude")[];
  const has = { nvidia: !!process.env.NVIDIA_API_KEY, gemini: !!process.env.GEMINI_API_KEY, claude: !!process.env.ANTHROPIC_API_KEY };
  return order.filter((p) => has[p]);
}
export const aiProvider = () => aiProviders()[0] || "none";

/** Runs the configured AI provider chain with optional tools; returns parsed JSON (if schema) or text. */
export async function runClaude<T = unknown>(opts: RunOpts): Promise<T> {
  const providers = aiProviders();
  if (!providers.length) throw new Error("No AI key configured (NVIDIA_API_KEY, GEMINI_API_KEY or ANTHROPIC_API_KEY)");
  const errors: string[] = [];
  for (const p of providers) {
    try {
      if (p === "nvidia") {
        if (opts.tools?.length) continue; // tool loops go to Gemini/Claude
        const { runNvidia } = await import("./nvidia");
        return await runNvidia<T>({ system: opts.system.map((b) => b.text).join("\n\n"), prompt: opts.prompt, schema: opts.schema, maxTokens: opts.maxTokens });
      }
      if (p === "gemini") {
        const { runGemini } = await import("./gemini");
        return await runGemini<T>({
          system: opts.system.map((b) => b.text).join("\n\n"),
          prompt: opts.prompt,
          schema: opts.schema,
          tools: opts.tools?.map((t) => ({ name: t.name, description: t.description || "", parameters: t.input_schema as Record<string, unknown> })),
          handlers: opts.handlers,
          maxTurns: opts.maxTurns,
          thinking: opts.effort,
        });
      }
      return await runAnthropic<T>(opts);
    } catch (e) {
      errors.push(`${p}: ${(e as Error).message}`);
    }
  }
  throw new Error(errors.join(" || "));
}

async function runAnthropic<T>(opts: RunOpts): Promise<T> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: opts.prompt }];
  for (let turn = 0; turn < (opts.maxTurns ?? 8); turn++) {
    const res = await anthropic().beta.messages.create({
      model: config.anthropicModel,
      max_tokens: opts.maxTokens ?? 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: opts.system,
      tools: opts.tools,
      output_config: {
        effort: opts.effort ?? "low",
        ...(opts.schema ? { format: { type: "json_schema", schema: opts.schema } } : {}),
      },
      messages,
    });

    if (res.stop_reason === "refusal") throw new Error("Model declined this request");
    if (res.stop_reason === "max_tokens") throw new Error("Model output was truncated (max_tokens)");

    const toolUses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !toolUses.length) {
      const text = res.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      if (!opts.schema) return text as T;
      return parseJson<T>(text);
    }

    messages.push({ role: "assistant", content: res.content });
    const results = await Promise.all(
      toolUses.map(async (tu): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        try {
          const h = opts.handlers?.[tu.name];
          if (!h) throw new Error(`Unknown tool ${tu.name}`);
          return { type: "tool_result", tool_use_id: tu.id, content: await h(tu.input as Record<string, unknown>) };
        } catch (e) {
          return { type: "tool_result", tool_use_id: tu.id, is_error: true, content: String((e as Error).message || e) };
        }
      }),
    );
    messages.push({ role: "user", content: results });
  }
  throw new Error("Agent did not finish within the turn limit");
}

function parseJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as T;
    throw new Error("Model did not return valid JSON");
  }
}

// JSON-schema helpers for structured outputs (all fields required, no extras).
export const S = {
  str: (description?: string) => ({ type: "string", ...(description ? { description } : {}) }),
  num: () => ({ type: "number" }),
  bool: () => ({ type: "boolean" }),
  enum: (values: string[]) => ({ type: "string", enum: values }),
  arr: (items: Record<string, unknown>) => ({ type: "array", items }),
  obj: (props: Record<string, Record<string, unknown>>) => ({
    type: "object",
    properties: props,
    required: Object.keys(props),
    additionalProperties: false,
  }),
};
