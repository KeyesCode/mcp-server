// Resource: notes://all
//
// Resources are read-only "views" into data the server can expose. Unlike
// tools (which the LLM calls to perform actions), resources are usually
// surfaced to the user/client for context — e.g. "attach this resource to
// the conversation".

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadNotes } from "../storage/notesStore.js";

export const NOTES_RESOURCE_URI = "notes://all";

export function registerNotesResource(server: McpServer): void {
  server.registerResource(
    "notes",
    NOTES_RESOURCE_URI,
    {
      title: "All Saved Notes",
      description: "JSON array of every note saved via the save_note tool.",
      mimeType: "application/json",
    },
    async (uri) => {
      const notes = await loadNotes();
      // A resource read returns one or more `contents` entries. Each entry
      // includes the URI it represents, the mime type, and either `text` or
      // `blob` (base64 binary). We return JSON text here.
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(notes, null, 2),
          },
        ],
      };
    },
  );
}
