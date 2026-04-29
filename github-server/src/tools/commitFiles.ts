// Tool: commit_files
//
// Creates a single atomic commit containing many files, using GitHub's
// Git Data API:
//
//   1. getRef(branch)        → current branch commit SHA
//   2. getCommit(commitSha)  → that commit's tree SHA
//   3. createBlob × N        → upload each file's contents
//   4. createTree            → assemble new tree from base + blobs
//   5. createCommit          → create the commit object
//   6. updateRef(branch)     → fast-forward the branch
//
// This is the right way to push >1 file. Calling create_file in a loop
// would create N commits and N round-trips per commit.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOctokit } from "../github/client.js";
import { resolveRepo } from "../config/env.js";
import { formatGithubError, toolErrorResult } from "../utils/errors.js";
import {
  validatePath,
  findDuplicatePaths,
} from "../utils/pathValidation.js";
import { logToolCall } from "../server.js";

export interface CommitFilesInput {
  owner?: string;
  repo: string;
  branch: string;
  files: Array<{ path: string; content: string }>;
  commit_message: string;
}

export interface CommitFilesResult {
  commitSha: string;
  treeSha: string;
  commitUrl: string;
  fileCount: number;
}

export async function doCommitFiles(
  input: CommitFilesInput,
): Promise<CommitFilesResult> {
  // --- Input validation ---------------------------------------------------
  if (input.files.length === 0) {
    throw new Error("commit_files: `files` must contain at least one entry.");
  }
  for (const f of input.files) {
    const v = validatePath(f.path);
    if (v) throw new Error(`commit_files: ${v}`);
  }
  const dups = findDuplicatePaths(input.files.map((f) => f.path));
  if (dups.length > 0) {
    throw new Error(
      `commit_files: duplicate paths in input: ${dups.join(", ")}`,
    );
  }
  if (!input.commit_message.trim()) {
    throw new Error("commit_files: `commit_message` must not be empty.");
  }

  const target = resolveRepo(input.owner, input.repo);
  const octokit = getOctokit();

  // --- 1. Resolve the branch's current commit + tree ----------------------
  const branchRef = await octokit.rest.git.getRef({
    owner: target.owner,
    repo: target.repo,
    ref: `heads/${input.branch}`,
  });
  const parentCommitSha = branchRef.data.object.sha;
  const parentCommit = await octokit.rest.git.getCommit({
    owner: target.owner,
    repo: target.repo,
    commit_sha: parentCommitSha,
  });
  const baseTreeSha = parentCommit.data.tree.sha;

  // --- 2. Upload blobs for every file in parallel -------------------------
  const blobShas = await Promise.all(
    input.files.map(async (f) => {
      const { data } = await octokit.rest.git.createBlob({
        owner: target.owner,
        repo: target.repo,
        content: Buffer.from(f.content, "utf8").toString("base64"),
        encoding: "base64",
      });
      return { path: f.path, sha: data.sha };
    }),
  );

  // --- 3. Build a new tree on top of the base ----------------------------
  const newTree = await octokit.rest.git.createTree({
    owner: target.owner,
    repo: target.repo,
    base_tree: baseTreeSha,
    tree: blobShas.map((b) => ({
      path: b.path,
      mode: "100644", // regular non-executable file
      type: "blob",
      sha: b.sha,
    })),
  });

  // --- 4. Wrap the tree in a commit --------------------------------------
  const newCommit = await octokit.rest.git.createCommit({
    owner: target.owner,
    repo: target.repo,
    message: input.commit_message,
    tree: newTree.data.sha,
    parents: [parentCommitSha],
  });

  // --- 5. Fast-forward the branch ----------------------------------------
  await octokit.rest.git.updateRef({
    owner: target.owner,
    repo: target.repo,
    ref: `heads/${input.branch}`,
    sha: newCommit.data.sha,
    force: false,
  });

  return {
    commitSha: newCommit.data.sha,
    treeSha: newTree.data.sha,
    commitUrl: newCommit.data.html_url,
    fileCount: input.files.length,
  };
}

export function registerCommitFilesTool(server: McpServer): void {
  server.registerTool(
    "commit_files",
    {
      title: "Commit Files (Batch)",
      description:
        "Creates a single atomic commit on a branch containing many files. Preferred over multiple `create_file` calls.",
      annotations: {
        destructiveHint: true,
        idempotentHint: false,
      },
      inputSchema: {
        owner: z.string().optional(),
        repo: z.string().min(1),
        branch: z.string().min(1),
        commit_message: z
          .string()
          .min(1)
          .describe("Commit message used for the new commit."),
        files: z
          .array(
            z.object({
              path: z
                .string()
                .min(1)
                .describe(
                  "Repo-relative file path. No '..', no leading '/', no '.git/'.",
                ),
              content: z.string(),
            }),
          )
          .min(1)
          .describe("Array of files to write in this commit."),
      },
    },
    async (input) => {
      try {
        logToolCall("commit_files", {
          repo: input.repo,
          branch: input.branch,
          fileCount: input.files.length,
        });
        const result = await doCommitFiles(input);
        console.error(
          `[write] committed ${result.fileCount} file(s) to ${input.repo}/${input.branch} @ ${result.commitSha.slice(0, 7)}`,
        );
        return {
          content: [
            {
              type: "text",
              text: `Committed ${result.fileCount} file(s) to ${input.branch}.\nCommit: ${result.commitSha}\n${result.commitUrl}`,
            },
          ],
        };
      } catch (err) {
        return toolErrorResult(formatGithubError(err, "commit_files"));
      }
    },
  );
}
