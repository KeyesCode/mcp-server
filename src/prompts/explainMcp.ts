// Prompt: explain_mcp
//
// A zero-argument prompt that returns a short, beginner-friendly explanation
// of how this server is wired together. Handy for showing how prompts can
// ship "canned" content alongside dynamic content.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const EXPLANATION = `You are talking to a small **learning-focused MCP server** written in TypeScript.

Here is how it is structured:

1. **Server entrypoint** — \`src/index.ts\` boots the server and connects it
   to a stdio transport (stdin/stdout JSON-RPC frames).
2. **Tools** — actions the LLM can call:
   - \`add_numbers\` (math),
   - \`get_current_time\` (introspection),
   - \`save_note\` (writes to a local JSON file).
3. **Resources** — read-only views the client can attach:
   - \`notes://all\` — every saved note,
   - \`server://status\` — uptime + registered capabilities.
4. **Prompts** — reusable instruction templates the client can offer the user:
   - \`summarize_note\` (parameterised),
   - \`explain_mcp\` (this one).
5. **Storage** — a single \`data/notes.json\` file. No database, no auth.

When you call a tool, the client serializes your arguments as JSON-RPC, the
server validates them against the tool's JSON Schema, runs the handler, and
returns a list of "content blocks" back to you.

Use this server to experiment with the protocol — then graduate to MCP
servers that wrap real systems (GitHub, Postgres, Stripe, your company API).`;

export function registerExplainMcpPrompt(server: McpServer): void {
  server.registerPrompt(
    "explain_mcp",
    {
      title: "Explain This MCP Server",
      description:
        "Returns a beginner-friendly explanation of how this MCP server is structured.",
    },
    async () => ({
      messages: [
        {
          role: "user",
          content: { type: "text", text: EXPLANATION },
        },
      ],
    }),
  );
}
