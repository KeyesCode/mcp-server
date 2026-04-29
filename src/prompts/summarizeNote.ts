// Prompt: summarize_note
//
// Prompts are *templates* the server offers to the client. They are not
// executed by the server — the server just returns a list of "messages" the
// client can hand off to its LLM. Think of prompts as reusable, parameterised
// instructions that any MCP-aware client can surface in a slash-command menu.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { findNoteByTitle } from "../storage/notesStore.js";

export function registerSummarizeNotePrompt(server: McpServer): void {
  server.registerPrompt(
    "summarize_note",
    {
      title: "Summarize a Saved Note",
      description:
        "Builds a prompt asking the LLM to summarize a previously saved note (looked up by title).",
      argsSchema: {
        title: z.string().describe("Title of the note to summarize."),
      },
    },
    async ({ title }) => {
      const note = await findNoteByTitle(title);
      const text = note
        ? `Please write a 2-3 sentence summary of the note below.\n\n` +
          `Title: ${note.title}\n` +
          `Saved: ${note.createdAt}\n\n` +
          `---\n${note.body}\n---`
        : `No note titled "${title}" was found in storage. ` +
          `Please ask the user to save it first via the save_note tool.`;

      return {
        messages: [
          {
            role: "user",
            content: { type: "text", text },
          },
        ],
      };
    },
  );
}
