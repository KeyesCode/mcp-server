// Tool: generate_client_repo
//
// The high-level "Repository Generator". Composes the lower-level write
// tools and the generator templates to produce a fresh client-ready repo
// with a reviewable PR — never a direct push to main.
//
// Pipeline:
//   1. (optional) analyse style_reference_repos via existing read tools
//      so the generated README can mention what shaped it.
//   2. generateProjectStructure() → array of {path, content}
//   3. doCreateRepository()        → repo created with auto_init=true (main).
//   4. doCreateBranch()            → "initial-scaffold" off main.
//   5. doCommitFiles()             → single atomic commit on the branch.
//   6. doOpenPullRequest()         → "Initial scaffold" PR.
//
// Every step logs to stderr so the developer can follow along.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { formatGithubError, toolErrorResult } from "../utils/errors.js";
import {
  generateProjectStructure,
  type GeneratedFile,
} from "../generator/generateProjectStructure.js";
import { doCreateRepository } from "./createRepository.js";
import { doCreateBranch } from "./createBranch.js";
import { doCommitFiles } from "./commitFiles.js";
import { doOpenPullRequest } from "./openPullRequest.js";
import { readRepoFile } from "../utils/fileSafety.js";
import { fetchRepoTree } from "../utils/repoTree.js";
import { logToolCall } from "../server.js";

const SCAFFOLD_BRANCH = "initial-scaffold";

export function registerGenerateClientRepoTool(server: McpServer): void {
  server.registerTool(
    "generate_client_repo",
    {
      title: "Generate Client Repo",
      description:
        "Creates a new GitHub repo, generates a Next.js (+ optional NestJS, + optional Stripe) scaffold, commits it to a fresh branch, and opens a PR. Never pushes directly to main.",
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
            "Optional list of 'owner/repo' strings. We run detect_framework + detect_common_patterns against each to inform the README's 'generation notes'.",
          ),
        private: z
          .boolean()
          .optional()
          .describe("Create the new repo private (default: true)."),
      },
    },
    async (input) => {
      try {
        const includeBackend = input.include_backend ?? true;
        const includeStripe = input.include_stripe ?? true;
        const isPrivate = input.private ?? true;

        logToolCall("generate_client_repo", {
          project_name: input.project_name,
          include_backend: includeBackend,
          include_stripe: includeStripe,
          style_refs: input.style_reference_repos?.length ?? 0,
        });

        // ----- Step 1: optional style analysis -----------------------------
        const styleNotes: string[] = [];
        for (const ref of input.style_reference_repos ?? []) {
          const note = await analyseStyleReference(ref);
          if (note) styleNotes.push(note);
        }

        // ----- Step 2: generate file content -------------------------------
        const files: GeneratedFile[] = generateProjectStructure({
          projectName: input.project_name,
          description: input.description,
          includeBackend,
          includeStripe,
          styleNotes,
        });
        console.error(
          `[generator] produced ${files.length} files for ${input.project_name}`,
        );

        // ----- Step 3: create repo (auto-initialised with main) ------------
        const repo = await doCreateRepository({
          name: input.project_name,
          description: input.description,
          private: isPrivate,
        });
        console.error(`[generator] repo created: ${repo.url}`);

        // ----- Step 4: create scaffold branch ------------------------------
        const branch = await doCreateBranch({
          owner: repo.owner,
          repo: repo.name,
          branch_name: SCAFFOLD_BRANCH,
          base_branch: repo.defaultBranch,
        });
        console.error(
          `[generator] branch ${branch.alreadyExisted ? "reused" : "created"}: ${SCAFFOLD_BRANCH}`,
        );

        // ----- Step 5: commit all files in one shot ------------------------
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

        // ----- Step 6: open PR ---------------------------------------------
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
            styleRefs: input.style_reference_repos,
          }),
          head_branch: SCAFFOLD_BRANCH,
          base_branch: repo.defaultBranch,
        });
        console.error(`[generator] PR ${pr.alreadyExisted ? "reused" : "opened"}: ${pr.url}`);

        // ----- Done --------------------------------------------------------
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

/** Probe a "owner/repo" reference for high-level signals. Returns a short
 * single-line summary suitable for embedding in the README, or undefined
 * if the ref is unreadable. We intentionally skip framework deps detail to
 * keep the note short. */
async function analyseStyleReference(
  ref: string,
): Promise<string | undefined> {
  const m = ref.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (!m) return `(skipped invalid style reference: ${ref})`;
  const [, owner, repo] = m;

  // We use the same primitives the read tools use, but we don't surface a
  // long report — just a one-liner. If anything fails we silently skip.
  try {
    const [pkgResult, treeResult] = await Promise.allSettled([
      readRepoFile({ owner, repo, path: "package.json" }),
      fetchRepoTree({ owner, repo }),
    ]);

    const fragments: string[] = [];
    if (pkgResult.status === "fulfilled" && !pkgResult.value.binary) {
      try {
        const pkg = JSON.parse(pkgResult.value.text) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        const labels: string[] = [];
        if (deps["next"]) labels.push("Next.js");
        if (deps["@nestjs/core"]) labels.push("NestJS");
        if (deps["tailwindcss"]) labels.push("Tailwind");
        if (deps["stripe"]) labels.push("Stripe");
        if (deps["@prisma/client"]) labels.push("Prisma");
        if (labels.length) fragments.push(labels.join(", "));
      } catch {
        // malformed package.json — ignore
      }
    }
    if (
      treeResult.status === "fulfilled" &&
      treeResult.value.entries.some((e) => e.path === "app/api")
    ) {
      fragments.push("App Router API routes");
    }

    return `${owner}/${repo}${fragments.length ? ` — ${fragments.join("; ")}` : ""}`;
  } catch {
    return `${owner}/${repo} (could not be analysed)`;
  }
}

interface PrBodyArgs {
  projectName: string;
  description?: string;
  includeBackend: boolean;
  includeStripe: boolean;
  files: GeneratedFile[];
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
  lines.push(`## Files (${args.files.length})`);
  for (const f of args.files) {
    lines.push(`- \`${f.path}\``);
  }
  if (args.styleRefs && args.styleRefs.length > 0) {
    lines.push("");
    lines.push("## Style references analysed");
    for (const r of args.styleRefs) lines.push(`- \`${r}\``);
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
    lines.push("- [ ] `/backend` builds with `cd backend && npm install && npm run build`");
  }
  lines.push(
    "- [ ] No real secrets, API keys, or PII anywhere in the diff",
  );
  return lines.join("\n");
}
