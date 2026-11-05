// Lazily boots the Triggerware integration once per server process.
import { ensureSignals } from "./signals";
import { setupTriggerware } from "./twsetup";

const g = globalThis as unknown as { __cbBoot?: Promise<void> };

export function boot(): Promise<void> {
  if (!g.__cbBoot) {
    g.__cbBoot = (async () => {
      await setupTriggerware((m) => console.log("[triggerware]", m));
      await ensureSignals();
    })().catch((e) => {
      g.__cbBoot = undefined;
      console.error("[triggerware] boot failed:", e);
      throw e;
    });
  }
  return g.__cbBoot;
}
