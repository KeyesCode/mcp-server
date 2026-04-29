// Resource: server://status
//
// Reports liveness info about the running server: uptime, version, and the
// names of every tool/resource/prompt that has been registered.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SERVER_INFO, getStartTime, getRegisteredNames } from "../server.js";
import { getNotesFilePath } from "../storage/notesStore.js";

export const STATUS_RESOURCE_URI = "server://status";

export function registerStatusResource(server: McpServer): void {
  server.registerResource(
    "status",
    STATUS_RESOURCE_URI,
    {
      title: "Server Status",
      description:
        "Diagnostic info: version, uptime, notes-file path, and lists of registered tools/resources/prompts.",
      mimeType: "application/json",
    },
    async (uri) => {
      const uptimeMs = Date.now() - getStartTime();
      const status = {
        name: SERVER_INFO.name,
        version: SERVER_INFO.version,
        uptimeSeconds: Math.round(uptimeMs / 1000),
        startedAt: new Date(getStartTime()).toISOString(),
        notesFile: getNotesFilePath(),
        registered: getRegisteredNames(),
      };
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(status, null, 2),
          },
        ],
      };
    },
  );
}
