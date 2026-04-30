// Composes README.md. Adds a "Why this structure?" section in Phase 4 so
// the developer can see *which* reference repos shaped the layout and why.

import type { GenerateOptions } from "./generateProjectStructure.js";
import type { StyleProfile } from "./styleProfile.js";

export function generateReadme(
  opts: GenerateOptions,
  profile: StyleProfile,
): string {
  const stackBullets: string[] = [
    "**Frontend:** Next.js (App Router) + Tailwind CSS",
  ];
  if (opts.includeBackend) {
    stackBullets.push("**Backend:** NestJS (in `backend/`)");
  }
  if (opts.includeStripe) {
    stackBullets.push("**Payments:** Stripe (placeholder integration)");
  }
  stackBullets.push("**Language:** TypeScript end to end");

  const envVars: string[] = ["NEXT_PUBLIC_SITE_URL"];
  if (opts.includeStripe) {
    envVars.push(
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    );
  }
  if (opts.includeBackend) envVars.push("BACKEND_PORT");

  const sections: string[] = [];
  sections.push(`# ${opts.projectName}`);
  if (opts.description) sections.push(opts.description);
  sections.push(
    "This repository was scaffolded by the `generate_client_repo` MCP tool. " +
      "The first commit lives on the `initial-scaffold` branch — review it via " +
      'the open "Initial scaffold" PR before merging to `main`.',
  );

  sections.push("## Stack\n\n" + stackBullets.map((b) => `- ${b}`).join("\n"));

  sections.push(buildStructureBlock(opts, profile));

  sections.push(
    [
      "## Getting started",
      "",
      "```bash",
      "npm install",
      "cp .env.example .env.local   # then fill in real values",
      "npm run dev                  # http://localhost:3000",
      "```",
    ].join("\n"),
  );

  sections.push(
    "## Environment variables\n\nCopy `.env.example` to `.env.local` and fill in:\n\n" +
      envVars.map((v) => `- \`${v}\``).join("\n"),
  );

  if (opts.includeStripe) {
    sections.push(
      [
        "## Stripe",
        "",
        "A placeholder Stripe integration is included:",
        "",
        "- `lib/stripe.ts` — initialises the Stripe SDK from `STRIPE_SECRET_KEY`.",
        "- `app/api/stripe/checkout/route.ts` — example checkout session endpoint.",
        "",
        "To activate it: get test keys from <https://dashboard.stripe.com/test/apikeys>, fill in `.env.local`, and POST to `/api/stripe/checkout` with a `priceId`.",
        "",
        "**Never commit real keys.** Test keys are safe to share with collaborators; live keys are not.",
      ].join("\n"),
    );
  }

  if (opts.includeBackend) {
    sections.push(
      [
        "## Backend (NestJS)",
        "",
        "The `backend/` directory is an independent npm project — install and run it separately from the frontend:",
        "",
        "```bash",
        "cd backend",
        "npm install",
        "npm run start:dev",
        "```",
        "",
        "The API listens on `BACKEND_PORT` (default 3001) with a single `/health` endpoint to start.",
      ].join("\n"),
    );
  }

  // Phase 4: explain the style decisions.
  sections.push(buildWhyThisStructureSection(profile));

  sections.push("## License\n\nProprietary. All rights reserved.");

  return sections.join("\n\n") + "\n";
}

function buildStructureBlock(
  opts: GenerateOptions,
  profile: StyleProfile,
): string {
  const root = profile.structure.useSrcDir ? "src/" : "";
  const lines: string[] = [];
  lines.push("## Project structure");
  lines.push("");
  lines.push("```");
  if (profile.structure.useSrcDir) lines.push(`${root}            # source root`);
  lines.push(`${root}app/                # Next.js App Router (pages live here)`);
  lines.push(`${root}components/         # Shared UI components${profile.structure.hasUiSubdir ? " (with components/ui/ for primitives)" : ""}`);
  lines.push(`${root}lib/                # Helpers (cn, stripe client, etc.)`);
  if (profile.structure.hasHooksDir)
    lines.push(`${root}hooks/              # Custom React hooks`);
  if (profile.structure.hasServicesDir)
    lines.push(`${root}services/           # API client / external services`);
  if (opts.includeStripe)
    lines.push(`${root}app/api/stripe/     # Stripe checkout API route`);
  if (opts.includeBackend)
    lines.push(`backend/            # NestJS API (independent npm project)`);
  lines.push("```");
  return lines.join("\n");
}

function buildWhyThisStructureSection(profile: StyleProfile): string {
  const lines: string[] = [];
  lines.push("## Why this structure?");
  lines.push("");
  if (profile.sources.length > 0) {
    lines.push(
      "This scaffold's folder layout, file naming, and import style were inferred from these reference repos:",
    );
    lines.push("");
    for (const ref of profile.sources) lines.push(`- \`${ref}\``);
    lines.push("");
  } else {
    lines.push(
      "No reference repos were supplied — the structure below uses the project's defaults.",
    );
    lines.push("");
  }
  lines.push("**Decisions made:**");
  lines.push("");
  lines.push(`- File naming: \`${profile.conventions.fileNaming}\``);
  lines.push(
    `- Component style: \`${profile.conventions.componentStyle}\` (e.g. ${
      profile.conventions.componentStyle === "default-export"
        ? "`export default function Header()`"
        : "`export function Header()` + named import"
    })`,
  );
  lines.push(
    `- Imports: \`${profile.conventions.imports}\` ${
      profile.conventions.imports === "absolute"
        ? "(`@/components/...` via tsconfig paths)"
        : "(plain relative paths — no path aliases)"
    }`,
  );
  if (profile.structure.useSrcDir) lines.push(`- Source root: \`src/\``);
  lines.push(
    `- Optional dirs: ${
      [
        profile.structure.hasHooksDir && "`hooks/`",
        profile.structure.hasServicesDir && "`services/`",
        profile.structure.hasUtilsDir && "`utils/`",
        profile.structure.hasUiSubdir && "`components/ui/`",
      ]
        .filter(Boolean)
        .join(", ") || "(none beyond `components/` and `lib/`)"
    }`,
  );
  if (profile.rationale.length > 0) {
    lines.push("");
    lines.push("**Rationale:**");
    lines.push("");
    for (const r of profile.rationale) lines.push(`- ${r}`);
  }
  return lines.join("\n");
}
