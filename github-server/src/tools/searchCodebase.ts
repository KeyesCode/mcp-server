// Tool: search_codebase
//
// Wraps GitHub's code search API, scoped automatically to the target repo.
//
// Notes / limitations of the underlying API:
//   - Searches the default branch only.
//   - Can lag a few minutes behind pushes (search is async-indexed).
//   - Has its own rate limit (separate from the core REST quota).
//   - Forks aren't searched unless they have many stars.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOctokit } from "../github/client.js";
import { resolveRepo } from "../config/env.js";
import { formatGithubError, toolErrorResult } from "../utils/errors.js";
import { logToolCall } from "../server.js";

export function registerSearchCodebaseTool(server: McpServer): void {
  server.registerTool(
    "search_codebase",
    {
      title: "Search Codebase",
      description:
        "Search a repository's code for a keyword or phrase using GitHub's code search. Searches the default branch only.",
      inputSchema: {
        owner: z.string().optional(),
        repo: z.string().optional(),
        query: z
          .string()
          .min(1)
          .describe(
            "Search keyword or phrase. Will be scoped to the target repo automatically; you can also use GitHub search qualifiers (e.g. 'language:ts').",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(30)
          .optional()
          .describe("Max matches to return (default 15, max 30)."),
      },
    },
    async ({ owner, repo, query, limit }) => {
      try {
        const target = resolveRepo(owner, repo);
        const max = limit ?? 15;
        const q = `${query} repo:${target.owner}/${target.repo}`;
        logToolCall("search_codebase", { ...target, query, limit: max });

        const { data } = await getOctokit().rest.search.code({
          q,
          per_page: max,
        });

        if (data.total_count === 0) {
          return {
            content: [
              { type: "text", text: `No matches for "${query}" in ${target.owner}/${target.repo}.` },
            ],
          };
        }

        const lines = data.items.map((item) => {
          const score = item.score != null ? ` (score: ${item.score.toFixed(2)})` : "";
          return `${item.path}${score}\n  ${item.html_url}`;
        });
        const text =
          `Found ${data.total_count} match${data.total_count === 1 ? "" : "es"} ` +
          `(showing top ${data.items.length}):\n\n` +
          lines.join("\n\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return toolErrorResult(formatGithubError(err, "search_codebase"));
      }
    },
  );
}
