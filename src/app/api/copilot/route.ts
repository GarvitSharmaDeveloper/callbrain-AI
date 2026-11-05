import { runCopilot } from "@/lib/copilot";
import { sse } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json();
  return sse(async (send) => {
    await runCopilot(
      { customerId: body.customerId, customerName: body.customerName, transcript: body.transcript || [], previous: body.previous || null },
      (ev) => send(ev.type, ev),
    );
    send("done", {});
  }, req);
}
