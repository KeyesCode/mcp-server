// Tool: create_branch
//
// Creates a new branch off `base_branch`. Idempotent: if the branch already
// exists, we return the existing ref instead of failing.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOctokit } from "../github/client.js";
import { resolveRepo } from "../config/env.js";
import { formatGithubError, toolErrorResult } from "../utils/errors.js";
import { logToolCall } from "../server.js";

export interface CreateBranchInput {
  owner?: string;
  repo: string;
  branch_name: string;
  base_branch?: string;
}

export interface CreateBranchResult {
  ref: string;
  sha: string;
  alreadyExisted: boolean;
}

interface GithubHttpError {
  status?: number;
}
function isHttpStatus(err: unknown, status: number): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as GithubHttpError).status === status
  );
}

/** Create a branch off base_branch. If the branch already exists, returns
 * its current SHA without erroring. */
export async function doCreateBranch(
  input: CreateBranchInput,
): Promise<CreateBranchResult> {
  const target = resolveRepo(input.owner, input.repo);
  const base = input.base_branch ?? "main";
  const octokit = getOctokit();

  // 1. If the branch already exists, return its ref (idempotent).
  try {
    const existing = await octokit.rest.git.getRef({
      owner: target.owner,
      repo: target.repo,
      ref: `heads/${input.branch_name}`,
    });
    return {
      ref: existing.data.ref,
      sha: existing.data.object.sha,
      alreadyExisted: true,
    };
  } catch (err) {
    if (!isHttpStatus(err, 404)) throw err;
    // 404 = doesn't exist yet, proceed to create.
  }

  // 2. Look up the base branch's SHA.
  const baseRef = await octokit.rest.git.getRef({
    owner: target.owner,
    repo: target.repo,
    ref: `heads/${base}`,
  });

  // 3. Create the new ref.
  const created = await octokit.rest.git.createRef({
    owner: target.owner,
    repo: target.repo,
    ref: `refs/heads/${input.branch_name}`,
    sha: baseRef.data.object.sha,
  });

  return {
    ref: created.data.ref,
    sha: created.data.object.sha,
    alreadyExisted: false,
  };
}

export function registerCreateBranchTool(server: McpServer): void {
  server.registerTool(
    "create_branch",
    {
      title: "Create Branch",
      description:
        "Creates a new branch off `base_branch` (default: main). Idempotent — if the branch already exists, returns its current ref instead of erroring.",
      annotations: {
        destructiveHint: true,
        idempotentHint: true,
      },
      inputSchema: {
        owner: z.string().optional(),
        repo: z.string().min(1),
        branch_name: z
          .string()
          .min(1)
          .describe("Name of the new branch (e.g. 'initial-scaffold')."),
        base_branch: z
          .string()
          .optional()
          .describe("Branch to fork from (default: 'main')."),
      },
    },
    async (input) => {
      try {
        logToolCall("create_branch", input);
        const result = await doCreateBranch(input);
        const verb = result.alreadyExisted ? "already exists" : "created";
        console.error(
          `[write] branch ${verb}: ${input.repo}/${input.branch_name} @ ${result.sha.slice(0, 7)}`,
        );
        return {
          content: [
            {
              type: "text",
              text: `Branch ${verb}: ${result.ref}\nSHA: ${result.sha}`,
            },
          ],
        };
      } catch (err) {
        return toolErrorResult(formatGithubError(err, "create_branch"));
      }
    },
  );
}
