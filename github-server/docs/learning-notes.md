# Learning notes

A companion to the README. The README explains *how to use* this server;
this file explains *what the pieces mean* and how they map to MCP concepts
and to GitHub primitives.

---

## 1. The MCP server lifecycle

Every MCP server, regardless of language, goes through the same phases:

```
┌─────────┐   spawn    ┌──────────┐   initialize    ┌──────────┐
│ client  │ ─────────► │  server  │ ──────────────► │ handshake│
└─────────┘            └──────────┘                 └────┬─────┘
                                                        │ initialized
                                                        ▼
                                          ┌────────────────────────────┐
                                          │  steady state: requests &  │
                                          │  notifications either way  │
                                          └────────────┬───────────────┘
                                                       │  EOF / SIGTERM
                                                       ▼
                                                ┌──────────┐
                                                │  close   │
                                                └──────────┘
```

In our codebase:

1. **Spawn** — Claude Desktop runs `node dist/index.js` and pipes stdin/stdout.
2. **Pre-flight** — `index.ts` calls `getEnv()` so a missing token kills the
   process *before* the handshake. The client surfaces our error message.
3. **Build** — `buildServer()` constructs an `McpServer` and calls every
   `register*` function. No GitHub calls happen here; we just declare what
   exists.
4. **Connect** — `server.connect(new StdioServerTransport())` wires in stdio.
5. **Initialize** — the client sends `initialize` and receives the server's
   capabilities (tools/resources/prompts list-changed flags).
6. **Steady state** — requests fly back and forth: `tools/call`,
   `resources/read`, `prompts/get`, `ping`.
7. **Close** — when the client closes stdin or sends SIGTERM, our handler
   calls `server.close()` and we exit.

Octokit is initialised lazily inside `getOctokit()` so we never make a
network call until a tool actually needs one.

---

## 2. How each capability maps to GitHub

### Tools → mutating or non-trivial GitHub actions

| MCP tool          | GitHub call                                                        |
| ----------------- | ------------------------------------------------------------------ |
| `list_open_prs`   | `octokit.rest.pulls.list({ state: 'open', sort: 'updated' })`     |
| `get_pr_details`  | `octokit.rest.pulls.get(...)`                                     |
| `get_pr_diff`     | `octokit.rest.pulls.get({ mediaType: { format: 'diff' } })`       |
| `list_issues`     | `octokit.rest.issues.listForRepo(...)` then filter out PRs        |
| `create_issue`    | `octokit.rest.issues.create(...)`                                 |
| `comment_on_pr`   | `octokit.rest.issues.createComment(...)` (PR == issue in GitHub)  |

A few non-obvious things:

- **`get_pr_diff` returns text, not JSON.** When you pass
  `mediaType: { format: 'diff' }`, GitHub returns `text/x-diff` and Octokit
  surfaces the body as a string. The TypeScript types still claim it's the
  PR object, so we cast `data as unknown as string`.
- **`list_issues` must filter PRs.** GitHub's data model treats PRs as
  issues with an extra `pull_request` field. The `issues.listForRepo`
  endpoint includes them by default; if we didn't filter, every PR would
  show up twice (once via `list_open_prs`, once via `list_issues`).
- **`comment_on_pr` uses the issues API.** Conversation comments on PRs
  live on the same endpoint as issue comments. Pass the PR number as
  `issue_number`. This is one of GitHub's classic API quirks.

### Resources → read-only views the user attaches

| MCP resource                | GitHub call                                          |
| --------------------------- | ---------------------------------------------------- |
| `github://prs/open`         | `pulls.list` formatted as Markdown.                  |
| `github://repo/status`      | `repos.get` + a 1-page `pulls.list` for PR count.    |
| `github://issue/{number}`   | `issues.get` — uses MCP's URI template feature.      |

The status resource is interesting: GitHub's repo payload has an
`open_issues_count` field, but it counts PRs as issues. To get a true
issue count, we have to subtract the PR count. We learn the PR count
without paging through every PR by parsing the `Link: ...; rel="last"`
header on a `per_page=1` request — that's how GitHub tells you the total
page count.

### Prompts → orchestration recipes

The server doesn't run an LLM. A prompt is just a list of `messages` that
the *client's* LLM will read. So `draft_pr_review` doesn't *do* anything
on the server side beyond returning a piece of text — that text tells
Claude which tools to call and in what order. This separation means:

- The server stays pure: prompts are templates, tools do work.
- Anyone can re-implement `draft_pr_review` differently by writing their
  own prompt without touching tool code.
- Prompts are *cheap*: they don't consume API quota, they just shape the
  conversation.

---

## 3. JSON Schema validation for tool inputs

When you write:

```ts
inputSchema: {
  pull_number: z.number().int().positive(),
}
```

…the SDK does three things:

1. **At registration time** — converts your zod shape into a JSON Schema
   and stores it on the tool descriptor.
2. **At `tools/list` time** — advertises that JSON Schema to the client,
   so the client (and the LLM) knows exactly what arguments are expected.
3. **At `tools/call` time** — validates the incoming `arguments` against
   the schema *before* invoking your handler. If validation fails, the
   handler never runs and the SDK returns a structured error.

You can verify this by sending a malformed call and watching it bounce:

```jsonc
{"jsonrpc":"2.0","id":99,"method":"tools/call","params":{"name":"get_pr_details","arguments":{"pull_number":"not-a-number"}}}
```

Same machinery applies to **prompt arguments** (`argsSchema`). One
gotcha: prompt arguments are always strings on the wire (per spec), so
even though we ask for a "PR number", the schema is `z.string()`, not
`z.number()`. Inside the prompt body we just embed the string and let
Claude pass it to the tool, which *does* coerce/validate as a number.

---

## 4. Error handling philosophy

Three layers:

1. **Pre-flight errors** (missing GITHUB_TOKEN) → exit at startup with
   `process.exit(1)` and a clear stderr message. The client surfaces this.
2. **Validation errors** (wrong argument types) → handled by the SDK
   automatically; client sees a JSON-RPC error.
3. **Runtime errors** (GitHub 404, rate limit, network) → caught inside
   each handler and turned into a `toolErrorResult(...)` with
   `isError: true`. The connection stays alive; the LLM sees a friendly
   message and can recover (e.g., "Hmm, the repo wasn't found — did you
   mean...").

We never let an exception escape a tool handler — that would crash the
JSON-RPC stream and disconnect the client.

`formatGithubError` translates Octokit's HTTP errors:

| Status | Meaning                                                      |
| ------ | ------------------------------------------------------------ |
| 401    | Token missing or expired.                                    |
| 403    | Either insufficient scopes or rate-limited (we detect both). |
| 404    | Repo / PR / issue doesn't exist or your token can't see it.  |
| 422    | Validation error (e.g. labels don't exist on the repo).      |

---

## 5. Security model in one paragraph

This server has *exactly* the GitHub permissions of the token in
`GITHUB_TOKEN`. There is no per-tool authorisation. If you give it a
classic `repo`-scope PAT, every tool can read and write any repo you
have access to — including issuing comments under your identity.
That's why we mark write tools with `destructiveHint: true` so MCP
clients can ask before running them, and why the README pushes
fine-grained tokens scoped to specific repos.

---

## 6. Useful next reads

- **MCP spec**: <https://modelcontextprotocol.io/specification/>
- **MCP TypeScript SDK**: <https://github.com/modelcontextprotocol/typescript-sdk>
- **Octokit REST.js**: <https://octokit.github.io/rest.js/>
- **GitHub REST API reference**: <https://docs.github.com/en/rest>
- **JSON-RPC 2.0**: <https://www.jsonrpc.org/specification>

When you're ready to graduate this server, look at:

- **Streamable HTTP transport** — the same `McpServer` instance hosted at
  an HTTP endpoint instead of stdio.
- **`pulls.createReview`** — for line-level comments and full reviews.
- **GitHub webhooks** — push the server's resources to clients via
  `notifications/resources/list_changed` instead of polling.
