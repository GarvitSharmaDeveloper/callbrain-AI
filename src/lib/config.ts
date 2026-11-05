// Central runtime configuration. Everything is env-driven so the same build runs in
// "simulation" (no Triggerware server) and "live" (real Triggerware via the official SDK) mode.

export const config = {
  anthropicModel: process.env.CLAUDE_MODEL || "claude-opus-5-5",

  triggerware: {
    // "live" connects to a Triggerware server with the `triggerware` Node SDK.
    mode: (process.env.TRIGGERWARE_MODE || "simulation") as "live" | "simulation",
    // Local server (`triggerware start`) — default TCP address.
    address: process.env.TRIGGERWARE_ADDRESS || "localhost:5221",
    // Cloud instance over WebSocket (optional): set both.
    wsUrl: process.env.TRIGGERWARE_WS_URL || "",
    apiKey: process.env.TRIGGERWARE_API_KEY || "",
    // Orbit tables are registered in Triggerware with this prefix (e.g. orbit_tickets).
    tablePrefix: process.env.TRIGGERWARE_TABLE_PREFIX ?? "orbit_",
    // Trigger schedule: 7-field cron (sec min hour dom month dow year). Default: every 5 seconds.
    schedule: process.env.TRIGGERWARE_SCHEDULE || "*/5 * * * * * *",
    // Base URL Triggerware tables use to read Orbit's live data feed.
    feedBaseUrl: (process.env.ORBIT_FEED_URL || "http://localhost:3000").replace(/\/$/, ""),
    // Simulation-mode trigger evaluation interval.
    simPollMs: Number(process.env.TRIGGERWARE_SIM_POLL_MS || 3000),
  },

  databaseUrl: process.env.DATABASE_URL || "",
};

export const twLive = () => config.triggerware.mode === "live";
export const twMode = () => config.triggerware.mode;
