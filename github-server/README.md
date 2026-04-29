# mcp-github-workflow-server

A real-use **Model Context Protocol** server that lets Claude (or any
MCP-aware client) drive your GitHub workflow *and* understand your existing
repos: list and review PRs, triage issues, post comments, walk a repo's
tree, read individual files, and detect frameworks / common patterns.

This is a learning prototype — it's small enough to read in one sitting and
real enough to plug into Claude Desktop and use every day.

---

## Table of contents

1. [What this server does](#what-this-server-does)
2. [What is MCP?](#what-is-mcp)
3. [Tools vs. resources vs. prompts](#tools-vs-resources-vs-prompts)
4. [GitHub auth — getting a token](#github-auth--getting-a-token)
5. [Environment variables](#environment-variables)
6. [Run it locally](#run-it-locally)
7. [Connect to Claude Desktop](#connect-to-claude-desktop)
8. [Example Claude prompts to try](#example-claude-prompts-to-try)
9. [Security notes about GitHub tokens](#security-notes-about-github-tokens)
10. [Future improvements](#future-improvements)

---

## What this server does

The server exposes the following capabilities over MCP:

### Tools — workflow (PRs, issues, comments)
| Tool              | What it does                                                         |
| ----------------- | -------------------------------------------------------------------- |
| `list_open_prs`   | List open PRs in a repo (defaults to your configured repo).         |
| `get_pr_details`  | Title, body, labels, reviewers, file counts, mergeable state.       |
| `get_pr_diff`     | The unified diff (truncated if huge).                                |
| `list_issues`     | List issues with PRs filtered out.                                   |
| `create_issue`    | Create a new issue. **Write side effect.**                           |
| `comment_on_pr`   | Post a conversation comment on a PR. **Write side effect.**          |

### Tools — repository intelligence (read-only)
| Tool                         | What it does                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `list_repositories`          | List repos for the authenticated user (or for a given org).                     |
| `get_repo_tree`              | Recursive directory listing, filtered (no node_modules/dist/build/.git/etc).    |
| `read_file`                  | Read a single file, refusing binaries and truncating at 200 KB.                 |
| `search_codebase`            | Keyword search inside a repo via GitHub's code search.                          |
| `detect_framework`           | Detect Next.js / NestJS / Express / Astro / Rust / Go / Python / etc.           |
| `get_package_json_summary`   | Name, version, scripts, deps — compact form (handles monorepo paths).           |
| `detect_common_patterns`     | Spot auth, payments, API structure, ORM, testing, validation, CI from deps + tree. |

### Resources (read-only views)
| URI                           | What it returns                                       |
| ----------------------------- | ----------------------------------------------------- |
| `github://prs/open`           | Markdown list of open PRs.                            |
| `github://repo/status`        | Repo metadata (branch, PR/issue counts, stars, etc.). |
| `github://issue/{number}`     | A single issue (URI template — `{number}` is filled in by the client). |

### Prompts (instruction templates)
| Prompt                       | Purpose                                                      |
| ---------------------------- | ------------------------------------------------------------ |
| `draft_pr_review`            | Orchestrates `get_pr_details` + `get_pr_diff` and asks for a structured review. |
| `weekly_pr_digest`           | Asks Claude to produce a weekly digest of open PRs.          |
| `explain_github_mcp_server`  | A beginner-friendly tour of this server.                     |

---

## What is MCP?

**MCP (Model Context Protocol)** is an open protocol that lets an AI client
(like Claude Desktop, Claude Code, or Cursor) talk to *external* programs
that expose **tools**, **resources**, and **prompts** over JSON-RPC. The
protocol standardises the handshake, so any MCP-compatible client can use
any MCP-compatible server.

Think of it as **USB-C for LLMs**: one cable, many devices.

This server is a "device" — it speaks MCP on stdin/stdout, and inside it
calls the GitHub REST API via Octokit.

## Tools vs. resources vs. prompts

| Concept     | Who initiates? | Has side effects? | Mental model                                  |
| ----------- | -------------- | ----------------- | --------------------------------------------- |
| **Tool**    | The LLM        | Often yes         | "A function the LLM can call."                |
| **Resource**| The user/client| No (read-only)    | "A document the client can attach to chat."   |
| **Prompt**  | The user       | No                | "A reusable, parameterised instruction."      |

Concrete examples in this repo:
- `create_issue` is a **tool** because the LLM decides when to call it and it has side effects.
- `github://prs/open` is a **resource** because it's a static "view" the user can drag into a conversation.
- `draft_pr_review` is a **prompt** because it's a reusable command the user invokes from a slash menu.

---

## GitHub auth — getting a token

The server uses a **GitHub Personal Access Token** (PAT) for all API calls.

1. Go to <https://github.com/settings/tokens>.
2. Click **"Generate new token"**. You can use either flavour:
   - **Classic** is simpler — pick the `repo` scope (or just `public_repo` if you only need public repos), plus `read:org` if your repos live in an org.
   - **Fine-grained** is better if you want to scope the token to specific repos. Required permissions:
     - **Repository permissions → Contents:** read
     - **Repository permissions → Issues:** read & write
     - **Repository permissions → Pull requests:** read & write
     - **Repository permissions → Metadata:** read (auto)
3. Set an expiry (90 days is reasonable for a personal prototype).
4. Copy the token — you'll only see it once.

> ⚠️ **Treat the token like a password.** Anyone with it can read and write to
> your repos. See [Security notes](#security-notes-about-github-tokens) below.

## Environment variables

Copy `.env.example` to `.env` and fill it in:

```ini
# Required
GITHUB_TOKEN=ghp_your_token_here

# Optional — defaults used when tools are called without owner/repo
DEFAULT_GITHUB_OWNER=your-username-or-org
DEFAULT_GITHUB_REPO=your-repo
```

If you skip the defaults, every tool call must pass `owner` and `repo`
explicitly, which gets old fast.

---

## Run it locally

```bash
npm install
npm run build      # compile TypeScript → dist/
npm start          # run the compiled server
# or
npm run dev        # run from src/ with tsx watch (auto-reload)
```

The server speaks **stdio** — it does nothing visible until a client (or
your terminal) sends it JSON-RPC frames. All logging goes to **stderr**;
**stdout** is reserved for the JSON-RPC stream.

### Smoke-test it from a terminal

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_open_prs","arguments":{}}}' \
  | node dist/index.js
```

The third response should be the open PRs in the repo named in your `.env`.

---

## Connect to Claude Desktop

Edit Claude Desktop's MCP config (path varies by OS — on macOS it's
`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "github-workflow": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/github-server/dist/index.js"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here",
        "DEFAULT_GITHUB_OWNER": "your-username-or-org",
        "DEFAULT_GITHUB_REPO": "your-repo"
      }
    }
  }
}
```

Restart Claude Desktop. The server's tools, resources, and prompts will
appear in the MCP panel.

> Putting the token in the MCP config is fine for a personal prototype but
> means it's in plain text on disk. The `env` block is preferred over `.env`
> here because Claude Desktop won't necessarily run with the same working
> directory `dotenv` expects. (The server reads `.env` *if* it can find one
> next to `dist/`, otherwise it reads `process.env`.)

### Connect to Claude Code

```bash
claude mcp add github-workflow \
  --env GITHUB_TOKEN=ghp_your_token_here \
  --env DEFAULT_GITHUB_OWNER=your-username-or-org \
  --env DEFAULT_GITHUB_REPO=your-repo \
  -- node /absolute/path/to/mcp-server/github-server/dist/index.js
```

---

## Example Claude prompts to try

Once connected, try saying things like:

**Workflow:**
- *"Show me the open PRs."*
- *"Get the details for PR 123 and tell me what's risky."*
- *"Use the `draft_pr_review` slash-prompt on PR 123."*
- *"Run the weekly PR digest for me."*
- *"Open an issue titled 'Investigate flaky test in user-service' with body
  'Saw it fail twice on main today, no logs.' Add the labels `bug` and `triage`."*
- *"Comment on PR 123 saying 'Looks great — one small nit on the error
  handling, see file X line Y.'"*

**Repository intelligence:**
- *"List my repos sorted by most recently pushed."*
- *"Show me the tree for `my-org/my-app`."*
- *"What framework does `my-org/my-app` use?"*
- *"Summarise the package.json for `my-org/my-app`."*
- *"What patterns does `my-org/my-app` use for auth and payments?"*
- *"Read `src/app/api/users/route.ts` from `my-org/my-app`."*
- *"Search `my-org/my-app` for 'STRIPE_SECRET_KEY'."*
- *"Read `github://repo/status` and summarise it."*

---

## Security notes about GitHub tokens

- **Never commit `.env`.** It's in `.gitignore` for a reason.
- **Scope down.** Use a fine-grained token limited to the repos you actually
  want Claude to touch.
- **Set an expiry.** 30–90 days is plenty for a personal prototype.
- **Rotate on suspicion.** If you ever paste the token somewhere public
  (chat log, Gist, screenshot), revoke it at
  <https://github.com/settings/tokens> immediately.
- **Watch what tools you call.** `create_issue` and `comment_on_pr` are
  marked with `destructiveHint: true` so MCP clients can prompt before
  running them — but don't rely on the client; review what the LLM is
  asking to do.
- **Audit on the GitHub side.** GitHub keeps an audit log of token usage
  under your account settings.

---

## Future improvements

Things this prototype intentionally does not do, and where to look if you
want to add them:

- **Pagination beyond `per_page`.** Use `octokit.paginate` to traverse all
  pages instead of capping at 50.
- **Line-level review comments.** Use `pulls.createReviewComment` (needs a
  commit SHA + file path + line numbers).
- **Approving / requesting changes / merging PRs.** `pulls.createReview`
  and `pulls.merge`. Mark with `destructiveHint: true`.
- **GitHub Actions** workflow runs and re-runs.
- **Search** (issues / code) via the `search` API.
- **Webhook ingestion** so the server can push notifications about new PRs
  via `notifications/resources/list_changed`.
- **OAuth instead of PATs**, so you can ship this server to other people.
- **Caching + rate-limit budgeting** for repos with heavy traffic.
- **Streamable HTTP transport** for hosting the server remotely.

See `docs/learning-notes.md` for a deeper tour of the MCP concepts each of
those features would touch.
