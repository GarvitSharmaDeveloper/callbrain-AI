// Database access. Uses a real Postgres (DATABASE_URL) when provided — required for live
// Triggerware, which reads the same database through its Postgres connector. Falls back to an
// embedded PGlite instance so the app runs with zero setup.
import { config } from "./config";

export type QueryResult = { rows: Record<string, unknown>[]; fields: string[] };

interface Driver {
  query(sql: string, params?: unknown[]): Promise<QueryResult>;
  exec(sql: string): Promise<void>;
}

const g = globalThis as unknown as { __callbrainDb?: Promise<Driver> };

async function createDriver(): Promise<Driver> {
  if (config.databaseUrl) {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.databaseUrl.includes("localhost") ? undefined : { rejectUnauthorized: false },
      options: "-c TimeZone=UTC",
      max: 8,
    });
    return {
      async query(sql, params) {
        const r = await pool.query(sql, params as unknown[]);
        return { rows: r.rows, fields: (r.fields || []).map((f) => f.name) };
      },
      async exec(sql) {
        await pool.query(sql);
      },
    };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  await db.exec("SET TIME ZONE 'UTC';");
  const driver: Driver = {
    async query(sql, params) {
      const r = await db.query<Record<string, unknown>>(sql, params as unknown[]);
      return { rows: r.rows, fields: r.fields.map((f) => f.name) };
    },
    async exec(sql) {
      await db.exec(sql);
    },
  };
  // Embedded DB starts empty: seed it on first use.
  const { seedBaseline } = await import("./seed");
  await seedBaseline(driver);
  return driver;
}

export function getDb(): Promise<Driver> {
  if (!g.__callbrainDb) g.__callbrainDb = createDriver();
  return g.__callbrainDb;
}

export async function q<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
  const db = await getDb();
  return (await db.query(sql, params)).rows as T[];
}

export type { Driver };
