// Tool: create_file
//
// Create or update a single file in a repo, scoped to a branch. Uses the
// contents API (`createOrUpdateFileContents`) which is one round-trip per
// file — fine for one-off edits, but `commit_files` is preferred when
// writing more than one file at a time (single atomic commit).

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOctokit } from "../github/client.js";
import { resolveRepo } from "../config/env.js";
import { formatGithubError, toolErrorResult } from "../utils/errors.js";
import { validatePath } from "../utils/pathValidation.js";
import { logToolCall } from "../server.js";

export interface CreateFileInput {
  owner?: string;
  repo: string;
  branch: string;
  path: string;
  content: string;
  /** Optional commit message override. */
  message?: string;
}

export interface CreateFileResult {
  path: string;
  sha: string;
  url: string;
  updated: boolean;
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

/** Create or update a single file. Looks up the existing SHA when updating
 * so the call is idempotent for "make sure this file has this content". */
export async function doCreateFile(
  input: CreateFileInput,
): Promise<CreateFileResult> {
  const validation = validatePath(input.path);
  if (validation) throw new Error(validation);

  const target = resolveRepo(input.owner, input.repo);
  const octokit = getOctokit();

  // Look up existing SHA so we can do an update without losing data.
  let existingSha: string | undefined;
  try {
    const existing = await octokit.rest.repos.getContent({
      owner: target.owner,
      repo: target.repo,
      path: input.path,
      ref: input.branch,
    });
    if (!Array.isArray(existing.data) && "sha" in existing.data) {
      existingSha = existing.data.sha;
    }
  } catch (err) {
    if (!isHttpStatus(err, 404)) throw err;
    // 404 = file doesn't exist, this will be a create.
  }

  const message =
    input.message ??
    `${existingSha ? "Update" : "Create"} ${input.path}`;
  const { data } = await octokit.rest.repos.createOrUpdateFileContents({
    owner: target.owner,
    repo: target.repo,
    branch: input.branch,
    path: input.path,
    message,
    content: Buffer.from(input.content, "utf8").toString("base64"),
    sha: existingSha,
  });

  return {
    path: input.path,
    sha: data.content?.sha ?? "",
    url: data.content?.html_url ?? "",
    updated: !!existingSha,
  };
}

export function registerCreateFileTool(server: McpServer): void {
  server.registerTool(
    "create_file",
    {
      title: "Create or Update File",
      description:
        "Creates or updates a single file in a repo at a specific branch. For multiple files, prefer `commit_files` (one atomic commit instead of N).",
      annotations: {
        destructiveHint: true,
        idempotentHint: true,
      },
      inputSchema: {
        owner: z.string().optional(),
        repo: z.string().min(1),
        branch: z.string().min(1),
        path: z
          .string()
          .min(1)
          .describe("Repo-relative file path, e.g. 'README.md' or 'src/index.ts'."),
        content: z.string().describe("File contents as plain text."),
        message: z
          .string()
          .optional()
          .describe("Commit message (default: 'Create/Update <path>')."),
      },
    },
    async (input) => {
      try {
        logToolCall("create_file", {
          repo: input.repo,
          branch: input.branch,
          path: input.path,
          bytes: input.content.length,
        });
        const result = await doCreateFile(input);
        const verb = result.updated ? "Updated" : "Created";
        console.error(
          `[write] ${verb.toLowerCase()} file: ${input.repo}/${input.branch}:${result.path}`,
        );
        return {
          content: [
            {
              type: "text",
              text: `${verb} ${result.path} (sha ${result.sha.slice(0, 7)}).\n${result.url}`,
            },
          ],
        };
      } catch (err) {
        return toolErrorResult(formatGithubError(err, "create_file"));
      }
    },
  );
}
