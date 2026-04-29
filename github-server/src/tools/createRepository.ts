// Tool: create_repository
//
// Creates a new repo under the authenticated user. We pass `auto_init: true`
// so GitHub bootstraps a `main` branch with a default README — the rest of
// the generator pipeline expects a base branch to exist.
//
// We export `doCreateRepository` so the orchestrator can call this from
// inside `generate_client_repo` without re-implementing the Octokit call.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOctokit } from "../github/client.js";
import { formatGithubError, toolErrorResult } from "../utils/errors.js";
import { logToolCall } from "../server.js";

export interface CreateRepositoryInput {
  name: string;
  description?: string;
  private?: boolean;
}

export interface CreateRepositoryResult {
  owner: string;
  name: string;
  fullName: string;
  url: string;
  defaultBranch: string;
}

/** Create a new repo under the authenticated user. Initialised with a
 * default README so subsequent branch/commit operations have a base. */
export async function doCreateRepository(
  input: CreateRepositoryInput,
): Promise<CreateRepositoryResult> {
  const { data } = await getOctokit().rest.repos.createForAuthenticatedUser({
    name: input.name,
    description: input.description,
    private: input.private ?? true,
    auto_init: true,
  });
  return {
    owner: data.owner.login,
    name: data.name,
    fullName: data.full_name,
    url: data.html_url,
    defaultBranch: data.default_branch,
  };
}

export function registerCreateRepositoryTool(server: McpServer): void {
  server.registerTool(
    "create_repository",
    {
      title: "Create Repository",
      description:
        "Creates a new GitHub repository under the authenticated user. Auto-initialised with a default branch so it's ready for branch/commit operations.",
      annotations: {
        destructiveHint: true,
        idempotentHint: false,
      },
      inputSchema: {
        name: z
          .string()
          .min(1)
          .describe("Repository name (e.g. 'acme-website')."),
        description: z.string().optional(),
        private: z
          .boolean()
          .optional()
          .describe("Create the repo private (default: true)."),
      },
    },
    async (input) => {
      try {
        logToolCall("create_repository", {
          name: input.name,
          private: input.private ?? true,
        });
        const result = await doCreateRepository(input);
        console.error(
          `[write] repo created: ${result.fullName} (default branch: ${result.defaultBranch})`,
        );
        return {
          content: [
            {
              type: "text",
              text: `Created ${result.fullName} (private=${input.private ?? true})\nDefault branch: ${result.defaultBranch}\n${result.url}`,
            },
          ],
        };
      } catch (err) {
        return toolErrorResult(formatGithubError(err, "create_repository"));
      }
    },
  );
}
