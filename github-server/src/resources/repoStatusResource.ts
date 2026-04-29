// Resource: github://repo/status
//
// Quick at-a-glance metadata for the default repo. We make two API calls in
// parallel: one for the repo metadata, one for the open PR count (which the
// repo payload doesn't include). Issue count is on the repo payload but
// includes PRs, so we annotate that in the formatter.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOctokit } from "../github/client.js";
import { resolveRepo } from "../config/env.js";
import { formatRepoStatus } from "../utils/formatters.js";
import { formatGithubError } from "../utils/errors.js";

export const REPO_STATUS_URI = "github://repo/status";

export function registerRepoStatusResource(server: McpServer): void {
  server.registerResource(
    "repo-status",
    REPO_STATUS_URI,
    {
      title: "Repository Status",
      description:
        "Default repo metadata: default branch, open issue count, open PR count, stars, forks, last push.",
      mimeType: "text/markdown",
    },
    async (uri) => {
      try {
        const target = resolveRepo();
        const octokit = getOctokit();
        const [repoResp, openPrsResp] = await Promise.all([
          octokit.rest.repos.get({ owner: target.owner, repo: target.repo }),
          octokit.rest.pulls.list({
            owner: target.owner,
            repo: target.repo,
            state: "open",
            per_page: 1,
          }),
        ]);

        // GitHub's repo.open_issues_count counts PRs as issues. We use the
        // `link` header on a per_page=1 PR list to get the exact PR count
        // when the repo has more than 1 PR; otherwise the response array
        // length is correct.
        const linkHeader = openPrsResp.headers.link;
        const openPrCount = parseLastPage(linkHeader) ?? openPrsResp.data.length;
        const issuesOnly = (repoResp.data.open_issues_count ?? 0) - openPrCount;

        const text =
          `# Status for ${target.owner}/${target.repo}\n\n` +
          formatRepoStatus(repoResp.data, Math.max(issuesOnly, 0), openPrCount);

        return {
          contents: [
            { uri: uri.href, mimeType: "text/markdown", text },
          ],
        };
      } catch (err) {
        throw new Error(formatGithubError(err, "repo-status resource"));
      }
    },
  );
}

/** Parse the GitHub `Link` pagination header to extract the `rel="last"` page
 * number. Returns undefined if the header is missing or there's no last link
 * (i.e. zero or one page of results). */
function parseLastPage(linkHeader: string | undefined): number | undefined {
  if (!linkHeader) return undefined;
  const match = linkHeader.match(/[?&]page=(\d+)>;\s*rel="last"/);
  return match ? Number(match[1]) : undefined;
}
