// Tool: list_open_prs
//
// Returns a compact summary of open PRs in a repo. Defaults to the repo
// configured in .env so callers usually don't need to pass owner/repo.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOctokit } from "../github/client.js";
import { resolveRepo } from "../config/env.js";
import { formatGithubError, toolErrorResult } from "../utils/errors.js";
import { formatPrSummary } from "../utils/formatters.js";
import { logToolCall } from "../server.js";

export function registerListOpenPrsTool(server: McpServer): void {
  server.registerTool(
    "list_open_prs",
    {
      title: "List Open PRs",
      description:
        "Lists open pull requests for a repository. Sorted by most-recently-updated first.",
      inputSchema: {
        owner: z
          .string()
          .optional()
          .describe("Repository owner (defaults to DEFAULT_GITHUB_OWNER)."),
        repo: z
          .string()
          .optional()
          .describe("Repository name (defaults to DEFAULT_GITHUB_REPO)."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Maximum PRs to return (default 20, max 50)."),
      },
    },
    async ({ owner, repo, limit }) => {
      try {
        const target = resolveRepo(owner, repo);
        const max = limit ?? 20;
        logToolCall("list_open_prs", { ...target, limit: max });

        const { data } = await getOctokit().rest.pulls.list({
          owner: target.owner,
          repo: target.repo,
          state: "open",
          per_page: max,
          sort: "updated",
          direction: "desc",
        });

        const text = data.length
          ? data.map(formatPrSummary).join("\n\n")
          : `No open PRs in ${target.owner}/${target.repo}.`;
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return toolErrorResult(formatGithubError(err, "list_open_prs"));
      }
    },
  );
}
