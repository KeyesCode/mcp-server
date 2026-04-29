// Tool: get_package_json_summary
//
// Reads package.json and returns a compact summary: name, version, scripts,
// and the dependency lists. We cap the dep listings so a 200-dep monorepo
// doesn't bury the answer.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveRepo } from "../config/env.js";
import { formatGithubError, toolErrorResult } from "../utils/errors.js";
import { readRepoFile } from "../utils/fileSafety.js";
import { logToolCall } from "../server.js";

interface MinimalPackageJson {
  name?: string;
  version?: string;
  description?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  workspaces?: string[] | { packages?: string[] };
  type?: string;
  engines?: Record<string, string>;
}

const MAX_DEPS_LISTED = 30;
const MAX_DEV_DEPS_LISTED = 20;

export function registerGetPackageJsonSummaryTool(server: McpServer): void {
  server.registerTool(
    "get_package_json_summary",
    {
      title: "Get package.json Summary",
      description:
        "Reads the repo's package.json and returns a compact summary: name, version, scripts, and dependencies (capped to keep responses readable).",
      inputSchema: {
        owner: z.string().optional(),
        repo: z.string().optional(),
        path: z
          .string()
          .optional()
          .describe(
            "Path to the package.json (default: 'package.json'). Useful for monorepos: 'packages/api/package.json'.",
          ),
      },
    },
    async ({ owner, repo, path }) => {
      try {
        const target = resolveRepo(owner, repo);
        const filePath = path ?? "package.json";
        logToolCall("get_package_json_summary", { ...target, path: filePath });

        const file = await readRepoFile({ ...target, path: filePath });
        if (file.binary || !file.text) {
          return toolErrorResult(
            `${filePath} is missing or unreadable in ${target.owner}/${target.repo}.`,
          );
        }

        let pkg: MinimalPackageJson;
        try {
          pkg = JSON.parse(file.text) as MinimalPackageJson;
        } catch (err) {
          return toolErrorResult(
            `Could not parse ${filePath} as JSON: ${err instanceof Error ? err.message : String(err)}`,
          );
        }

        const text = renderSummary(pkg, filePath);
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return toolErrorResult(
          formatGithubError(err, "get_package_json_summary"),
        );
      }
    },
  );
}

function renderSummary(pkg: MinimalPackageJson, filePath: string): string {
  const scripts = Object.keys(pkg.scripts ?? {});
  const deps = Object.entries(pkg.dependencies ?? {});
  const devDeps = Object.entries(pkg.devDependencies ?? {});
  const peerDeps = Object.entries(pkg.peerDependencies ?? {});

  const workspaces = Array.isArray(pkg.workspaces)
    ? pkg.workspaces
    : pkg.workspaces?.packages ?? [];

  const lines: string[] = [
    `# ${filePath}`,
    "",
    `Name: ${pkg.name ?? "(unset)"}`,
    `Version: ${pkg.version ?? "(unset)"}`,
    `Module type: ${pkg.type ?? "(commonjs)"}`,
    `Description: ${pkg.description ?? "(none)"}`,
  ];
  if (pkg.engines && Object.keys(pkg.engines).length) {
    lines.push(
      `Engines: ${Object.entries(pkg.engines).map(([k, v]) => `${k}@${v}`).join(", ")}`,
    );
  }
  if (workspaces.length) {
    lines.push(`Workspaces: ${workspaces.join(", ")}`);
  }
  lines.push("");
  lines.push(
    `Scripts (${scripts.length}): ${scripts.length ? scripts.join(", ") : "(none)"}`,
  );
  lines.push("");

  lines.push(`Runtime dependencies (${deps.length}):`);
  if (deps.length === 0) {
    lines.push("  (none)");
  } else {
    for (const [name, version] of deps.slice(0, MAX_DEPS_LISTED)) {
      lines.push(`  - ${name}@${version}`);
    }
    if (deps.length > MAX_DEPS_LISTED) {
      lines.push(`  ... ${deps.length - MAX_DEPS_LISTED} more`);
    }
  }

  if (devDeps.length) {
    lines.push("");
    lines.push(`Dev dependencies (${devDeps.length}):`);
    for (const [name, version] of devDeps.slice(0, MAX_DEV_DEPS_LISTED)) {
      lines.push(`  - ${name}@${version}`);
    }
    if (devDeps.length > MAX_DEV_DEPS_LISTED) {
      lines.push(`  ... ${devDeps.length - MAX_DEV_DEPS_LISTED} more`);
    }
  }

  if (peerDeps.length) {
    lines.push("");
    lines.push(`Peer dependencies (${peerDeps.length}):`);
    for (const [name, version] of peerDeps) {
      lines.push(`  - ${name}@${version}`);
    }
  }

  return lines.join("\n");
}
