// Centralised environment loading & validation.
//
// We `dotenv.config()` here, so any module that imports something from this
// file is guaranteed to have process.env populated. Validation goes through
// zod so a missing GITHUB_TOKEN fails fast with a clear message instead of
// surfacing as a confusing 401 from GitHub.

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ConfigError } from "../utils/errors.js";

// Resolve `.env` relative to the project root. Works whether we run via
// `tsx` (src/) or `node` (dist/) — both end up two dirs up from this file.
const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..", "..");
dotenv.config({ path: path.join(projectRoot, ".env"), quiet: true });

const Schema = z.object({
  GITHUB_TOKEN: z
    .string()
    .min(1, "GITHUB_TOKEN must be set (see README §GitHub auth)."),
  DEFAULT_GITHUB_OWNER: z.string().optional(),
  DEFAULT_GITHUB_REPO: z.string().optional(),
});

export type Env = z.infer<typeof Schema>;

let cached: Env | null = null;

/** Lazily parse + cache process.env. Throws ConfigError on bad input. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("\n");
    throw new ConfigError(
      `Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill it in.`,
    );
  }
  cached = parsed.data;
  return cached;
}

/** Resolve which (owner, repo) a tool call targets. Order:
 *  1. Explicit args from the tool call.
 *  2. DEFAULT_GITHUB_OWNER / DEFAULT_GITHUB_REPO from .env.
 *  3. Throw a friendly ConfigError. */
export function resolveRepo(
  owner?: string,
  repo?: string,
): { owner: string; repo: string } {
  const env = getEnv();
  const o = owner?.trim() || env.DEFAULT_GITHUB_OWNER;
  const r = repo?.trim() || env.DEFAULT_GITHUB_REPO;
  if (!o || !r) {
    throw new ConfigError(
      "No repository specified. Either pass `owner` and `repo` as tool arguments, " +
        "or set DEFAULT_GITHUB_OWNER and DEFAULT_GITHUB_REPO in your .env.",
    );
  }
  return { owner: o, repo: r };
}
