import { fail, json } from "@/lib/http";
import { tw } from "@/lib/triggerware";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await ctx.params;
    return json(await tw.tables.get(name));
  } catch (e) {
    return fail(e);
  }
}
