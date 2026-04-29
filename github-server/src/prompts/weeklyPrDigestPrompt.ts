// Prompt: weekly_pr_digest
//
// Zero-argument prompt that produces a weekly engineering digest. The
// server doesn't compute anything — it just gives Claude a clear
// instruction set and lets it wield the GitHub tools.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerWeeklyPrDigestPrompt(server: McpServer): void {
  server.registerPrompt(
    "weekly_pr_digest",
    {
      title: "Weekly PR Digest",
      description:
        "Produces a weekly engineering digest of open PRs: what's in flight, what's risky, what's stale.",
    },
    () => {
      const text = `Produce a weekly engineering digest of open pull requests for the default GitHub repo.

Steps:
1. Call \`list_open_prs\` (use the default limit) to get the current list.
2. For any PR whose title or branch is unclear, optionally call \`get_pr_details\` for clarification — but don't fetch every PR's full details unless needed.
3. Group the PRs into the following sections in a Markdown digest:

   ### Ready for review
   Non-draft PRs with a description, no obvious blockers.

   ### In progress
   Draft PRs or PRs marked WIP.

   ### Stale
   PRs whose \`updated_at\` is more than 7 days ago.

   ### Risky / large
   PRs touching many files, or whose titles suggest cross-cutting changes (auth, infra, schema).

For each PR include: \`#NUM title — @author (branch → base) [last updated ago]\` and a one-line summary if you can infer one.

Close with a **TL;DR** section: 2–4 sentences a manager could skim.`;

      return {
        messages: [
          { role: "user", content: { type: "text", text } },
        ],
      };
    },
  );
}
