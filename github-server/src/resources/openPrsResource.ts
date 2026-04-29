// Resource: github://prs/open
//
// A read-only view of open PRs in the default repo. Resources show up in
// MCP clients as "things you can attach to a conversation" — handy when you
// want to feed the LLM a fresh PR list without telling it to call a tool.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOctokit } from "../github/client.js";
import { resolveRepo } from "../config/env.js";
import { formatPrSummary } from "../utils/formatters.js";
import { formatGithubError } from "../utils/errors.js";

export const OPEN_PRS_URI = "github://prs/open";

export function registerOpenPrsResource(server: McpServer): void {
  server.registerResource(
    "open-prs",
    OPEN_PRS_URI,
    {
      title: "Open Pull Requests",
      description:
        "Open pull requests for the default repo (DEFAULT_GITHUB_OWNER / DEFAULT_GITHUB_REPO).",
      mimeType: "text/markdown",
    },
    async (uri) => {
      try {
        const target = resolveRepo();
        const { data } = await getOctokit().rest.pulls.list({
          owner: target.owner,
          repo: target.repo,
          state: "open",
          per_page: 50,
          sort: "updated",
          direction: "desc",
        });
        const text = data.length
          ? `# Open PRs in ${target.owner}/${target.repo}\n\n` +
            data.map(formatPrSummary).join("\n\n")
          : `No open PRs in ${target.owner}/${target.repo}.`;
        return {
          contents: [
            { uri: uri.href, mimeType: "text/markdown", text },
          ],
        };
      } catch (err) {
        // Resource handlers can throw — the SDK turns it into a JSON-RPC
        // error response. We use formatGithubError to keep the message
        // useful to the client.
        throw new Error(formatGithubError(err, "open-prs resource"));
      }
    },
  );
}
