// Tool: open_pull_request
//
// Opens a PR. Idempotent: if a PR already exists from `head_branch` into
// `base_branch`, returns the existing one instead of erroring.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOctokit } from "../github/client.js";
import { resolveRepo } from "../config/env.js";
import { formatGithubError, toolErrorResult } from "../utils/errors.js";
import { logToolCall } from "../server.js";

export interface OpenPullRequestInput {
  owner?: string;
  repo: string;
  title: string;
  body?: string;
  head_branch: string;
  base_branch: string;
}

export interface OpenPullRequestResult {
  number: number;
  url: string;
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

export async function doOpenPullRequest(
  input: OpenPullRequestInput,
): Promise<OpenPullRequestResult> {
  if (input.head_branch === input.base_branch) {
    throw new Error(
      `head_branch and base_branch must differ; both were "${input.head_branch}".`,
    );
  }

  const target = resolveRepo(input.owner, input.repo);
  const octokit = getOctokit();

  try {
    const { data } = await octokit.rest.pulls.create({
      owner: target.owner,
      repo: target.repo,
      title: input.title,
      body: input.body,
      head: input.head_branch,
      base: input.base_branch,
    });
    return {
      number: data.number,
      url: data.html_url,
      alreadyExisted: false,
    };
  } catch (err) {
    // 422 with "A pull request already exists" → look it up and return.
    if (isHttpStatus(err, 422)) {
      const list = await octokit.rest.pulls.list({
        owner: target.owner,
        repo: target.repo,
        head: `${target.owner}:${input.head_branch}`,
        base: input.base_branch,
        state: "open",
        per_page: 1,
      });
      if (list.data.length > 0) {
        const pr = list.data[0];
        return { number: pr.number, url: pr.html_url, alreadyExisted: true };
      }
    }
    throw err;
  }
}

export function registerOpenPullRequestTool(server: McpServer): void {
  server.registerTool(
    "open_pull_request",
    {
      title: "Open Pull Request",
      description:
        "Opens a PR from `head_branch` into `base_branch`. Idempotent — if a matching PR already exists, returns its URL instead of erroring.",
      annotations: {
        destructiveHint: true,
        idempotentHint: true,
      },
      inputSchema: {
        owner: z.string().optional(),
        repo: z.string().min(1),
        title: z.string().min(1),
        body: z.string().optional(),
        head_branch: z.string().min(1),
        base_branch: z.string().min(1),
      },
    },
    async (input) => {
      try {
        logToolCall("open_pull_request", {
          repo: input.repo,
          head: input.head_branch,
          base: input.base_branch,
        });
        const result = await doOpenPullRequest(input);
        const verb = result.alreadyExisted
          ? "PR already exists"
          : "Opened PR";
        console.error(
          `[write] ${verb}: #${result.number} ${input.repo} ${input.head_branch}→${input.base_branch}`,
        );
        return {
          content: [
            {
              type: "text",
              text: `${verb} #${result.number}\n${result.url}`,
            },
          ],
        };
      } catch (err) {
        return toolErrorResult(formatGithubError(err, "open_pull_request"));
      }
    },
  );
}
