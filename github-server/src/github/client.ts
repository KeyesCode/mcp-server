// Thin wrapper around Octokit so we have a single place to configure auth,
// retries, base URL, etc. The Octokit instance is cached — we only need one.

import { Octokit } from "@octokit/rest";
import { getEnv } from "../config/env.js";

let cached: Octokit | null = null;

export function getOctokit(): Octokit {
  if (cached) return cached;
  const env = getEnv();
  cached = new Octokit({
    auth: env.GITHUB_TOKEN,
    userAgent: "mcp-github-workflow-server/0.1.0",
    // Octokit will retry on transient errors automatically. For a learning
    // prototype we keep defaults — production servers usually customise this.
  });
  return cached;
}
