import { signalLog, twLog } from "@/lib/bus";
import { boot } from "@/lib/boot";
import { config, twMode } from "@/lib/config";
import { json } from "@/lib/http";
import { kbIndex } from "@/lib/kb";
import { registry } from "@/lib/signals";
import { tw } from "@/lib/triggerware";

export const dynamic = "force-dynamic";

export async function GET() {
  let bootError: string | null = null;
  try {
    await boot();
  } catch (e) {
    bootError = String((e as Error).message);
  }
  const health = await tw.health();
  return json({
    mode: twMode(),
    target: config.triggerware.wsUrl || config.triggerware.address,
    health,
    bootError,
    model: config.anthropicModel,
    triggers: registry(),
    knowledge: kbIndex(),
    signals: signalLog.slice(0, 100),
    activity: twLog.slice(0, 200),
  });
}
