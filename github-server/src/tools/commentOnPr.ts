// Tool: comment_on_pr
//
// Posts a *conversation* comment on a PR (the kind that appears in the
// "Conversation" tab). Line-level review comments use a different endpoint
// (`pulls.createReviewComment`) and are intentionally out of scope here.
//
// Quirk worth knowing: GitHub treats PRs as a special case of issues, so
// the comment endpoint is `issues.createComment` with the PR number passed
// as `issue_number`. That feels weird the first time you see it.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOctokit } from "../github/client.js";
import { resolveRepo } from "../config/env.js";
import { formatGithubError, toolErrorResult } from "../utils/errors.js";
import { logToolCall } from "../server.js";

export function registerCommentOnPrTool(server: McpServer): void {
  server.registerTool(
    "comment_on_pr",
    {
      title: "Comment on PR",
      description:
        "Posts a conversation comment on a pull request. Does NOT post line-level review comments.",
      annotations: {
        destructiveHint: true,
        idempotentHint: false,
      },
      inputSchema: {
        owner: z.string().optional(),
        repo: z.string().optional(),
        pull_number: z.number().int().positive(),
        body: z.string().min(1).describe("Comment body (Markdown allowed)."),
      },
    },
    async ({ owner, repo, pull_number, body }) => {
      try {
        const target = resolveRepo(owner, repo);
        logToolCall("comment_on_pr", { ...target, pull_number });
        const { data } = await getOctokit().rest.issues.createComment({
          owner: target.owner,
          repo: target.repo,
          issue_number: pull_number,
          body,
        });
        return {
          content: [
            {
              type: "text",
              text: `Posted comment on PR #${pull_number}.\n${data.html_url}`,
            },
          ],
        };
      } catch (err) {
        return toolErrorResult(formatGithubError(err, "comment_on_pr"));
      }
    },
  );
}
