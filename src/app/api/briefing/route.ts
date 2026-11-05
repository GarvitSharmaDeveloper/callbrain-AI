import { buildBriefing } from "@/lib/briefing";
import { fail, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { customerId } = await req.json();
    return json(await buildBriefing(String(customerId)));
  } catch (e) {
    return fail(e);
  }
}
