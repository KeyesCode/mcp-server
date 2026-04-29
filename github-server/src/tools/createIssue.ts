// Tool: create_issue
//
// Creates a new issue. This is the first tool we have with a *write* side
// effect, so the MCP client should typically prompt the user to approve the
// call before it runs.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOctokit } from "../github/client.js";
import { resolveRepo } from "../config/env.js";
import { formatGithubError, toolErrorResult } from "../utils/errors.js";
import { logToolCall } from "../server.js";

export function registerCreateIssueTool(server: McpServer): void {
  server.registerTool(
    "create_issue",
    {
      title: "Create Issue",
      description:
        "Creates a new GitHub issue. Returns the new issue number and URL.",
      // `annotations` are optional hints the SDK passes to the client. The
      // `destructiveHint` flag tells UI clients this tool mutates state, so
      // they can surface a confirmation dialog by default.
      annotations: {
        destructiveHint: true,
        idempotentHint: false,
      },
      inputSchema: {
        owner: z.string().optional(),
        repo: z.string().optional(),
        title: z.string().min(1).describe("Issue title."),
        body: z.string().optional().describe("Issue body / description."),
        labels: z
          .array(z.string())
          .optional()
          .describe("Optional list of label names to attach."),
      },
    },
    async ({ owner, repo, title, body, labels }) => {
      try {
        const target = resolveRepo(owner, repo);
        logToolCall("create_issue", { ...target, title });
        const { data } = await getOctokit().rest.issues.create({
          owner: target.owner,
          repo: target.repo,
          title,
          body,
          labels,
        });
        return {
          content: [
            {
              type: "text",
              text: `Created issue #${data.number}: ${data.title}\n${data.html_url}`,
            },
          ],
        };
      } catch (err) {
        return toolErrorResult(formatGithubError(err, "create_issue"));
      }
    },
  );
}
