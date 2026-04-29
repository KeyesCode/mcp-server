// Tool: save_note
//
// Demonstrates a tool that has side effects (writes to disk) and returns
// structured information about what it did.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { addNote } from "../storage/notesStore.js";
import { logToolCall } from "../server.js";

export function registerSaveNoteTool(server: McpServer): void {
  server.registerTool(
    "save_note",
    {
      title: "Save Note",
      description:
        "Saves a note to the local notes.json store. Returns the saved record (including its generated id).",
      inputSchema: {
        title: z.string().min(1).describe("Short title for the note."),
        body: z.string().min(1).describe("The note's content."),
      },
    },
    async ({ title, body }) => {
      const note = await addNote({ title, body });
      logToolCall("save_note", { id: note.id, title: note.title });
      return {
        content: [
          {
            type: "text",
            text: `Saved note "${note.title}" with id ${note.id} at ${note.createdAt}.`,
          },
        ],
      };
    },
  );
}
