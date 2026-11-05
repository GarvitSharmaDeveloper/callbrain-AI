// Demo dataset for "Orbit" — a fictional B2B logistics SaaS. All timestamps are relative to
// "now" so the demo always looks like it is happening today.
//
// Booleans are stored as 0/1 ints because Triggerware SQL has no boolean type.
import type { Driver } from "./db";
import { daysAgo, hoursAgo, minutesAgo } from "./time";

export const SCHEMA_SQL = `
DROP TABLE IF EXISTS customers, contacts, employees, tickets, login_events, deploys, incidents,
  invoices, payments, credits, refunds, usage_daily, calls, call_promises, tenant_flags CASCADE;

CREATE TABLE customers (id text PRIMARY KEY, name text, plan text, arr int, region text,
  csm text, sso_provider text, health int, renewal_date date);
CREATE TABLE contacts (id text PRIMARY KEY, customer_id text, name text, email text, role text, phone text);
CREATE TABLE employees (id text PRIMARY KEY, name text, email text, team text, role text, on_call int);
CREATE TABLE tickets (id text PRIMARY KEY, customer_id text, subject text, priority text, status text,
  category text, assignee text, created_at timestamptz, resolved_at timestamptz, resolution text);
CREATE TABLE login_events (id serial PRIMARY KEY, customer_id text, user_email text, success int,
  error_code text, created_at timestamptz);
CREATE TABLE deploys (id text PRIMARY KEY, service text, version text, author text, notes text, created_at timestamptz);
CREATE TABLE incidents (id text PRIMARY KEY, title text, severity text, status text, service text,
  commander text, started_at timestamptz, resolved_at timestamptz);
CREATE TABLE invoices (id text PRIMARY KEY, customer_id text, amount numeric, status text,
  issued_at timestamptz, due_at timestamptz);
CREATE TABLE payments (id text PRIMARY KEY, invoice_id text, customer_id text, amount numeric,
  status text, failure_reason text, created_at timestamptz);
CREATE TABLE credits (id text PRIMARY KEY, customer_id text, amount numeric, reason text,
  approved_by text, created_at timestamptz);
CREATE TABLE refunds (id text PRIMARY KEY, customer_id text, payment_id text, amount numeric,
  reason text, issued_by text, created_at timestamptz);
CREATE TABLE usage_daily (customer_id text, day date, active_users int, shipments_created int);
CREATE TABLE calls (id text PRIMARY KEY, customer_id text, agent text, started_at timestamptz,
  ended_at timestamptz, summary text, sentiment text);
CREATE TABLE call_promises (id text PRIMARY KEY, customer_id text, call_id text, text text, kind text,
  owner text, due_at timestamptz, status text, trigger_name text, watch_sql text,
  created_at timestamptz, kept_at timestamptz);
CREATE TABLE tenant_flags (customer_id text, flag text, value text, set_by text, created_at timestamptz);
`;

export const CUSTOMERS = [
  // id, name, plan, arr, region, csm, sso
  ["cust_bluebird", "Bluebird Logistics", "Enterprise", 184000, "US-West", "Maya Chen", "Okta"],
  ["cust_northwind", "Northwind Freight", "Enterprise", 142000, "US-East", "Maya Chen", "Okta"],
  ["cust_pinecrest", "Pinecrest Health Supply", "Enterprise", 121000, "US-East", "Raj Patel", "Okta"],
  ["cust_atlas", "Atlas Cargo Co", "Business", 64000, "EU", "Raj Patel", "Okta"],
  ["cust_meridian", "Meridian Retail", "Enterprise", 98000, "US-Central", "Maya Chen", "Okta"],
  ["cust_summit", "Summit Couriers", "Business", 38000, "US-West", "Ines Duarte", "Okta"],
  ["cust_kestrel", "Kestrel Foods", "Business", 52000, "EU", "Ines Duarte", "Okta"],
  ["cust_lumen", "Lumen Pharmacy Group", "Enterprise", 156000, "US-East", "Raj Patel", "Okta"],
  ["cust_copperline", "Copperline Manufacturing", "Business", 47000, "US-Central", "Ines Duarte", "Okta"],
  ["cust_tidewater", "Tidewater Shipping", "Enterprise", 133000, "APAC", "Maya Chen", "Okta"],
  ["cust_orchard", "Orchard Grocers", "Business", 29000, "US-West", "Ines Duarte", "Okta"],
  ["cust_vantage", "Vantage Rail", "Enterprise", 117000, "EU", "Raj Patel", "Okta"],
  ["cust_falcon", "Falcon Air Cargo", "Business", 41000, "APAC", "Ines Duarte", "Okta"],
  ["cust_redwood", "Redwood Mobility", "Business", 36000, "US-West", "Raj Patel", "Azure AD"],
  ["cust_silverline", "Silverline Movers", "Starter", 9000, "US-East", "Ines Duarte", "Google"],
  ["cust_brightpath", "Brightpath Schools", "Business", 22000, "US-Central", "Maya Chen", "Azure AD"],
  ["cust_cobalt", "Cobalt Energy", "Enterprise", 109000, "US-Central", "Raj Patel", "Azure AD"],
  ["cust_juniper", "Juniper Hotels", "Business", 33000, "EU", "Ines Duarte", "Google"],
  ["cust_granitepeak", "Granitepeak Builders", "Starter", 12000, "US-West", "Maya Chen", "None"],
  ["cust_maple", "Maple & Co Distribution", "Business", 44000, "US-East", "Raj Patel", "Azure AD"],
  ["cust_harborline", "Harborline Imports", "Enterprise", 128000, "US-West", "Maya Chen", "Azure AD"],
  ["cust_quill", "Quill Office Supply", "Business", 31000, "US-East", "Ines Duarte", "Google"],
  ["cust_aurora", "Aurora Medical Logistics", "Enterprise", 167000, "US-East", "Raj Patel", "Azure AD"],
  ["cust_pinewood", "Pinewood Furniture", "Business", 27000, "US-Central", "Ines Duarte", "None"],
  ["cust_sterling", "Sterling Auto Parts", "Business", 58000, "US-Central", "Raj Patel", "Google"],
  ["cust_nimbus", "Nimbus Cold Chain", "Enterprise", 139000, "EU", "Maya Chen", "Azure AD"],
  ["cust_blueridge", "Blue Ridge Beverages", "Business", 46000, "US-East", "Ines Duarte", "Google"],
  ["cust_crescent", "Crescent Pharma Distribution", "Enterprise", 149000, "EU", "Raj Patel", "Azure AD"],
  ["cust_ironclad", "Ironclad Hardware", "Starter", 11000, "US-West", "Ines Duarte", "None"],
  ["cust_lighthouse", "Lighthouse Marine Supply", "Business", 39000, "APAC", "Maya Chen", "Google"],
  ["cust_meadow", "Meadowbrook Dairy", "Business", 34000, "US-Central", "Ines Duarte", "Google"],
  ["cust_polaris", "Polaris Electronics", "Enterprise", 158000, "APAC", "Raj Patel", "Azure AD"],
  ["cust_riverbend", "Riverbend Textiles", "Starter", 14000, "US-East", "Maya Chen", "None"],
  ["cust_saguaro", "Saguaro Solar", "Business", 49000, "US-West", "Raj Patel", "Google"],
  ["cust_terra", "Terra Firma Landscaping", "Starter", 8000, "US-West", "Ines Duarte", "None"],
  ["cust_urbanline", "Urbanline Couriers", "Business", 42000, "EU", "Maya Chen", "Azure AD"],
  ["cust_wildflower", "Wildflower Cosmetics", "Business", 37000, "US-East", "Ines Duarte", "Google"],
  ["cust_yellowstone", "Yellowstone Outfitters", "Business", 29000, "US-Central", "Raj Patel", "Google"],
  ["cust_zenith", "Zenith Aerospace Parts", "Enterprise", 176000, "US-West", "Maya Chen", "Azure AD"],
  ["cust_oakridge", "Oakridge Building Supply", "Business", 33000, "US-Central", "Ines Duarte", "None"],
] as const;

export const OKTA_CUSTOMERS = CUSTOMERS.filter((c) => c[6] === "Okta").map((c) => c[0]);

const EMPLOYEES = [
  ["emp_alex", "Alex Rivera", "alex@orbit.io", "Support", "Senior Support Engineer", 0],
  ["emp_sam", "Sam Ortiz", "sam@orbit.io", "Support", "Support Manager", 0],
  ["emp_priya", "Priya Raman", "priya@orbit.io", "Identity", "Staff Engineer, SSO/SAML", 0],
  ["emp_leo", "Leo Park", "leo@orbit.io", "Identity", "Software Engineer", 1],
  ["emp_ana", "Ana Gomez", "ana@orbit.io", "Billing", "Billing Operations Lead", 0],
  ["emp_jordan", "Jordan Lee", "jordan@orbit.io", "Platform", "Release Engineer", 1],
  ["emp_maya", "Maya Chen", "maya@orbit.io", "Customer Success", "Enterprise CSM", 0],
  ["emp_raj", "Raj Patel", "raj@orbit.io", "Customer Success", "Enterprise CSM", 0],
  ["emp_ines", "Ines Duarte", "ines@orbit.io", "Customer Success", "CSM", 0],
  ["emp_tara", "Tara Brooks", "tara@orbit.io", "Finance", "VP Finance", 0],
  ["emp_noah", "Noah Kim", "noah@orbit.io", "Support", "Support Engineer", 0],
  ["emp_zara", "Zara Ali", "zara@orbit.io", "Support", "Support Engineer", 0],
  ["emp_ben", "Ben Fischer", "ben@orbit.io", "Billing", "Billing Analyst", 0],
  ["emp_lena", "Lena Novak", "lena@orbit.io", "Platform", "SRE", 0],
  ["emp_omar", "Omar Reyes", "omar@orbit.io", "Shipments", "Engineering Manager", 1],
  ["emp_kai", "Kai Morgan", "kai@orbit.io", "Integrations", "Software Engineer", 1],
];

// Small deterministic PRNG so the dataset is identical on every reset.
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

function sqlVal(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (typeof v === "number") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function insert(db: Driver, table: string, cols: string[], rows: unknown[][]) {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400);
    const values = chunk.map((r) => `(${r.map(sqlVal).join(",")})`).join(",\n");
    await db.exec(`INSERT INTO ${table} (${cols.join(",")}) VALUES ${values} ON CONFLICT DO NOTHING;`);
  }
}

export async function seedBaseline(db: Driver, now = new Date()) {
  const rand = rng(42);
  await db.exec(SCHEMA_SQL);

  const healthFor = (id: string) => (id === "cust_bluebird" ? 71 : 60 + Math.floor(rand() * 35));
  const renewal = (i: number) => new Date(now.getTime() + (20 + i * 11) * 86400000);
  await insert(
    db,
    "customers",
    ["id", "name", "plan", "arr", "region", "csm", "sso_provider", "health", "renewal_date"],
    CUSTOMERS.map((c, i) => [...c, healthFor(c[0]), renewal(i).toISOString().slice(0, 10)]),
  );

  await insert(
    db,
    "contacts",
    ["id", "customer_id", "name", "email", "role", "phone"],
    [
      ["ct_dana", "cust_bluebird", "Dana Whitfield", "dana@bluebirdlogistics.com", "IT Director", "+1 415 555 0142"],
      ["ct_marcus", "cust_bluebird", "Marcus Bell", "marcus@bluebirdlogistics.com", "Finance Manager", "+1 415 555 0177"],
      ["ct_hana", "cust_northwind", "Hana Sato", "hana@northwindfreight.com", "Ops Lead", "+1 212 555 0101"],
      ["ct_omar", "cust_lumen", "Omar Haddad", "omar@lumenrx.com", "IT Manager", "+1 617 555 0190"],
    ],
  );

  await insert(db, "employees", ["id", "name", "email", "team", "role", "on_call"], EMPLOYEES);

  // Usage: steady for 14 days. (Bluebird's drop today is part of the live scenario.)
  const usage: unknown[][] = [];
  for (const c of CUSTOMERS) {
    const base = Math.max(15, Math.round(c[3] / 900));
    for (let d = 13; d >= 1; d--) {
      const day = daysAgo(d, now).toISOString().slice(0, 10);
      usage.push([c[0], day, Math.round(base * (0.9 + rand() * 0.2)), Math.round(base * 6 * (0.85 + rand() * 0.3))]);
    }
  }
  await insert(db, "usage_daily", ["customer_id", "day", "active_users", "shipments_created"], usage);

  // Login traffic: 24 hours, ~2-4 logins/hour per customer, with realistic background noise
  // (wrong passwords, expired invites) that should NOT trip the spike trigger.
  const logins: unknown[][] = [];
  const domainOf = (name: string) => name.toLowerCase().replace(/[^a-z]/g, "").slice(0, 14) + ".com";
  for (const c of CUSTOMERS) {
    const perHour = c[2] === "Enterprise" ? 4 : c[2] === "Business" ? 3 : 1;
    for (let h = 0; h < 24; h++) {
      for (let k = 0; k < perHour; k++) {
        const fail = rand() < 0.04;
        logins.push([c[0], `user${Math.floor(rand() * 40)}@${domainOf(c[1])}`, fail ? 0 : 1, fail ? (rand() < 0.7 ? "INVALID_PASSWORD" : "INVITE_EXPIRED") : null, minutesAgo(h * 60 + Math.floor(rand() * 60) + 2, now)]);
      }
    }
  }
  await insert(db, "login_events", ["customer_id", "user_email", "success", "error_code", "created_at"], logins);

  // Deploy history: 14 days across services.
  const services: [string, string, string[]][] = [
    ["shipments-api", "Jordan Lee", ["Faster rate-shopping cache", "Carrier timeout tuning", "Bulk label endpoint", "Fix pagination on /shipments"]],
    ["billing-service", "Ana Gomez", ["Payment retry: retry soft declines after 2 min", "Invoice PDF font fix", "Tax rounding for EU"]],
    ["auth-service", "Leo Park", ["Dependency bumps", "Session TTL metrics", "Rotate signing keys"]],
    ["dispatch-ui", "Kai Morgan", ["Route map clustering", "Driver ETA badges", "Dark mode polish"]],
    ["labels-worker", "Lena Novak", ["Zebra ZT driver v6.2", "Retry queue backoff"]],
    ["integrations", "Kai Morgan", ["Shopify webhook v2", "NetSuite field mapping"]],
  ];
  const deploys: unknown[][] = [];
  let dn = 80;
  for (let d = 14; d >= 1; d--) {
    const n = 1 + Math.floor(rand() * 2);
    for (let k = 0; k < n; k++) {
      const [svc, author, notes] = services[Math.floor(rand() * services.length)];
      const minor = 10 + Math.floor(rand() * 20);
      const at = new Date(daysAgo(d, now).getTime() + Math.floor(rand() * 8) * 3600_000);
      deploys.push([`dep_${dn++}`, svc, svc === "auth-service" ? `v4.11.${Math.floor(rand() * 4)}` : `v${1 + Math.floor(rand() * 3)}.${minor}.${Math.floor(rand() * 5)}`, author, notes[Math.floor(rand() * notes.length)], at]);
    }
  }
  deploys.push(["dep_101", "shipments-api", "v2.31.0", "Jordan Lee", "Faster rate-shopping cache", daysAgo(3, now)]);
  deploys.push(["dep_102", "billing-service", "v1.18.2", "Ana Gomez", "Payment retry: retry soft declines after 2 min", daysAgo(2, now)]);
  deploys.push(["dep_103", "auth-service", "v4.11.3", "Leo Park", "Dependency bumps", daysAgo(6, now)]);
  await insert(db, "deploys", ["id", "service", "version", "author", "notes", "created_at"], deploys);

  await insert(
    db,
    "incidents",
    ["id", "title", "severity", "status", "service", "commander", "started_at", "resolved_at"],
    [
      ["INC-1987", "SAML cert rotation broke Okta tenants", "SEV2", "resolved", "auth-service", "Priya Raman", daysAgo(240, now), daysAgo(240, now)],
      ["INC-1996", "Carrier rate API timeouts (UPS)", "SEV3", "resolved", "shipments-api", "Jordan Lee", daysAgo(120, now), daysAgo(120, now)],
      ["INC-2003", "Invoice emails delayed 6h", "SEV3", "resolved", "billing-service", "Ana Gomez", daysAgo(64, now), daysAgo(64, now)],
      ["INC-2012", "Label printing delays in EU", "SEV3", "resolved", "labels-worker", "Jordan Lee", daysAgo(31, now), daysAgo(31, now)],
      ["INC-2030", "Dispatch map tiles not loading", "SEV4", "resolved", "dispatch-ui", "Kai Morgan", daysAgo(12, now), daysAgo(12, now)],
    ],
  );

  // Billing: 3 months of invoices per customer; a few failed-then-recovered payments.
  const inv: unknown[][] = [];
  const pay: unknown[][] = [];
  CUSTOMERS.forEach((c, i) => {
    const amt = Math.round((c[3] / 12) * 100) / 100;
    for (let m = 2; m >= 1; m--) {
      const id = `INV-${8000 + i * 10 + m}`;
      inv.push([id, c[0], amt, "paid", daysAgo(m * 30 + 4, now), daysAgo(m * 30 - 26, now)]);
      if (rand() < 0.12) pay.push([`pay_${i}_${m}f`, id, c[0], amt, "failed", "card_declined", daysAgo(m * 30 + 3, now)]);
      pay.push([`pay_${i}_${m}`, id, c[0], amt, "succeeded", null, daysAgo(m * 30 + 2, now)]);
    }
    const id = `INV-88${String(i).padStart(2, "0")}`;
    inv.push([id, c[0], amt, "paid", daysAgo(4, now), daysAgo(-26, now)]);
    if (c[0] !== "cust_bluebird") pay.push([`pay_${i}a`, id, c[0], amt, "succeeded", null, daysAgo(3, now)]);
  });
  // Bluebird's November invoice: a soft decline, then a successful retry (the duplicate arrives in the live scenario).
  const bbAmt = Math.round((184000 / 12) * 100) / 100;
  pay.push(
    ["pay_0a", "INV-8800", "cust_bluebird", bbAmt, "failed", "soft_decline: issuer_unavailable", hoursAgo(6.2, now)],
    ["pay_0b", "INV-8800", "cust_bluebird", bbAmt, "succeeded", null, hoursAgo(6.15, now)],
  );
  await insert(db, "invoices", ["id", "customer_id", "amount", "status", "issued_at", "due_at"], inv);
  await insert(db, "payments", ["id", "invoice_id", "customer_id", "amount", "status", "failure_reason", "created_at"], pay);

  await insert(
    db,
    "credits",
    ["id", "customer_id", "amount", "reason", "approved_by", "created_at"],
    [
      ["cr_301", "cust_bluebird", 1500, "SLA credit — Aug label-printing outage", "Sam Ortiz", daysAgo(82, now)],
      ["cr_302", "cust_tidewater", 900, "SLA credit — API latency", "Sam Ortiz", daysAgo(140, now)],
      ["cr_303", "cust_vantage", 1200, "SLA credit — label printing (INC-2012)", "Alex Rivera", daysAgo(30, now)],
      ["cr_304", "cust_aurora", 2000, "Goodwill — onboarding delays", "Sam Ortiz", daysAgo(55, now)],
      ["cr_305", "cust_kestrel", 400, "SLA credit — label printing (INC-2012)", "Noah Kim", daysAgo(30, now)],
      ["cr_306", "cust_zenith", 1800, "SLA credit — carrier API timeouts", "Sam Ortiz", daysAgo(118, now)],
    ],
  );
  await insert(
    db,
    "refunds",
    ["id", "customer_id", "payment_id", "amount", "reason", "issued_by", "created_at"],
    [
      ["rf_h1", "cust_atlas", "pay_3_1", 5333.33, "Duplicate charge (payment retry)", "Ana Gomez", daysAgo(8, now)],
      ["rf_h2", "cust_quill", "pay_21_2", 2583.33, "Downgrade proration", "Ben Fischer", daysAgo(41, now)],
      ["rf_h3", "cust_sterling", "pay_24_1", 4833.33, "Annual prepay adjustment", "Ana Gomez", daysAgo(22, now)],
    ],
  );

  // Ticket history: ~60 days, mostly resolved — gives the expert finder and trend queries real signal.
  const ticketTemplates: [string, string, string, string, string][] = [
    ["SSO login loop after Okta app update", "sso", "P2", "Priya Raman", "Okta app had stale ACS URL; re-imported metadata."],
    ["SAML_ASSERTION_EXPIRED for a few users", "sso", "P2", "Priya Raman", "IdP clock drift. Enabled saml_skew_override=300 as workaround."],
    ["New users can't accept invite", "sso", "P3", "Leo Park", "Invite links expire after 72h; resent invites."],
    ["Label printer offline", "hardware", "P3", "Alex Rivera", "Driver reinstall (Zebra v6.2)."],
    ["Duplicate charge on invoice", "billing", "P2", "Ana Gomez", "Refunded duplicate in full per refund policy §2."],
    ["Invoice PDF missing line items", "billing", "P3", "Ben Fischer", "Regenerated invoice after tax fix."],
    ["Export to CSV times out", "data", "P3", "Alex Rivera", "Large export emailed as link."],
    ["Carrier rates not loading", "shipments", "P2", "Jordan Lee", "Carrier API timeout; cache warmed."],
    ["Driver app shows wrong ETA", "dispatch", "P3", "Kai Morgan", "Timezone setting on depot corrected."],
    ["Shopify orders not syncing", "integrations", "P2", "Kai Morgan", "Webhook secret rotated by customer; re-authorized."],
    ["How do I add a new depot?", "how-to", "P4", "Noah Kim", "Shared admin guide."],
    ["Bulk address import failing", "data", "P3", "Zara Ali", "CSV had BOM; re-saved as UTF-8."],
  ];
  const tickets: unknown[][] = [];
  let tn = 5000;
  for (let k = 0; k < 140; k++) {
    const c = CUSTOMERS[Math.floor(rand() * CUSTOMERS.length)];
    const [subject, cat, prio, assignee, resolution] = ticketTemplates[Math.floor(rand() * ticketTemplates.length)];
    const created = new Date(now.getTime() - (2 + rand() * 58) * 86400000);
    tickets.push([`T-${tn++}`, c[0], subject, prio, "closed", cat, assignee, created, new Date(created.getTime() + (1 + rand() * 30) * 3600_000), resolution]);
  }
  tickets.push(
    ["T-5240", "cust_bluebird", "Label printer offline in Reno DC", "P3", "closed", "hardware", "Alex Rivera", daysAgo(15, now), daysAgo(15, now), "Driver reinstall."],
    ["T-5390", "cust_meridian", "Export to CSV times out", "P3", "open", "data", "Alex Rivera", daysAgo(2, now), null, null],
    ["T-5391", "cust_harborline", "Invoice PDF missing line items", "P3", "open", "billing", "Ben Fischer", daysAgo(1, now), null, null],
    ["T-5392", "cust_polaris", "Shopify orders not syncing", "P2", "open", "integrations", "Kai Morgan", hoursAgo(20, now), null, null],
    ["T-5393", "cust_quill", "How do I add a new depot?", "P4", "open", "how-to", null, hoursAgo(5, now), null, null],
  );
  await insert(db, "tickets", ["id", "customer_id", "subject", "priority", "status", "category", "assignee", "created_at", "resolved_at", "resolution"], tickets);

  // Past calls across accounts.
  const callNotes = [
    "Quarterly business review; customer happy with dispatch improvements.",
    "Walkthrough of bulk label printing; follow-up training scheduled.",
    "Escalation about delayed carrier rates; resolved after cache fix.",
    "Renewal conversation; asked about multi-depot pricing.",
    "Onboarding check-in; SSO set up successfully.",
  ];
  const calls: unknown[][] = [];
  for (let k = 0; k < 30; k++) {
    const c = CUSTOMERS[1 + Math.floor(rand() * (CUSTOMERS.length - 1))];
    const at = daysAgo(3 + Math.floor(rand() * 80), now);
    calls.push([`call_h${k}`, c[0], ["Alex Rivera", "Noah Kim", "Zara Ali", "Sam Ortiz"][k % 4], at, at, callNotes[k % callNotes.length], ["positive", "neutral", "negative"][Math.floor(rand() * 3)]]);
  }
  await insert(db, "calls", ["id", "customer_id", "agent", "started_at", "ended_at", "summary", "sentiment"], calls);

  await insert(
    db,
    "calls",
    ["id", "customer_id", "agent", "started_at", "ended_at", "summary", "sentiment"],
    [
      ["call_77", "cust_bluebird", "Alex Rivera", daysAgo(33, now), daysAgo(33, now),
        "Quarterly check-in with Dana. Peak season starts mid-Nov; 400 dispatchers onboarding. We promised priority handling of any SSO issues during peak.", "positive"],
      ["call_81", "cust_bluebird", "Sam Ortiz", daysAgo(82, now), daysAgo(82, now),
        "Escalation about August label-printing outage. Issued $1,500 SLA credit. Dana warned that another billing or access issue would 'go to the CFO'.", "negative"],
    ],
  );

  await insert(
    db,
    "call_promises",
    ["id", "customer_id", "call_id", "text", "kind", "owner", "due_at", "status", "trigger_name", "watch_sql", "created_at", "kept_at"],
    [["pr_1", "cust_bluebird", "call_77", "Priority handling for SSO issues during peak season", "commitment", "Alex Rivera", daysAgo(-50, now), "open", null, null, daysAgo(33, now), null]],
  );
}

// ---------------------------------------------------------------------------------------------
// Live demo scenario steps (triggered from the Director panel). Each one writes to the database;
// Triggerware triggers watching those tables pick the change up and fire signals.
// ---------------------------------------------------------------------------------------------

export async function scenarioBreakSso(db: Driver, now = new Date()) {
  const rand = rng(7);
  await db.exec(`INSERT INTO deploys (id, service, version, author, notes, created_at) VALUES
    ('dep_104', 'auth-service', 'v4.12.0', 'Jordan Lee',
     'Harden SAML validation: clock-skew tolerance 300s -> 30s', '${minutesAgo(38, now).toISOString()}')
    ON CONFLICT (id) DO NOTHING;`);
  // The payment-retry bug double-charges Bluebird (second success 3 minutes after the first).
  const bbAmt = Math.round((184000 / 12) * 100) / 100;
  await db.exec(`INSERT INTO payments (id, invoice_id, customer_id, amount, status, failure_reason, created_at) VALUES
    ('pay_0c', 'INV-8800', 'cust_bluebird', ${bbAmt}, 'succeeded', NULL, '${hoursAgo(6.12, now).toISOString()}')
    ON CONFLICT (id) DO NOTHING;`);
  const rows: unknown[][] = [];
  for (const id of OKTA_CUSTOMERS) {
    const n = id === "cust_bluebird" ? 46 : 6 + Math.floor(rand() * 14);
    for (let k = 0; k < n; k++) {
      rows.push([id, `user${k}@${id.slice(5)}.com`, 0, "SAML_ASSERTION_EXPIRED", minutesAgo(Math.floor(rand() * 35), now)]);
    }
  }
  await insert(db, "login_events", ["customer_id", "user_email", "success", "error_code", "created_at"], rows);
  await insert(
    db,
    "tickets",
    ["id", "customer_id", "subject", "priority", "status", "category", "assignee", "created_at", "resolved_at", "resolution"],
    [
      ["T-5529", "cust_lumen", "Pharmacists locked out — SSO error", "P1", "open", "sso", null, minutesAgo(22, now), null, null],
      ["T-5530", "cust_bluebird", "Were we charged twice this month?", "P2", "open", "billing", null, minutesAgo(18, now), null, null],
      ["T-5531", "cust_bluebird", "Nobody can log in — dispatch is down", "P1", "open", "sso", null, minutesAgo(9, now), null, null],
      ["T-5532", "cust_northwind", "Okta login fails with 'assertion expired'", "P1", "open", "sso", null, minutesAgo(5, now), null, null],
    ],
  );
  await db.exec(`DELETE FROM usage_daily WHERE customer_id='cust_bluebird' AND day = DATE '${now.toISOString().slice(0, 10)}';
    INSERT INTO usage_daily VALUES ('cust_bluebird', DATE '${now.toISOString().slice(0, 10)}', 41, 120);`);
}

export async function scenarioRefund(db: Driver, now = new Date()) {
  const bbAmt = Math.round((184000 / 12) * 100) / 100;
  await db.exec(`INSERT INTO refunds (id, customer_id, payment_id, amount, reason, issued_by, created_at) VALUES
    ('rf_${now.getTime()}', 'cust_bluebird', 'pay_0c', ${bbAmt}, 'Duplicate charge (payment retry)', 'Ana Gomez', '${now.toISOString()}');`);
}

export async function scenarioRollback(db: Driver, now = new Date()) {
  await db.exec(`INSERT INTO deploys (id, service, version, author, notes, created_at) VALUES
    ('dep_105', 'auth-service', 'v4.12.1', 'Leo Park', 'Revert SAML clock-skew tolerance to 300s', '${now.toISOString()}')
    ON CONFLICT (id) DO NOTHING;
    UPDATE incidents SET status='resolved', resolved_at='${now.toISOString()}' WHERE status <> 'resolved';`);
  const rows: unknown[][] = OKTA_CUSTOMERS.flatMap((id) =>
    [0, 1, 2].map((k) => [id, `user${k}@${id.slice(5)}.com`, 1, null, now]),
  );
  await insert(db, "login_events", ["customer_id", "user_email", "success", "error_code", "created_at"], rows);
}
