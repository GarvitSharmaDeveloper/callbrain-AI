// One-time Triggerware setup for live mode:
//  1. register every Orbit dataset as a Triggerware virtual table (Lua generator reading CallBrain's
//     live data feed at /api/feed/<table>)
//  2. create the saved queries used by the dashboard
import { config, twLive } from "./config";
import { TABLE_COLUMNS } from "./schema";
import { tw } from "./triggerware";

export const SAVED_QUERIES = [
  {
    name: "cb_account_list",
    description: "All accounts with plan, ARR, health and CSM",
    sql: "SELECT t1.id, t1.name, t1.plan, t1.arr, t1.health, t1.csm, t1.renewal_date FROM customers t1 ORDER BY t1.arr DESC",
  },
  {
    name: "cb_open_p1_by_account",
    description: "Open P1 tickets per account",
    sql: "SELECT t1.customer_id, COUNT(t1.id) AS open_p1 FROM tickets t1 WHERE t1.priority = 'P1' AND t1.status = 'open' GROUP BY t1.customer_id",
  },
];

function luaFor(table: string) {
  return `generator("all", function(args)
  local response = http.get("${config.triggerware.feedBaseUrl}/api/feed/${table}")
  if response.status < 200 or response.status >= 300 then
    error("Orbit feed failed with status " .. tostring(response.status))
  end
  local data = json.decode(response.body)
  return { rows = data.rows, state = {}, exhausted = true }
end)`;
}

export async function setupTriggerware(log: (m: string) => void = () => {}) {
  if (twLive()) {
    const existing = new Set(await tw.tables.list());
    for (const [t, cols] of Object.entries(TABLE_COLUMNS)) {
      const name = `${config.triggerware.tablePrefix}${t}`;
      if (existing.has(name)) continue;
      await tw.tables.define(name, {
        description: `Orbit production ${t.replace(/_/g, " ")} (live)`,
        columns: cols.map(([n, type]) => ({ name: n, type: type === "ts" ? "string" : type })),
        generators: [{ name: "all", inputs: [] }],
      }, luaFor(t));
      log(`registered table ${name}`);
    }
  }
  const saved = new Set(await tw.saved.list());
  for (const s of SAVED_QUERIES) {
    if (!saved.has(s.name)) {
      await tw.saved.create(s.name, s.description, s.sql);
      log(`saved query ${s.name}`);
    }
  }
}
