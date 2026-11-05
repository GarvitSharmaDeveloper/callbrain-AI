import { boot } from "@/lib/boot";
import { fail, json } from "@/lib/http";
import { tw, rowsToObjects } from "@/lib/triggerware";

export const dynamic = "force-dynamic";

// Two Triggerware saved queries, merged: account list + open P1s per account.
export async function GET() {
  try {
    await boot();
    const [accts, p1] = await Promise.all([tw.saved.fetch("cb_account_list"), tw.saved.fetch("cb_open_p1_by_account")]);
    const p1map = new Map(rowsToObjects(p1.signature, p1.rows).map((r) => [String(r.customer_id), Number(r.open_p1)]));
    const rows = rowsToObjects(accts.signature, accts.rows).map((a) => ({ ...a, open_p1: p1map.get(String(a.id)) || 0 }) as Record<string, unknown> & { open_p1: number });
    rows.sort((a, b) => b.open_p1 - a.open_p1 || Number(b.arr) - Number(a.arr));
    return json(rows);
  } catch (e) {
    return fail(e);
  }
}

// Triggerware feature: convert a saved query into a live trigger.
export async function POST() {
  try {
    return json(await tw.saved.toTrigger("cb_open_p1_by_account", "cb_open_p1_watch"));
  } catch (e) {
    return fail(e);
  }
}
