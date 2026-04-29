// Repository tree helpers.
//
// `git.getTree` with `recursive: 'true'` returns every file in the repo in
// one call — but for a node project that means thousands of node_modules
// entries we don't care about. We filter aggressively before returning to
// the caller.

import { getOctokit } from "../github/client.js";

/** Path prefixes/segments to drop from any tree walk. Add to taste. */
const EXCLUDED_SEGMENTS = [
  "node_modules/",
  "dist/",
  "build/",
  ".next/",
  ".nuxt/",
  ".svelte-kit/",
  ".turbo/",
  "out/",
  "coverage/",
  ".git/",
  ".venv/",
  "venv/",
  "__pycache__/",
  "vendor/",
  "target/",
  ".cache/",
  ".parcel-cache/",
  ".pnpm-store/",
  "storybook-static/",
  ".vercel/",
  ".serverless/",
];

/** Return true if `path` lives inside any excluded directory. */
export function isExcludedPath(path: string): boolean {
  const lower = path.toLowerCase();
  for (const seg of EXCLUDED_SEGMENTS) {
    if (lower.startsWith(seg) || lower.includes("/" + seg)) return true;
  }
  return false;
}

/** Cap on entries returned to the caller. Plenty for a code review and
 * keeps responses inside Claude's context comfortably. */
export const MAX_TREE_ENTRIES = 500;

export interface TreeEntry {
  path: string;
  type: "file" | "dir" | "symlink" | "submodule";
  size?: number;
  sha?: string;
}

export interface TreeResult {
  entries: TreeEntry[];
  /** True if we hit MAX_TREE_ENTRIES. */
  truncatedByUs: boolean;
  /** True if GitHub itself returned a truncated tree (very large repos). */
  truncatedByGithub: boolean;
  /** Number of entries dropped by the exclusion filter. */
  excluded: number;
  /** The ref we ended up using (default branch if none was supplied). */
  ref: string;
}

/** Fetch a recursive tree from GitHub, filter out excluded paths, and cap
 * the result. Resolves the default branch automatically when `ref` is
 * omitted. */
export async function fetchRepoTree(params: {
  owner: string;
  repo: string;
  ref?: string;
}): Promise<TreeResult> {
  const octokit = getOctokit();
  let ref = params.ref;
  if (!ref) {
    const { data } = await octokit.rest.repos.get({
      owner: params.owner,
      repo: params.repo,
    });
    ref = data.default_branch;
  }

  // git.getTree accepts a ref (branch name) in tree_sha as well as a SHA.
  const { data } = await octokit.rest.git.getTree({
    owner: params.owner,
    repo: params.repo,
    tree_sha: ref,
    recursive: "true",
  });

  let excluded = 0;
  const entries: TreeEntry[] = [];
  for (const item of data.tree) {
    if (!item.path) continue;
    if (isExcludedPath(item.path)) {
      excluded++;
      continue;
    }
    let type: TreeEntry["type"] = "file";
    if (item.type === "tree") type = "dir";
    else if (item.type === "commit") type = "submodule";
    // Note: GitHub doesn't tag symlinks distinctly in this endpoint — they
    // come through as "blob" with mode 120000. We don't decode the mode here.
    entries.push({
      path: item.path,
      type,
      size: item.size,
      sha: item.sha,
    });
    if (entries.length >= MAX_TREE_ENTRIES) break;
  }

  return {
    entries,
    truncatedByUs: entries.length >= MAX_TREE_ENTRIES,
    truncatedByGithub: !!data.truncated,
    excluded,
    ref,
  };
}
