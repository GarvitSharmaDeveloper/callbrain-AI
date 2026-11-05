import { fail, json } from "@/lib/http";
import { wrapUp } from "@/lib/wrapup";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    return json(await wrapUp(await req.json()));
  } catch (e) {
    return fail(e);
  }
}
