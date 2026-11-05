import { runControl } from "@/lib/actions";
import { emit } from "@/lib/bus";
import { fail, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { action, params } = await req.json();
    const change = await runControl(String(action), params || {});
    emit({ type: "change", data: change });
    return json(change);
  } catch (e) {
    return fail(e);
  }
}
