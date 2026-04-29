#!/usr/bin/env node
// Entrypoint: build the server, wire it to a stdio transport, and start
// listening for JSON-RPC frames on stdin/stdout.
//
// Stdio transport is the most common way MCP servers are launched by clients
// like Claude Desktop: the client spawns this process, writes requests to its
// stdin, and reads responses from its stdout. Logs go to stderr.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer, SERVER_INFO, getRegisteredNames } from "./server.js";

async function main(): Promise<void> {
  const server = buildServer();

  // Helpful startup banner — written to stderr so it cannot corrupt the
  // JSON-RPC stream on stdout.
  const reg = getRegisteredNames();
  console.error(
    `[startup] ${SERVER_INFO.name} v${SERVER_INFO.version} ready over stdio`,
  );
  console.error(`[startup] tools: ${reg.tools.join(", ")}`);
  console.error(`[startup] resources: ${reg.resources.join(", ")}`);
  console.error(`[startup] prompts: ${reg.prompts.join(", ")}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Graceful shutdown when the parent process closes the pipe.
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
