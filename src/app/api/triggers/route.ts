import { boot } from "@/lib/boot";
import { fail, json } from "@/lib/http";
import { registerReflex, registry } from "@/lib/signals";
import { tw } from "@/lib/triggerware";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await boot();
    const live = await tw.triggers.list();
    const reg = new Map(registry().map((r) => [r.name, r]));
    return json(live.map((t) => ({ ...t, kind: reg.get(t.name)?.kind || "external", title: reg.get(t.name)?.title || t.description })));
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();
    if (!prompt || String(prompt).length < 8) return fail("Describe what to watch for", 400);
    return json(await registerReflex(String(prompt)));
  } catch (e) {
    return fail(e);
  }
}
