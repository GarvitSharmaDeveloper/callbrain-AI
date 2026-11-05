import { bus, BusEvent } from "@/lib/bus";
import { boot } from "@/lib/boot";
import { sse } from "@/lib/http";
import { twMode } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  return sse(async (send, signal) => {
    send("hello", { mode: twMode() });
    const onEvent = (ev: BusEvent) => send(ev.type, ev.data);
    bus.on("event", onEvent);
    const ping = setInterval(() => send("ping", Date.now()), 15000);
    boot().then(() => send("ready", { mode: twMode() })).catch((e) => send("boot_error", { message: String(e?.message || e) }));
    await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve()));
    bus.off("event", onEvent);
    clearInterval(ping);
  }, req);
}
