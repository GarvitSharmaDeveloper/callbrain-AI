// Free-form plain-English question → Triggerware (natural language → SQL → live rows).
import { fail, json } from "@/lib/http";
import { tw, rowsToObjects } from "@/lib/triggerware";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { question } = await req.json();
    if (!question || String(question).length < 4) return fail("Ask a question", 400);
    const r = await tw.query(String(question), { language: "english", label: `Ask: ${question}`, limit: 50 });
    return json({ sql: r.sql, rows: rowsToObjects(r.signature, r.rows).slice(0, 20), rowCount: r.rows.length, ms: r.ms });
  } catch (e) {
    return fail(e);
  }
}
