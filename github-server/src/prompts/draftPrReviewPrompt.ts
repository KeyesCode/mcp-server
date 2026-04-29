// Prompt: draft_pr_review
//
// MCP prompts are *templates* — the server doesn't run an LLM, it just
// returns a list of messages the client can hand to its model. Here we
// instruct Claude to use the GitHub tools we registered to gather data,
// then produce a structured review.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerDraftPrReviewPrompt(server: McpServer): void {
  server.registerPrompt(
    "draft_pr_review",
    {
      title: "Draft a PR Review",
      description:
        "Walks Claude through fetching PR details + diff and producing a structured engineering review.",
      // Prompt arguments are always strings on the wire; we describe them
      // here so clients can render a nice form.
      argsSchema: {
        pull_number: z
          .string()
          .describe("PR number to review (e.g. \"123\")."),
      },
    },
    ({ pull_number }) => {
      const text = `You are reviewing pull request #${pull_number} on the default GitHub repo.

Use the tools available on this MCP server to gather context, then write a professional review.

Steps:
1. Call \`get_pr_details\` with pull_number=${pull_number} to read the title, description, author, labels, and file/line counts.
2. Call \`get_pr_diff\` with pull_number=${pull_number} to read the actual changes. If the diff is truncated, note that in your review and focus on what you can see.
3. Produce a Markdown review with the following sections:

   ### Purpose
   1–2 sentences on what the PR does, derived from the description and the diff (not just the title).

   ### Notable changes
   Bullet list of the most important hunks, citing file paths.

   ### Risk areas
   Anything that could break in production: edge cases, error handling gaps, concurrency, security, performance, breaking API changes.

   ### Suggested review comments
   For each suggestion, include the file path and (if you can tell from the diff) the function or area, then the comment. Be specific.

   ### Missing tests
   What test coverage is absent that you'd want before merging?

   ### Verdict
   One of: **Approve**, **Request changes**, or **Comment**, with one sentence explaining why.

Tone: professional, constructive, specific. Cite file paths from the diff. Don't speculate about code you haven't seen.`;

      return {
        messages: [
          { role: "user", content: { type: "text", text } },
        ],
      };
    },
  );
}
