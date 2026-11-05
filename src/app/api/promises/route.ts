import { q } from "@/lib/db";
import { fail, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return json(await q("SELECT p.*, c.name AS customer FROM call_promises p LEFT JOIN customers c ON c.id = p.customer_id ORDER BY p.created_at DESC LIMIT 50"));
  } catch (e) {
    return fail(e);
  }
}
