import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pg", "triggerware", "tw2-jsonrpc", "ws"],
};

export default nextConfig;
