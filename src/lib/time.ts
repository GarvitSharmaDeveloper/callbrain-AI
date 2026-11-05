// Triggerware SQL has no NOW() or TIMESTAMP literals. Times are stored and compared as fixed-width
// ISO-8601 UTC strings computed in JS — valid in both Triggerware and Postgres.
export const minutesAgo = (m: number, from = new Date()) => new Date(from.getTime() - m * 60_000);
export const hoursAgo = (h: number, from = new Date()) => minutesAgo(h * 60, from);
export const daysAgo = (d: number, from = new Date()) => minutesAgo(d * 1440, from);

// Triggerware compares timestamps as fixed-width ISO-8601 strings (no TIMESTAMP literals).
export function tsLit(d: Date) {
  return `'${d.toISOString()}'`;
}
export function dateLit(d: Date) {
  return `DATE '${d.toISOString().slice(0, 10)}'`;
}
