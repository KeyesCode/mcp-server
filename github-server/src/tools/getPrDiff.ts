// Tool: get_pr_diff
//
// Fetches the unified diff of a PR. We ask GitHub for the `diff` media type
// rather than the JSON metadata — the response body comes back as a plain
// string. Diffs can be huge, so we hard-cap the response at MAX_DIFF_BYTES.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOctokit } from "../github/client.js";
import { resolveRepo } from "../config/env.js";
import { formatGithubError, toolErrorResult } from "../utils/errors.js";
import { truncateDiff } from "../utils/formatters.js";
import { logToolCall } from "../server.js";

export function registerGetPrDiffTool(server: McpServer): void {
  server.registerTool(
    "get_pr_diff",
    {
      title: "Get PR Diff",
      description:
        "Fetches the unified diff for a pull request. Large diffs are truncated; the response includes a clear marker if so.",
      inputSchema: {
        owner: z.string().optional(),
        repo: z.string().optional(),
        pull_number: z.number().int().positive(),
      },
    },
    async ({ owner, repo, pull_number }) => {
      try {
        const target = resolveRepo(owner, repo);
        logToolCall("get_pr_diff", { ...target, pull_number });

        // mediaType: 'diff' makes GitHub return text/x-diff. The response
        // body lands in `data` typed as the standard PR object — we know
        // it's actually a string at runtime, so we cast.
        const response = await getOctokit().rest.pulls.get({
          owner: target.owner,
          repo: target.repo,
          pull_number,
          mediaType: { format: "diff" },
        });
        const rawDiff = response.data as unknown as string;
        const { text, truncated, originalBytes } = truncateDiff(rawDiff);
        const header = truncated
          ? `# PR #${pull_number} diff (truncated from ${originalBytes.toLocaleString()} bytes)\n\n`
          : `# PR #${pull_number} diff (${originalBytes.toLocaleString()} bytes)\n\n`;
        return { content: [{ type: "text", text: header + text }] };
      } catch (err) {
        return toolErrorResult(formatGithubError(err, "get_pr_diff"));
      }
    },
  );
}
