// Tool: list_issues
//
// Lists issues in a repository. GitHub's `issues` API returns *both* issues
// and PRs (PRs are issues with a `pull_request` field), so we filter PRs
// out client-side.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOctokit } from "../github/client.js";
import { resolveRepo } from "../config/env.js";
import { formatGithubError, toolErrorResult } from "../utils/errors.js";
import { formatIssueSummary } from "../utils/formatters.js";
import { logToolCall } from "../server.js";

export function registerListIssuesTool(server: McpServer): void {
  server.registerTool(
    "list_issues",
    {
      title: "List Issues",
      description:
        "Lists GitHub issues for a repository, with PRs filtered out. Sorted by most-recently-updated first.",
      inputSchema: {
        owner: z.string().optional(),
        repo: z.string().optional(),
        state: z
          .enum(["open", "closed", "all"])
          .optional()
          .describe("Issue state filter (default: open)."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Maximum issues to return (default 20, max 50)."),
      },
    },
    async ({ owner, repo, state, limit }) => {
      try {
        const target = resolveRepo(owner, repo);
        const max = limit ?? 20;
        const stateFilter = state ?? "open";
        logToolCall("list_issues", {
          ...target,
          state: stateFilter,
          limit: max,
        });

        // We over-fetch slightly because we drop PRs after the fact. Up to
        // 50 extra slots are enough for typical repos; for heavy projects
        // we'd loop with octokit.paginate, but that's out of scope here.
        const { data } = await getOctokit().rest.issues.listForRepo({
          owner: target.owner,
          repo: target.repo,
          state: stateFilter,
          per_page: Math.min(max + 30, 100),
          sort: "updated",
          direction: "desc",
        });

        const issuesOnly = data.filter((i) => !i.pull_request).slice(0, max);
        const text = issuesOnly.length
          ? issuesOnly.map(formatIssueSummary).join("\n\n")
          : `No ${stateFilter} issues in ${target.owner}/${target.repo}.`;
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return toolErrorResult(formatGithubError(err, "list_issues"));
      }
    },
  );
}
