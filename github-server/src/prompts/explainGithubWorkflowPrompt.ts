// Prompt: explain_github_mcp_server
//
// Returns a beginner-friendly explanation of how this server is wired and
// how each MCP concept maps to a GitHub operation. Useful for showing how
// prompts can ship "canned" educational content.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const EXPLANATION = `You are talking to a **GitHub Workflow MCP server** written in TypeScript.

It exposes three kinds of MCP capabilities:

## Tools — workflow (PRs, issues, comments)
- \`list_open_prs\` — list open pull requests for the default repo.
- \`get_pr_details\` — fetch metadata (labels, reviewers, file counts, mergeable state) for one PR.
- \`get_pr_diff\` — fetch the unified diff (truncated if huge).
- \`list_issues\` — list issues, with PRs filtered out.
- \`create_issue\` — create a new issue (write side effect).
- \`comment_on_pr\` — post a conversation comment on a PR (write side effect).

## Tools — repository intelligence (read-only)
- \`list_repositories\` — list repos for the authenticated user, or for an org.
- \`get_repo_tree\` — recursive directory listing, filtered to drop node_modules/dist/build/etc.
- \`read_file\` — read a single file with size cap and binary-content filtering.
- \`search_codebase\` — keyword search via GitHub's code search API (default branch only).
- \`detect_framework\` — heuristic check across package.json deps + non-JS manifests.
- \`get_package_json_summary\` — name, version, scripts, deps in a compact form.
- \`detect_common_patterns\` — auth/payments/ORM/testing/etc. detected from deps + paths.

## Resources (read-only views the user can attach)
- \`github://prs/open\` — current open PRs as a Markdown list.
- \`github://repo/status\` — repo metadata (branch, stars, forks, counts).
- \`github://issue/{number}\` — a single issue, addressed by its number.

## Prompts (reusable instruction templates)
- \`draft_pr_review\` (arg: pull_number) — orchestrates \`get_pr_details\` + \`get_pr_diff\` and asks for a structured review.
- \`weekly_pr_digest\` — orchestrates \`list_open_prs\` and asks for a manager-readable digest.
- \`explain_github_mcp_server\` — this prompt.

## How a request flows
1. The MCP client (Claude Desktop / Claude Code / etc.) spawns this server over stdio.
2. The client sends \`initialize\` and asks \`tools/list\`, \`resources/list\`, \`prompts/list\`.
3. When you call a tool like \`list_open_prs\`, the SDK validates your arguments against the JSON Schema (built from our zod shapes), then calls our handler.
4. Our handler uses **Octokit** to talk to the GitHub REST API with the \`GITHUB_TOKEN\` from \`.env\`.
5. We return a list of "content blocks" (text in our case) which the client/LLM reads.

## Where to dig next
- The source: each tool/resource/prompt lives in its own file under \`src/\`. The wiring is in \`src/server.ts\`.
- The README walks through how to set up the token and connect the server to Claude Desktop.
- \`docs/learning-notes.md\` explains the MCP lifecycle in more detail.`;

export function registerExplainGithubWorkflowPrompt(server: McpServer): void {
  server.registerPrompt(
    "explain_github_mcp_server",
    {
      title: "Explain This GitHub MCP Server",
      description:
        "A beginner-friendly tour of every tool, resource, and prompt this server offers.",
    },
    () => ({
      messages: [
        { role: "user", content: { type: "text", text: EXPLANATION } },
      ],
    }),
  );
}
