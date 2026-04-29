// Tool: get_current_time
//
// A zero-argument tool. Demonstrates that `inputSchema` is optional when
// the tool takes no parameters.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logToolCall } from "../server.js";

export function registerGetCurrentTimeTool(server: McpServer): void {
  server.registerTool(
    "get_current_time",
    {
      title: "Get Current Time",
      description:
        "Returns the current local timestamp in ISO-8601 form, plus the server's IANA time zone.",
    },
    async () => {
      const now = new Date();
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const payload = {
        iso: now.toISOString(),
        local: now.toString(),
        timeZone: zone,
      };
      logToolCall("get_current_time", payload);
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      };
    },
  );
}
