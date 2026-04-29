// Resource: github://issue/{number}
//
// This one uses a *URI template* — the `{number}` placeholder is filled in
// by the client at read time. Templates let you expose an unbounded set of
// resources without registering each one individually.

import {
  ResourceTemplate,
  type McpServer,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOctokit } from "../github/client.js";
import { resolveRepo } from "../config/env.js";
import { formatGithubError } from "../utils/errors.js";

export const ISSUE_RESOURCE_URI_TEMPLATE = "github://issue/{number}";

export function registerIssueResource(server: McpServer): void {
  const template = new ResourceTemplate(ISSUE_RESOURCE_URI_TEMPLATE, {
    // We don't expose a `list` callback because there can be thousands of
    // issues and we don't want to enumerate them in the resource listing.
    // Clients can still read individual issues by URI.
    list: undefined,
  });

  server.registerResource(
    "issue",
    template,
    {
      title: "GitHub Issue",
      description:
        "Read a single issue from the default repo by its number. Example URI: github://issue/42",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      try {
        const raw = Array.isArray(variables.number)
          ? variables.number[0]
          : variables.number;
        const num = Number(raw);
        if (!Number.isInteger(num) || num <= 0) {
          throw new Error(
            `Invalid issue number "${String(raw)}". Use a positive integer (e.g. github://issue/42).`,
          );
        }
        const target = resolveRepo();
        const { data } = await getOctokit().rest.issues.get({
          owner: target.owner,
          repo: target.repo,
          issue_number: num,
        });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(data, null, 2),
            },
          ],
        };
      } catch (err) {
        throw new Error(formatGithubError(err, "issue resource"));
      }
    },
  );
}
