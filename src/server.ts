// Builds the McpServer, wires up every tool / resource / prompt, and exposes
// helpers used by other modules (logging, registry introspection, server info).
//
// IMPORTANT: when running over stdio, **every byte written to stdout is part
// of the JSON-RPC protocol** — accidentally `console.log()`-ing to stdout will
// corrupt the connection. All of our logging goes to stderr instead.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerAddNumbersTool } from "./tools/addNumbers.js";
import { registerGetCurrentTimeTool } from "./tools/getCurrentTime.js";
import { registerSaveNoteTool } from "./tools/saveNote.js";

import { registerNotesResource, NOTES_RESOURCE_URI } from "./resources/notesResource.js";
import { registerStatusResource, STATUS_RESOURCE_URI } from "./resources/statusResource.js";

import { registerSummarizeNotePrompt } from "./prompts/summarizeNote.js";
import { registerExplainMcpPrompt } from "./prompts/explainMcp.js";

export const SERVER_INFO = {
  name: "mcp-learning-server",
  version: "0.1.0",
} as const;

// Track everything we register so the status resource can echo it back.
const registered = {
  tools: [] as string[],
  resources: [] as string[],
  prompts: [] as string[],
};

let startTime = Date.now();

/** Returns the wall-clock time (ms since epoch) when the server booted. */
export function getStartTime(): number {
  return startTime;
}

/** Returns the names of every registered tool/resource/prompt. */
export function getRegisteredNames(): typeof registered {
  return registered;
}

/** Stderr logger used by tool handlers. Stays off stdout to keep stdio clean. */
export function logToolCall(name: string, args: unknown): void {
  console.error(`[tool] ${name} ${JSON.stringify(args)}`);
}

/** Build a fully-configured MCP server. Call `.connect(transport)` to start it. */
export function buildServer(): McpServer {
  startTime = Date.now();
  const server = new McpServer(SERVER_INFO);

  // --- Tools -------------------------------------------------------------
  registerAddNumbersTool(server);
  registerGetCurrentTimeTool(server);
  registerSaveNoteTool(server);
  registered.tools.push("add_numbers", "get_current_time", "save_note");

  // --- Resources ---------------------------------------------------------
  registerNotesResource(server);
  registerStatusResource(server);
  registered.resources.push(NOTES_RESOURCE_URI, STATUS_RESOURCE_URI);

  // --- Prompts -----------------------------------------------------------
  registerSummarizeNotePrompt(server);
  registerExplainMcpPrompt(server);
  registered.prompts.push("summarize_note", "explain_mcp");

  return server;
}
