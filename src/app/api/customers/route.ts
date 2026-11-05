import { fail, json } from "@/lib/http";
import { tw, rowsToObjects } from "@/lib/triggerware";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const r = await tw.query("SELECT t1.id, t1.name, t1.plan, t1.arr, t1.sso_provider, t1.health, t1.csm FROM customers t1 ORDER BY t1.arr DESC", { language: "sql", label: "Customer directory" });
    return json(rowsToObjects(r.signature, r.rows));
  } catch (e) {
    return fail(e);
  }
}
