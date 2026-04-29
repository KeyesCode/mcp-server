// Builds the McpServer instance and wires up every tool, resource, and prompt.
//
// Reminder: under the stdio transport, **stdout is reserved for JSON-RPC**.
// Every log line in this codebase goes to stderr.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Tools — workflow (PRs, issues, comments)
import { registerListOpenPrsTool } from "./tools/listOpenPrs.js";
import { registerGetPrDetailsTool } from "./tools/getPrDetails.js";
import { registerGetPrDiffTool } from "./tools/getPrDiff.js";
import { registerListIssuesTool } from "./tools/listIssues.js";
import { registerCreateIssueTool } from "./tools/createIssue.js";
import { registerCommentOnPrTool } from "./tools/commentOnPr.js";

// Tools — repository intelligence (discovery, inspection, pattern detection)
import { registerListRepositoriesTool } from "./tools/listRepositories.js";
import { registerGetRepoTreeTool } from "./tools/getRepoTree.js";
import { registerReadFileTool } from "./tools/readFile.js";
import { registerSearchCodebaseTool } from "./tools/searchCodebase.js";
import { registerDetectFrameworkTool } from "./tools/detectFramework.js";
import { registerGetPackageJsonSummaryTool } from "./tools/getPackageJsonSummary.js";
import { registerDetectCommonPatternsTool } from "./tools/detectCommonPatterns.js";

// Tools — repository generator (write side; PR-only flow)
import { registerCreateRepositoryTool } from "./tools/createRepository.js";
import { registerCreateBranchTool } from "./tools/createBranch.js";
import { registerCreateFileTool } from "./tools/createFile.js";
import { registerCommitFilesTool } from "./tools/commitFiles.js";
import { registerOpenPullRequestTool } from "./tools/openPullRequest.js";
import { registerGenerateClientRepoTool } from "./tools/generateClientRepo.js";

// Resources
import {
  registerOpenPrsResource,
  OPEN_PRS_URI,
} from "./resources/openPrsResource.js";
import {
  registerRepoStatusResource,
  REPO_STATUS_URI,
} from "./resources/repoStatusResource.js";
import {
  registerIssueResource,
  ISSUE_RESOURCE_URI_TEMPLATE,
} from "./resources/issueResource.js";

// Prompts
import { registerDraftPrReviewPrompt } from "./prompts/draftPrReviewPrompt.js";
import { registerWeeklyPrDigestPrompt } from "./prompts/weeklyPrDigestPrompt.js";
import { registerExplainGithubWorkflowPrompt } from "./prompts/explainGithubWorkflowPrompt.js";

export const SERVER_INFO = {
  name: "mcp-github-workflow-server",
  version: "0.1.0",
} as const;

const registered = {
  tools: [] as string[],
  resources: [] as string[],
  prompts: [] as string[],
};

let startTime = Date.now();

export function getStartTime(): number {
  return startTime;
}

export function getRegisteredNames(): typeof registered {
  return registered;
}

/** Stderr logger used by tool handlers. */
export function logToolCall(name: string, args: unknown): void {
  console.error(`[tool] ${name} ${JSON.stringify(args)}`);
}

/** Build a fully-configured MCP server. Call `.connect(transport)` to start. */
export function buildServer(): McpServer {
  startTime = Date.now();
  const server = new McpServer(SERVER_INFO);

  // Workflow tools (PRs, issues, comments).
  registerListOpenPrsTool(server);
  registerGetPrDetailsTool(server);
  registerGetPrDiffTool(server);
  registerListIssuesTool(server);
  registerCreateIssueTool(server);
  registerCommentOnPrTool(server);

  // Repository intelligence tools (discovery, inspection, pattern detection).
  registerListRepositoriesTool(server);
  registerGetRepoTreeTool(server);
  registerReadFileTool(server);
  registerSearchCodebaseTool(server);
  registerDetectFrameworkTool(server);
  registerGetPackageJsonSummaryTool(server);
  registerDetectCommonPatternsTool(server);

  // Generator tools (write side — all marked destructiveHint, never push to main).
  registerCreateRepositoryTool(server);
  registerCreateBranchTool(server);
  registerCreateFileTool(server);
  registerCommitFilesTool(server);
  registerOpenPullRequestTool(server);
  registerGenerateClientRepoTool(server);

  registered.tools.push(
    "list_open_prs",
    "get_pr_details",
    "get_pr_diff",
    "list_issues",
    "create_issue",
    "comment_on_pr",
    "list_repositories",
    "get_repo_tree",
    "read_file",
    "search_codebase",
    "detect_framework",
    "get_package_json_summary",
    "detect_common_patterns",
    "create_repository",
    "create_branch",
    "create_file",
    "commit_files",
    "open_pull_request",
    "generate_client_repo",
  );

  // Resources.
  registerOpenPrsResource(server);
  registerRepoStatusResource(server);
  registerIssueResource(server);
  registered.resources.push(
    OPEN_PRS_URI,
    REPO_STATUS_URI,
    ISSUE_RESOURCE_URI_TEMPLATE,
  );

  // Prompts.
  registerDraftPrReviewPrompt(server);
  registerWeeklyPrDigestPrompt(server);
  registerExplainGithubWorkflowPrompt(server);
  registered.prompts.push(
    "draft_pr_review",
    "weekly_pr_digest",
    "explain_github_mcp_server",
  );

  return server;
}
