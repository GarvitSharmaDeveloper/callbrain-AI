import { fail, json } from "@/lib/http";
import { tw } from "@/lib/triggerware";
import { twMode } from "@/lib/config";

export const dynamic = "force-dynamic";

const safe = async <T,>(p: Promise<T>, d: T) => p.catch(() => d);

export async function GET() {
  const [tables, connectors, catalog, agents, runtimes, saved] = await Promise.all([
    safe(tw.tables.list(), [] as string[]),
    safe(tw.connectors.installed(), [] as string[]),
    safe(tw.connectors.catalog(), [] as { name: string; description: string }[]),
    safe(tw.agents.list(), [] as string[]),
    safe(tw.runtimes(), [] as string[]),
    safe(tw.saved.list(), [] as string[]),
  ]);
  return json({ mode: twMode(), tables, connectors, catalog, agents, runtimes, saved });
}

export async function POST(req: Request) {
  try {
    const { kind, prompt, name, triggers } = await req.json();
    if (kind === "table") return json(await tw.tables.create(String(name || `orbit_custom_${Date.now() % 100000}`), String(prompt)));
    if (kind === "agent") return json(await tw.agents.create(String(prompt), triggers || []));
    return fail("Unknown kind", 400);
  } catch (e) {
    return fail(e);
  }
}
