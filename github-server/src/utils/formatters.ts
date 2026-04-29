// Render GitHub API payloads into compact, human-readable text.
//
// Tool results are eventually consumed by an LLM, so we prefer terse Markdown-
// ish text over raw JSON: easier to read, smaller token cost, and the LLM
// doesn't waste a turn parsing structure it doesn't need.

import type {
  PullRequestSummary,
  PullRequestDetail,
  IssueSummary,
  Repository,
} from "../github/github.types.js";

/** Hard cap on diff bytes returned to the client. PR diffs can run into the
 * megabytes; that would blow Claude's context. We truncate with an obvious
 * marker so the model knows it didn't see everything. */
export const MAX_DIFF_BYTES = 60_000;

export function formatPrSummary(pr: PullRequestSummary): string {
  const draft = pr.draft ? " [draft]" : "";
  const author = pr.user?.login ? `@${pr.user.login}` : "unknown";
  return [
    `#${pr.number}${draft} ${pr.title} — ${author}`,
    `  ${pr.head.ref} → ${pr.base.ref}`,
    `  created ${pr.created_at}, updated ${pr.updated_at}`,
    `  ${pr.html_url}`,
  ].join("\n");
}

export function formatPrDetail(pr: PullRequestDetail): string {
  const labels = pr.labels.map((l) => l.name).join(", ") || "none";
  const reviewers =
    pr.requested_reviewers?.map((r) => `@${r.login}`).join(", ") || "none";
  return [
    `#${pr.number} ${pr.title}`,
    `Author: ${pr.user?.login ? "@" + pr.user.login : "unknown"}`,
    `State: ${pr.state}${pr.draft ? " (draft)" : ""}`,
    `Mergeable: ${pr.mergeable_state ?? "unknown"} (mergeable=${pr.mergeable ?? "unknown"})`,
    `Branch: ${pr.head.ref} → ${pr.base.ref}`,
    `Labels: ${labels}`,
    `Requested reviewers: ${reviewers}`,
    `Files: ${pr.changed_files} changed, +${pr.additions} / -${pr.deletions}`,
    `Commits: ${pr.commits}`,
    `URL: ${pr.html_url}`,
    "",
    "--- Description ---",
    pr.body || "(no description)",
  ].join("\n");
}

export function formatIssueSummary(issue: IssueSummary): string {
  const labels =
    issue.labels
      .map((l) => (typeof l === "string" ? l : l.name))
      .filter((n): n is string => Boolean(n))
      .join(", ") || "none";
  const author = issue.user?.login ? `@${issue.user.login}` : "unknown";
  return [
    `#${issue.number} [${issue.state}] ${issue.title} — ${author}`,
    `  labels: ${labels}`,
    `  ${issue.html_url}`,
  ].join("\n");
}

export function formatRepoStatus(
  repo: Repository,
  openIssuesCount: number,
  openPrCount: number,
): string {
  return [
    `Repo: ${repo.full_name}`,
    `Description: ${repo.description ?? "(none)"}`,
    `Default branch: ${repo.default_branch}`,
    `Open issues: ${openIssuesCount}`,
    `Open PRs: ${openPrCount}`,
    `Stars: ${repo.stargazers_count}`,
    `Forks: ${repo.forks_count}`,
    `Last pushed: ${repo.pushed_at ?? "unknown"}`,
    `URL: ${repo.html_url}`,
  ].join("\n");
}

/** Cap a diff at MAX_DIFF_BYTES, with a clear truncation footer. */
export function truncateDiff(diff: string): {
  text: string;
  truncated: boolean;
  originalBytes: number;
} {
  const originalBytes = Buffer.byteLength(diff, "utf8");
  if (originalBytes <= MAX_DIFF_BYTES) {
    return { text: diff, truncated: false, originalBytes };
  }
  const head = Buffer.from(diff, "utf8")
    .subarray(0, MAX_DIFF_BYTES)
    .toString("utf8");
  const footer =
    `\n\n--- DIFF TRUNCATED ---\n` +
    `Showed first ${MAX_DIFF_BYTES.toLocaleString()} bytes of ${originalBytes.toLocaleString()}.\n` +
    `For the full diff, view the PR on GitHub or fetch fewer files.`;
  return { text: head + footer, truncated: true, originalBytes };
}
