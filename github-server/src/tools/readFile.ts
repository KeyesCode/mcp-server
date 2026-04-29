// Tool: read_file
//
// Read a single file from a repo, with safety rails:
//   - Skip files with binary extensions (png, zip, woff, ...).
//   - Detect binary content via null-byte sniff.
//   - Truncate text at MAX_FILE_BYTES.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveRepo } from "../config/env.js";
import { formatGithubError, toolErrorResult } from "../utils/errors.js";
import { readRepoFile, MAX_FILE_BYTES } from "../utils/fileSafety.js";
import { logToolCall } from "../server.js";

export function registerReadFileTool(server: McpServer): void {
  server.registerTool(
    "read_file",
    {
      title: "Read File",
      description:
        "Reads a file from a repo. Refuses binaries and truncates large text files. Useful before search_codebase when you already know the path.",
      inputSchema: {
        owner: z.string().optional(),
        repo: z.string().optional(),
        path: z
          .string()
          .min(1)
          .describe("Path inside the repo, e.g. 'src/index.ts'."),
        ref: z
          .string()
          .optional()
          .describe("Branch name or commit SHA (default: default branch)."),
      },
    },
    async ({ owner, repo, path, ref }) => {
      try {
        const target = resolveRepo(owner, repo);
        logToolCall("read_file", { ...target, path, ref: ref ?? "(default)" });
        const file = await readRepoFile({ ...target, path, ref });

        if (file.binary) {
          return {
            content: [
              {
                type: "text",
                text: `[Skipped binary file: ${file.path}${file.size ? ` (${file.size.toLocaleString()}B)` : ""}]`,
              },
            ],
          };
        }

        if (file.truncated && !file.text) {
          // No content + truncated means GitHub's contents API refused (>1 MB).
          return {
            content: [
              {
                type: "text",
                text: `[File too large for the contents API (~${file.size.toLocaleString()}B > 1 MB). Use search_codebase or fetch via the Git blobs API.]`,
              },
            ],
          };
        }

        let text = `# ${file.path} (${file.size.toLocaleString()}B)\n\n${file.text}`;
        if (file.truncated) {
          text += `\n\n--- TRUNCATED at ${MAX_FILE_BYTES.toLocaleString()} bytes ---`;
        }
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return toolErrorResult(formatGithubError(err, "read_file"));
      }
    },
  );
}
