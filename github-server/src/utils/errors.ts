// Error helpers shared by every tool.
//
// MCP tool handlers should return a result with `isError: true` rather than
// throwing — that way the *client* sees a friendly message and can recover,
// instead of the whole connection dying. We centralise the mapping here so
// every tool gets the same UX for common failure modes.

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/** Duck-typed Octokit HTTP error. We avoid importing @octokit/request-error
 * directly so this file works even if Octokit's internals change. */
interface GithubHttpError {
  status: number;
  message: string;
  response?: { headers?: Record<string, string | undefined> };
}

function isGithubHttpError(err: unknown): err is GithubHttpError {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
  );
}

/** Turn any error into a user-facing string with actionable context. */
export function formatGithubError(err: unknown, context: string): string {
  if (err instanceof ConfigError) return err.message;

  if (isGithubHttpError(err)) {
    const { status, message, response } = err;
    if (status === 401) {
      return `[${context}] GitHub authentication failed (401). Check that GITHUB_TOKEN is set in your .env and has not been revoked or expired.`;
    }
    if (status === 403) {
      const remaining = response?.headers?.["x-ratelimit-remaining"];
      const reset = response?.headers?.["x-ratelimit-reset"];
      if (remaining === "0" && reset) {
        const resetDate = new Date(Number(reset) * 1000).toISOString();
        return `[${context}] GitHub API rate limit reached. Quota resets at ${resetDate}.`;
      }
      return `[${context}] GitHub API forbidden (403). Your token may lack the required scopes (need 'repo' or 'public_repo' + 'issues'). Original message: ${message}`;
    }
    if (status === 404) {
      return `[${context}] Resource not found (404). Verify that the repo exists, that the PR / issue number is correct, and that your token can see private repos if applicable.`;
    }
    if (status === 422) {
      return `[${context}] GitHub rejected the request (422 Unprocessable Entity). This usually means a validation error in the body. Original: ${message}`;
    }
    return `[${context}] GitHub API error (${status}): ${message}`;
  }

  return `[${context}] Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
}

/** Standard "I failed but didn't crash" tool result. */
export function toolErrorResult(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}
