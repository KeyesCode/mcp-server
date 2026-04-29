#!/usr/bin/env node
// Entrypoint: build the server and connect it to a stdio transport.
//
// We pre-flight `getEnv()` so a missing GITHUB_TOKEN fails immediately at
// startup with a friendly message — instead of letting the first tool call
// blow up with a confusing 401 from GitHub.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer, SERVER_INFO, getRegisteredNames } from "./server.js";
import { getEnv } from "./config/env.js";
import { ConfigError } from "./utils/errors.js";

async function main(): Promise<void> {
  // Validate env up front. If this throws we exit non-zero with a clear
  // message — Claude Desktop will surface it in its server-status panel.
  try {
    getEnv();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[fatal] ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  const server = buildServer();
  const reg = getRegisteredNames();

  console.error(
    `[startup] ${SERVER_INFO.name} v${SERVER_INFO.version} ready over stdio`,
  );
  console.error(`[startup] tools:     ${reg.tools.join(", ")}`);
  console.error(`[startup] resources: ${reg.resources.join(", ")}`);
  console.error(`[startup] prompts:   ${reg.prompts.join(", ")}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = async (signal: string) => {
    console.error(`[shutdown] received ${signal}, closing transport`);
    await server.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
