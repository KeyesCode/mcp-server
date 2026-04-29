// Tool: get_repo_tree
//
// Returns the recursive directory structure of a repo, filtered to drop
// node_modules, dist, .git, and friends. Capped at MAX_TREE_ENTRIES so a
// big monorepo doesn't blow the LLM's context.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveRepo } from "../config/env.js";
import { formatGithubError, toolErrorResult } from "../utils/errors.js";
import { fetchRepoTree, MAX_TREE_ENTRIES } from "../utils/repoTree.js";
import { logToolCall } from "../server.js";

export function registerGetRepoTreeTool(server: McpServer): void {
  server.registerTool(
    "get_repo_tree",
    {
      title: "Get Repo Tree",
      description:
        "Returns the recursive directory structure of a repository at a given ref (defaults to the default branch). Filters out node_modules, dist, build, .git, .next, etc.",
      inputSchema: {
        owner: z.string().optional(),
        repo: z.string().optional(),
        ref: z
          .string()
          .optional()
          .describe(
            "Branch name or commit SHA. Defaults to the repo's default branch.",
          ),
      },
    },
    async ({ owner, repo, ref }) => {
      try {
        const target = resolveRepo(owner, repo);
        logToolCall("get_repo_tree", { ...target, ref: ref ?? "(default)" });
        const result = await fetchRepoTree({ ...target, ref });

        const lines = result.entries.map((e) => {
          if (e.type === "dir") return `${e.path}/`;
          if (e.type === "submodule") return `${e.path}  (submodule)`;
          const sizeStr =
            e.size != null ? `  (${e.size.toLocaleString()}B)` : "";
          return `${e.path}${sizeStr}`;
        });

        const footer: string[] = [];
        footer.push(
          `\n--- ${result.entries.length} entries shown (ref: ${result.ref})`,
        );
        if (result.excluded > 0) {
          footer.push(
            `--- ${result.excluded} entries filtered out (node_modules, dist, build, etc.)`,
          );
        }
        if (result.truncatedByUs) {
          footer.push(
            `--- Truncated to ${MAX_TREE_ENTRIES} entries; use search_codebase or read_file for specifics.`,
          );
        }
        if (result.truncatedByGithub) {
          footer.push(
            `--- GitHub itself truncated this tree (very large repo).`,
          );
        }

        const text = lines.length
          ? lines.join("\n") + "\n" + footer.join("\n")
          : `No matching entries.\n${footer.join("\n")}`;
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return toolErrorResult(formatGithubError(err, "get_repo_tree"));
      }
    },
  );
}
