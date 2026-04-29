// Path validation for write tools.
//
// The MCP server runs with our GITHUB_TOKEN, which can write anywhere our
// token has access. We don't want a malformed tool call to walk paths
// outside the repo root or stomp on `.git/` internals.

/** Returns null if `path` is acceptable for repo writes, or an error string
 * describing why it isn't. */
export function validatePath(path: string): string | null {
  if (typeof path !== "string" || path.length === 0) {
    return "Path must be a non-empty string.";
  }
  if (path.startsWith("/")) {
    return `Path must be repo-relative, got absolute path "${path}".`;
  }
  // Reject any segment equal to ".." — covers "../foo", "foo/../bar", etc.
  const segments = path.split("/");
  if (segments.some((s) => s === "..")) {
    return `Path must not traverse parents, got "${path}".`;
  }
  if (path === ".git" || path.startsWith(".git/")) {
    return `Path must not target the .git directory.`;
  }
  if (path.endsWith("/")) {
    return `Path must point to a file, not a directory: "${path}".`;
  }
  return null;
}

/** Returns the list of duplicated paths in the input, in first-seen order.
 * Empty array if there are no duplicates. */
export function findDuplicatePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const p of paths) {
    if (seen.has(p)) dups.add(p);
    seen.add(p);
  }
  return [...dups];
}
