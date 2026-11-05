import { fail, json } from "@/lib/http";
import { unregister } from "@/lib/signals";
import { tw } from "@/lib/triggerware";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await ctx.params;
    const { op } = await req.json();
    if (op === "run") return json(await tw.triggers.run(name));
    if (op === "enable") return json(await tw.triggers.setEnabled(name, true));
    if (op === "disable") return json(await tw.triggers.setEnabled(name, false));
    return fail("Unknown op", 400);
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await ctx.params;
    await unregister(name);
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
