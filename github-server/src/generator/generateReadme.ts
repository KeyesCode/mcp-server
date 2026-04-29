// Composes README.md. We avoid placeholder fluff ("lorem ipsum") and try
// to produce something a human would actually keep.

import type { GenerateOptions } from "./generateProjectStructure.js";

export function generateReadme(opts: GenerateOptions): string {
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
    [
      "## Project structure",
      "",
      "```",
      "app/                # Next.js App Router (pages live here)",
      "components/         # Shared UI components",
      "lib/                # Helpers (cn, stripe client, etc.)",
      ...(opts.includeStripe
        ? ["app/api/stripe/    # Stripe checkout API route"]
        : []),
      ...(opts.includeBackend
        ? ["backend/            # NestJS API (independent npm project)"]
        : []),
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

  if (opts.styleNotes && opts.styleNotes.length > 0) {
    sections.push(
      "## Generation notes\n\nThis scaffold drew style cues from:\n\n" +
        opts.styleNotes.map((n) => `- ${n}`).join("\n"),
    );
  }

  sections.push("## License\n\nProprietary. All rights reserved.");

  return sections.join("\n\n") + "\n";
}
