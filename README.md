# CallBrain: resolve the customer's issue before the call ends

**CallBrain** is a live-call copilot for support teams, built on **Triggerware**.
While a customer is on the phone, it:

1. **Briefs you before you say hello**: 7 parallel Triggerware lookups (account, open tickets, login failures,
   payments, credits, usage, open promises) plus an AI summary of *why they're probably calling*.
2. **Diagnoses live during the call**: every line of the conversation triggers plain-English and SQL queries through
   Triggerware: their errors, recent deploys, and **blast radius** (are other customers affected? then it's an incident).
3. **Keeps agents safe**: guardrails from company policy ("a second credit in 90 days needs manager approval").
4. **Acts**: declare an incident, apply a documented workaround (verified by a live Triggerware query), page the owner.
5. **Keeps every promise**: at wrap-up, each commitment becomes a **Triggerware trigger** on live data. When the refund
   lands or the fix ships, Triggerware pushes the change, CallBrain marks the promise kept and drafts the customer update.
6. **Speaks up on its own**: always-on triggers (P1 tickets, login-failure spikes, duplicate charges, deploys,
   incidents) push signals with an AI brief ("what it means, which policy, who owns it").
7. **Reflexes**: anyone types *"tell me when…"* and Triggerware compiles it into a live trigger.

## Triggerware features used

| Feature | Where |
|---|---|
| `cursors.open({ prompt })`: natural language → SQL | Copilot's live lookups (shows the generated SQL) |
| `cursors.open({ sql })` | Pre-call briefing, workaround verification |
| `triggers.create` (SQL and **plain-English prompt**) | Signals, Reflexes, Promise Keeper |
| `triggers.watch`: **push** deltas (added/deleted rows) | All signals, with no polling |
| `triggers.run` / `enable` / `disable` / `delete` | Reflexes page |
| `queries.create` + `queries.get().fetch` (saved queries) | Account Radar |
| `queries.convert`: saved query → trigger | Account Radar "Convert to trigger" |
| `tables.create({ prompt })`: data source from English | Orbit tables + "Add a data source" |
| `tables.get` (view generated code) | Data Sources |
| `agents.create` bound to triggers | Data Sources: Triggerware agent |
| `connectors.list/catalog`, `runtimes`, `system.health` | Data Sources, status pill |
| MCP / Claude Code plugin | Same data from your IDE (`claude plugin install triggerware@triggerware`) |

## Run it (demo laptop)

```bash
triggerware start              # local Triggerware server on 127.0.0.1:5221 (already installed)
cd callbrain && npm run dev    # http://localhost:3000
```

`.env.local` is already set up: `GEMINI_API_KEY` (AI) and `TRIGGERWARE_MODE=live`. On boot CallBrain registers
15 Orbit tables in Triggerware (Lua generators reading `/api/feed/<table>`), 2 saved queries and 6 triggers, then
subscribes to every trigger with `watch`. The sidebar pill shows **LIVE**. Set `TRIGGERWARE_MODE=simulation` to run
without a Triggerware server.

**AI providers:** NVIDIA **Nemotron** (`nemotron-3.5-lightning`, thinking off) is primary: fast and free-tier.
Gemini is the automatic fallback (it rotates across models when one is overloaded or rate-limited). Order is set by
`AI_PROVIDERS=nvidia,gemini`. The copilot always shows an instant answer computed from live Triggerware facts, then
upgrades it in place when the AI answer arrives, so the demo never waits on a model.

## Control Room
**Control Room** (sidebar, or the orange button on every screen) writes real rows to Orbit's database: failed-login
bursts, P1 tickets, double charges, refunds, deploys, incidents, the full "bad deploy" scenario and the rollback.
The timeline shows **what changed → which Triggerware trigger detected it → how many seconds it took → the
resulting signal**. CallBrain never tells Triggerware about the change; Triggerware finds it on its own.

## Dataset
40 customers · 24h of login traffic (~2,500 events with realistic background failures) · ~145 tickets over 60 days ·
~30 deploys · 5 past incidents · 3 months of invoices and payments · credits, refunds, past calls and promises.
Reset any time from the Control Room.

## 3-minute demo

1. **Hook (15s):** "Support agents juggle 10 tabs while an angry customer waits. Postmortem INC-1987 says detection was
   slowest: the incident was declared after the 9th ticket."
2. **Control Room → "Bad deploy hits Okta SSO"**, open **Signals**: Triggerware pushes *13 customers failing login*,
   P1s and a duplicate charge, each with a brief. Nobody refreshed anything.
3. **Live Call → Accept Bluebird.** The briefing fills in: ARR, renewal in 3 weeks, 46 failed logins, duplicate charge,
   usage crashed today. *"Likely calling about…"*
4. Play demo lines 1–2 (or **speak**). Watch **Triggerware live lookups**: plain-English questions → generated SQL →
   rows. The copilot finds the auth-service deploy, **blast radius 13 customers → incident**, and the double charge.
5. Demo line 3 ("give us a credit"): **guardrail**, she already got one in August, so manager approval is needed.
6. Click **Apply workaround** (Triggerware verifies logins recovered) and **Declare incident**.
7. **End call**: summary written, **every promise becomes a Triggerware trigger** (SQL shown).
8. Control Room → **"Issue refund"** (Bluebird) → *Promise kept*, customer email drafted. **"Roll back auth-service"**
   → the second promise is kept too.
9. **Reflexes:** a judge types a sentence and it becomes a live trigger.
10. Close: *"Triggerware gives the company brain a nervous system. It knows what's happening right now and keeps
    watching after the call ends."*

## Stack
Next.js 15 · TypeScript · Tailwind v4 · NVIDIA Nemotron + Gemini (JSON-schema output), Claude optional · `triggerware` Node SDK (local server) · PGlite / Postgres.
