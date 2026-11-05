import { TriggerwareClient } from "triggerware";
const c = await TriggerwareClient.connectTcp("localhost:5221");
for (const t of await c.triggers.list()) if (t.startsWith("probe")) await c.triggers.delete(t);
for (const t of await c.tables.list()) if (t.startsWith("probe")) await c.tables.delete(t);
console.log("tables:", await c.tables.list(), "triggers:", await c.triggers.list());
await c.close();
