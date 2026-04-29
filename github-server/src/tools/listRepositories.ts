// Tool: list_repositories
//
// Lists repos owned by the authenticated user, or by a specified org. Sorted
// by most-recently-pushed so the active projects show up first.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOctokit } from "../github/client.js";
import { formatGithubError, toolErrorResult } from "../utils/errors.js";
import { logToolCall } from "../server.js";

export function registerListRepositoriesTool(server: McpServer): void {
  server.registerTool(
    "list_repositories",
    {
      title: "List Repositories",
      description:
        "Lists GitHub repositories. Defaults to repos owned by the authenticated user; pass `org` to list an organisation's repos instead.",
      inputSchema: {
        org: z
          .string()
          .optional()
          .describe(
            "Organisation slug. If provided, list that org's repos instead of the user's.",
          ),
        visibility: z
          .enum(["all", "public", "private"])
          .optional()
          .describe("Filter by visibility (default: all)."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Max repos to return (default 30, max 100)."),
      },
    },
    async ({ org, visibility, limit }) => {
      try {
        const max = limit ?? 30;
        logToolCall("list_repositories", { org, visibility, limit: max });

        const octokit = getOctokit();
        // The two endpoints have slightly different params:
        // - listForAuthenticatedUser supports `visibility: 'all' | 'public' | 'private'`.
        // - listForOrg supports `type: 'all' | 'public' | 'private' | ...`.
        const data = org
          ? (
              await octokit.rest.repos.listForOrg({
                org,
                per_page: max,
                sort: "pushed",
                direction: "desc",
                type:
                  visibility === "public"
                    ? "public"
                    : visibility === "private"
                      ? "private"
                      : "all",
              })
            ).data
          : (
              await octokit.rest.repos.listForAuthenticatedUser({
                per_page: max,
                sort: "pushed",
                direction: "desc",
                visibility: visibility ?? "all",
              })
            ).data;

        if (data.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: org
                  ? `No repos found for org ${org}.`
                  : "No repos found for the authenticated user.",
              },
            ],
          };
        }

        const lines = data.map((r) => {
          const tags: string[] = [];
          if (r.private) tags.push("private");
          if (r.fork) tags.push("fork");
          if (r.archived) tags.push("archived");
          const tagStr = tags.length ? ` [${tags.join(", ")}]` : "";
          return [
            `${r.full_name}${tagStr}`,
            `  ${r.description ?? "(no description)"}`,
            `  lang: ${r.language ?? "?"}, last push: ${r.pushed_at ?? "unknown"}`,
            `  ${r.html_url}`,
          ].join("\n");
        });
        return { content: [{ type: "text", text: lines.join("\n\n") }] };
      } catch (err) {
        return toolErrorResult(formatGithubError(err, "list_repositories"));
      }
    },
  );
}
