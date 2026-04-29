// Tool: get_pr_details
//
// Returns the full PR record (title, body, labels, reviewers, file/line
// counts, mergeable state, URL). Useful as the first step before reviewing
// a PR — pair it with `get_pr_diff`.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOctokit } from "../github/client.js";
import { resolveRepo } from "../config/env.js";
import { formatGithubError, toolErrorResult } from "../utils/errors.js";
import { formatPrDetail } from "../utils/formatters.js";
import { logToolCall } from "../server.js";

export function registerGetPrDetailsTool(server: McpServer): void {
  server.registerTool(
    "get_pr_details",
    {
      title: "Get PR Details",
      description:
        "Fetches the full details of a single pull request: title, body, labels, requested reviewers, additions/deletions, mergeable state, and URL.",
      inputSchema: {
        owner: z.string().optional(),
        repo: z.string().optional(),
        pull_number: z
          .number()
          .int()
          .positive()
          .describe("The PR number (e.g. 123)."),
      },
    },
    async ({ owner, repo, pull_number }) => {
      try {
        const target = resolveRepo(owner, repo);
        logToolCall("get_pr_details", { ...target, pull_number });
        const { data } = await getOctokit().rest.pulls.get({
          owner: target.owner,
          repo: target.repo,
          pull_number,
        });
        return { content: [{ type: "text", text: formatPrDetail(data) }] };
      } catch (err) {
        return toolErrorResult(formatGithubError(err, "get_pr_details"));
      }
    },
  );
}
