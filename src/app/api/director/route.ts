import { runDirector } from "@/lib/actions";
import { emit } from "@/lib/bus";
import { fail, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { step } = await req.json();
    const message = await runDirector(String(step));
    emit({ type: "demo", data: { message } });
    return json({ ok: true, message });
  } catch (e) {
    return fail(e);
  }
}
