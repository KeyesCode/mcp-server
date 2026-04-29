// Tool: add_numbers
//
// The simplest possible MCP tool — takes two numbers, returns their sum.
// Useful as a "hello world" to verify the round-trip from client → server.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logToolCall } from "../server.js";

export function registerAddNumbersTool(server: McpServer): void {
  server.registerTool(
    "add_numbers",
    {
      title: "Add Numbers",
      description: "Adds two numbers together and returns the sum.",
      // The input schema is a "raw shape" — a plain object whose values are
      // Zod schemas. The SDK turns this into a JSON Schema for the client.
      inputSchema: {
        a: z.number().describe("First addend"),
        b: z.number().describe("Second addend"),
      },
    },
    async ({ a, b }) => {
      const sum = a + b;
      logToolCall("add_numbers", { a, b, sum });
      // Tool results return an array of "content blocks". For text output the
      // shape is `{ type: "text", text: "..." }`. Other types include
      // `image`, `audio`, and `resource`.
      return {
        content: [{ type: "text", text: `${a} + ${b} = ${sum}` }],
      };
    },
  );
}
