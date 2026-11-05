// Orbit's live data feed — the source the Triggerware virtual tables read from (live mode).
// Rows are returned in the exact column order and types registered with Triggerware.
import { getDb } from "@/lib/db";
import { fail, json } from "@/lib/http";
import { TABLE_COLUMNS } from "@/lib/schema";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ table: string }> }) {
  try {
    const { table } = await ctx.params;
    const cols = TABLE_COLUMNS[table];
    if (!cols) return fail("Unknown table", 404);
    const db = await getDb();
    const r = await db.query(`SELECT ${cols.map(([c]) => c).join(", ")} FROM ${table}`);
    const rows = r.rows.map((o) =>
      cols.map(([c, type]) => {
        const v = o[c];
        if (v === null || v === undefined) return null;
        if (type === "number") return Number(v);
        if (type === "ts") return new Date(v as string).toISOString();
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        return String(v);
      }),
    );
    return json({ columns: cols.map(([c]) => c), rows });
  } catch (e) {
    return fail(e);
  }
}
