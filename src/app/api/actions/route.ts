import { runAction } from "@/lib/actions";
import { fail, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { kind, customerId, detail } = await req.json();
    return json(await runAction(String(kind), String(customerId), String(detail || "")));
  } catch (e) {
    return fail(e);
  }
}
