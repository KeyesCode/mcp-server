// Builds .env.example. We use placeholder strings (sk_test_REPLACE_ME etc.)
// so it's obvious to the human that they need to swap them out — never an
// actual key.

import type { GenerateOptions } from "./generateProjectStructure.js";

export function generateEnvExample(opts: GenerateOptions): string {
  const lines: string[] = [];

  lines.push("# --- Public site URL --------------------------------------");
  lines.push("# Used for canonical links, OG image URLs, Stripe redirects.");
  lines.push("NEXT_PUBLIC_SITE_URL=http://localhost:3000");
  lines.push("");

  if (opts.includeStripe) {
    lines.push("# --- Stripe -----------------------------------------------");
    lines.push("# Get test keys from https://dashboard.stripe.com/test/apikeys");
    lines.push("# NEVER commit real keys.");
    lines.push("STRIPE_SECRET_KEY=sk_test_REPLACE_ME");
    lines.push("STRIPE_WEBHOOK_SECRET=whsec_REPLACE_ME");
    lines.push("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_REPLACE_ME");
    lines.push("");
  }

  if (opts.includeBackend) {
    lines.push("# --- Backend (NestJS, in /backend) ------------------------");
    lines.push("BACKEND_PORT=3001");
    lines.push("");
  }

  return lines.join("\n");
}
