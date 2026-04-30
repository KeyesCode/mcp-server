// Tool: generate_client_repo
//
// The high-level "Repository Generator". Composes the lower-level write
// tools and the generator templates to produce a fresh client-ready repo
// with a reviewable PR — never a direct push to main.
//
// Phase 4 changes:
//   - Builds a StyleProfile from `style_reference_repos` and feeds it into
//     the generators, so the output adapts (folder layout, naming, imports).
//   - Adds `dry_run`: extracts the style profile (read-only) and renders
//     all files in memory, but skips every write API call. Useful for
//     reviewing what would be created before committing to it.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { formatGithubError, toolErrorResult } from "../utils/errors.js";
import {
  generateProjectStructure,
  type GeneratedFile,
} from "../generator/generateProjectStructure.js";
import {
  extractStyleProfile,
  type StyleProfile,
} from "../generator/styleProfile.js";
import { doCreateRepository } from "./createRepository.js";
import { doCreateBranch } from "./createBranch.js";
import { doCommitFiles } from "./commitFiles.js";
import { doOpenPullRequest } from "./openPullRequest.js";
import { logToolCall } from "../server.js";

const SCAFFOLD_BRANCH = "initial-scaffold";

export function registerGenerateClientRepoTool(server: McpServer): void {
  server.registerTool(
    "generate_client_repo",
    {
      title: "Generate Client Repo",
      description:
        "Creates a new GitHub repo, generates a Next.js (+ optional NestJS, + optional Stripe) scaffold, commits it to a fresh branch, and opens a PR. Never pushes directly to main. Pass `dry_run: true` to preview the output without making any GitHub writes.",
      annotations: {
        destructiveHint: true,
        idempotentHint: false,
      },
      inputSchema: {
        project_name: z
          .string()
          .min(1)
          .describe("Repository name. Used as the repo slug and the README title."),
        description: z
          .string()
          .optional()
          .describe("Short description used in the repo, README, and metadata."),
        include_backend: z
          .boolean()
          .optional()
          .describe("Scaffold a NestJS backend in /backend (default: true)."),
        include_stripe: z
          .boolean()
          .optional()
          .describe("Add a placeholder Stripe integration (default: true)."),
        style_reference_repos: z
          .array(z.string())
          .optional()
          .describe(
            "Optional list of 'owner/repo' strings. We extract a style profile (folder layout, naming, import style) and feed it into the generators so the output looks like your existing code.",
          ),
        private: z
          .boolean()
          .optional()
          .describe("Create the new repo private (default: true)."),
        dry_run: z
          .boolean()
          .optional()
          .describe(
            "If true, return the file plan + style profile without making any GitHub writes. Style references are still read (read-only).",
          ),
      },
    },
    async (input) => {
      try {
        const includeBackend = input.include_backend ?? true;
        const includeStripe = input.include_stripe ?? true;
        const isPrivate = input.private ?? true;
        const dryRun = input.dry_run ?? false;

        logToolCall("generate_client_repo", {
          project_name: input.project_name,
          include_backend: includeBackend,
          include_stripe: includeStripe,
          style_refs: input.style_reference_repos?.length ?? 0,
          dry_run: dryRun,
        });

        // ----- Step 1: extract style profile from reference repos --------
        const profile: StyleProfile = await extractStyleProfile(
          input.style_reference_repos ?? [],
        );
        console.error(
          `[generator] style profile: naming=${profile.conventions.fileNaming}, ` +
            `imports=${profile.conventions.imports}, exports=${profile.conventions.componentStyle}, ` +
            `src=${profile.structure.useSrcDir}, hooks=${profile.structure.hasHooksDir}, ` +
            `services=${profile.structure.hasServicesDir}, ui=${profile.structure.hasUiSubdir}`,
        );

        // ----- Step 2: generate file content -----------------------------
        const files: GeneratedFile[] = generateProjectStructure({
          projectName: input.project_name,
          description: input.description,
          includeBackend,
          includeStripe,
          profile,
        });
        console.error(
          `[generator] produced ${files.length} files for ${input.project_name}`,
        );

        // ----- Dry-run short-circuit --------------------------------------
        if (dryRun) {
          console.error(`[generator] DRY RUN — no GitHub writes performed`);
          return {
            content: [
              {
                type: "text",
                text: renderDryRunReport({
                  projectName: input.project_name,
                  description: input.description,
                  includeBackend,
                  includeStripe,
                  files,
                  profile,
                  styleRefs: input.style_reference_repos,
                }),
              },
            ],
          };
        }

        // ----- Step 3: create repo (auto-initialised with main) ----------
        const repo = await doCreateRepository({
          name: input.project_name,
          description: input.description,
          private: isPrivate,
        });
        console.error(`[generator] repo created: ${repo.url}`);

        // ----- Step 4: create scaffold branch ----------------------------
        const branch = await doCreateBranch({
          owner: repo.owner,
          repo: repo.name,
          branch_name: SCAFFOLD_BRANCH,
          base_branch: repo.defaultBranch,
        });
        console.error(
          `[generator] branch ${branch.alreadyExisted ? "reused" : "created"}: ${SCAFFOLD_BRANCH}`,
        );

        // ----- Step 5: commit all files in one shot ----------------------
        const commit = await doCommitFiles({
          owner: repo.owner,
          repo: repo.name,
          branch: SCAFFOLD_BRANCH,
          files,
          commit_message: `Initial scaffold: ${input.project_name}`,
        });
        console.error(
          `[generator] committed ${commit.fileCount} files @ ${commit.commitSha.slice(0, 7)}`,
        );

        // ----- Step 6: open PR -------------------------------------------
        const pr = await doOpenPullRequest({
          owner: repo.owner,
          repo: repo.name,
          title: `Initial scaffold: ${input.project_name}`,
          body: buildPrBody({
            projectName: input.project_name,
            description: input.description,
            includeBackend,
            includeStripe,
            files,
            profile,
            styleRefs: input.style_reference_repos,
          }),
          head_branch: SCAFFOLD_BRANCH,
          base_branch: repo.defaultBranch,
        });
        console.error(
          `[generator] PR ${pr.alreadyExisted ? "reused" : "opened"}: ${pr.url}`,
        );

        // ----- Done ------------------------------------------------------
        const summaryLines: string[] = [
          `Generated client repo: **${repo.fullName}**`,
          ``,
          `- Repo:   ${repo.url}`,
          `- PR:     ${pr.url}`,
          `- Branch: ${SCAFFOLD_BRANCH} → ${repo.defaultBranch}`,
          `- Files:  ${commit.fileCount} (committed in ${commit.commitSha.slice(0, 7)})`,
          ``,
          `Stack:`,
          `- Next.js (App Router) + Tailwind`,
          ...(includeBackend ? [`- NestJS backend in /backend`] : []),
          ...(includeStripe ? [`- Stripe placeholder integration`] : []),
          ``,
          `Style profile applied:`,
          `- naming: ${profile.conventions.fileNaming}, ` +
            `imports: ${profile.conventions.imports}, ` +
            `exports: ${profile.conventions.componentStyle}`,
          ...(profile.sources.length
            ? [`- inferred from: ${profile.sources.join(", ")}`]
            : []),
          ``,
          `Review the PR before merging. The scaffold branch is **not** auto-merged into ${repo.defaultBranch}.`,
        ];

        return {
          content: [{ type: "text", text: summaryLines.join("\n") }],
        };
      } catch (err) {
        return toolErrorResult(formatGithubError(err, "generate_client_repo"));
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Dry-run renderer
// ---------------------------------------------------------------------------

interface ReportArgs {
  projectName: string;
  description?: string;
  includeBackend: boolean;
  includeStripe: boolean;
  files: GeneratedFile[];
  profile: StyleProfile;
  styleRefs?: string[];
}

const PREVIEW_LINES = 30;
const PREVIEW_BYTES = 2_000;

function renderDryRunReport(args: ReportArgs): string {
  const lines: string[] = [];
  lines.push(`# DRY RUN: ${args.projectName}`);
  lines.push("");
  lines.push(
    "**No GitHub writes were performed.** This is a preview of what `generate_client_repo` would produce.",
  );
  if ((args.styleRefs?.length ?? 0) > 0) {
    lines.push(
      `Style references were read (read-only) to extract a profile. Pass \`style_reference_repos: []\` for a fully offline run.`,
    );
  }
  lines.push("");

  lines.push("## Style profile");
  lines.push("```json");
  // Emit in the spec's nested shape, sources/rationale at the bottom for readability.
  lines.push(
    JSON.stringify(
      {
        framework: args.profile.framework,
        structure: args.profile.structure,
        conventions: args.profile.conventions,
        styling: args.profile.styling,
        sources: args.profile.sources,
      },
      null,
      2,
    ),
  );
  lines.push("```");
  if (args.profile.rationale.length > 0) {
    lines.push("");
    lines.push("**Rationale:**");
    for (const r of args.profile.rationale) lines.push(`- ${r}`);
  }

  lines.push("");
  lines.push(`## File manifest (${args.files.length} files)`);
  for (const f of args.files) {
    const bytes = Buffer.byteLength(f.content, "utf8");
    lines.push(`- \`${f.path}\` (${bytes.toLocaleString()} B)`);
  }

  lines.push("");
  lines.push("## File previews");
  lines.push(
    `(Each preview is the first ${PREVIEW_LINES} lines or ${PREVIEW_BYTES.toLocaleString()} bytes, whichever comes first.)`,
  );
  for (const f of args.files) {
    lines.push("");
    lines.push(`### \`${f.path}\``);
    lines.push("```" + extensionFor(f.path));
    const preview = previewOf(f.content);
    lines.push(preview.text);
    if (preview.truncated) {
      const remaining = preview.totalBytes - preview.shownBytes;
      lines.push(`/* ... truncated (${remaining.toLocaleString()} more bytes) ... */`);
    }
    lines.push("```");
  }

  lines.push("");
  lines.push(`---`);
  lines.push(
    `Run again with \`dry_run: false\` (the default) to actually create the repo, branch, commit, and PR.`,
  );

  return lines.join("\n");
}

function previewOf(content: string): {
  text: string;
  truncated: boolean;
  totalBytes: number;
  shownBytes: number;
} {
  const totalBytes = Buffer.byteLength(content, "utf8");
  const byByte =
    totalBytes <= PREVIEW_BYTES ? content : content.slice(0, PREVIEW_BYTES);
  const lines = byByte.split("\n");
  const trimmed =
    lines.length <= PREVIEW_LINES
      ? byByte
      : lines.slice(0, PREVIEW_LINES).join("\n");
  const shownBytes = Buffer.byteLength(trimmed, "utf8");
  return {
    text: trimmed,
    truncated: shownBytes < totalBytes,
    totalBytes,
    shownBytes,
  };
}

function extensionFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
      return "ts";
    case "js":
    case "mjs":
    case "jsx":
      return "js";
    case "json":
      return "json";
    case "md":
      return "md";
    case "css":
      return "css";
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// PR body
// ---------------------------------------------------------------------------

interface PrBodyArgs {
  projectName: string;
  description?: string;
  includeBackend: boolean;
  includeStripe: boolean;
  files: GeneratedFile[];
  profile: StyleProfile;
  styleRefs?: string[];
}

function buildPrBody(args: PrBodyArgs): string {
  const lines: string[] = [];
  lines.push(`Initial scaffold for **${args.projectName}**.`);
  if (args.description) lines.push(args.description);
  lines.push("");
  lines.push("## What's included");
  lines.push("- Next.js (App Router) + Tailwind CSS frontend");
  if (args.includeBackend) lines.push("- NestJS backend in `/backend`");
  if (args.includeStripe) {
    lines.push("- Stripe placeholder integration (test-key shaped, no real keys)");
  }
  lines.push("- README, .env.example, .gitignore");
  lines.push("");

  lines.push("## Style profile");
  lines.push(`- File naming: \`${args.profile.conventions.fileNaming}\``);
  lines.push(`- Component style: \`${args.profile.conventions.componentStyle}\``);
  lines.push(`- Imports: \`${args.profile.conventions.imports}\``);
  if (args.profile.sources.length > 0) {
    lines.push(`- Inferred from: ${args.profile.sources.map((s) => `\`${s}\``).join(", ")}`);
  } else {
    lines.push(`- Inferred from: (defaults — no style refs supplied)`);
  }
  lines.push("");

  lines.push(`## Files (${args.files.length})`);
  for (const f of args.files) {
    lines.push(`- \`${f.path}\``);
  }
  lines.push("");
  lines.push("## Review checklist");
  lines.push("- [ ] Project name + description match what you wanted");
  lines.push("- [ ] Tailwind config picks up your component paths");
  lines.push("- [ ] `.env.example` lists every var the code references");
  if (args.includeStripe) {
    lines.push("- [ ] Stripe keys are placeholders (`*_REPLACE_ME`)");
  }
  if (args.includeBackend) {
    lines.push(
      "- [ ] `/backend` builds with `cd backend && npm install && npm run build`",
    );
  }
  lines.push(
    "- [ ] No real secrets, API keys, or PII anywhere in the diff",
  );
  return lines.join("\n");
}
