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

### Tools — repository generator (write; PR-only flow) ⚠️
All of these carry `destructiveHint: true` so MCP clients prompt before running them.
**Nothing in this layer pushes directly to `main`** — every change lands on a fresh branch + PR.

| Tool                  | What it does                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| `create_repository`   | Create a new repo under the authenticated user (auto-init `main`).                                 |
| `create_branch`       | Fork a branch off `base_branch`. **Idempotent**: if the branch exists, returns its current ref.    |
| `create_file`         | Create or update a single file (looks up existing SHA when updating).                              |
| `commit_files`        | One atomic commit with many files via the Git Data API. Preferred over `create_file` in a loop.    |
| `open_pull_request`   | Open a PR. **Idempotent**: if a matching PR exists, returns its URL.                               |
| `generate_client_repo`| High-level: scaffolds a Next.js + Tailwind (+ optional NestJS, + optional Stripe) repo and opens a PR. |

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

**Repository generator:**
- *"Create a new client website repo for a nightclub called Pulse. Use the
  Standard KeyesCode Web App template, include Stripe but skip the backend."*
- *"Generate a SaaS landing page repo named `linear-clone` and use my
  `tannerkeyes/some-old-app` repo as a style reference."*
- *"Open a PR on `acme-app` adding a new file `docs/CONTRIBUTING.md` with
  this content: …"*  (uses `create_branch` + `commit_files` + `open_pull_request`)

## Repository generator (Phase 3)

The generator layer composes the lower-level write tools into a high-level
`generate_client_repo` flow. The pipeline is:

1. (optional) Analyse `style_reference_repos` via the read tools — surfaces a
   one-liner per ref into the README's "Generation notes" section.
2. Build the file set in memory via `src/generator/*` (Next.js + Tailwind,
   optional NestJS, optional Stripe placeholders, README, .env.example).
3. `create_repository` — auto-init's `main` branch with a default README.
4. `create_branch` — `initial-scaffold` off `main`.
5. `commit_files` — single atomic commit containing every file (via the
   Git Data API: createBlob → createTree → createCommit → updateRef).
6. `open_pull_request` — *"Initial scaffold: <project>"* PR, never merged
   automatically.

**Safety:**
- All write tools carry `destructiveHint: true`.
- `create_branch` and `open_pull_request` are idempotent — re-running with
  the same args won't error or create duplicates.
- `commit_files` validates every path: rejects `..`, leading `/`, and any
  write into `.git/`. Duplicate paths in one batch are also rejected.
- `generate_client_repo` never targets `main` — work always lands on
  `initial-scaffold` and you decide whether to merge.

**Test it safely:**
- Aim it at a **throwaway repo name** in your own account first
  (e.g. `mcp-scaffold-test-1`, `mcp-scaffold-test-2`).
- Or, even better, use a dedicated **test org** so the new repos are
  isolated from anything important.
- After running once, inspect the PR diff carefully before any merges.

### Adding new templates

Today there's one template — *Standard KeyesCode Web App*. To add another:

1. Drop new generator functions in `src/generator/` (e.g. `generateAdminPanel.ts`).
2. Either extend `generateProjectStructure` with a `template` flag, or add a
   sibling orchestrator (`generateAdminProjectStructure`).
3. Add a new high-level tool (`generate_admin_repo`) wired to that orchestrator.

The lower-level write tools (`create_repository`, `commit_files`, …) are
template-agnostic — only the file-content generators differ.

## Style-aware generation (Phase 4)

`generate_client_repo` extracts a **style profile** from the repos in
`style_reference_repos` and feeds it into the generators, so the output
adapts to your existing patterns instead of always producing the same
boilerplate.

### What gets extracted

For each reference repo, `extractStyleProfile` (in `src/generator/styleProfile.ts`)
makes a small number of read-only API calls and pulls these signals:

| Signal | How |
| --- | --- |
| Framework (Next.js / vite-react) | `package.json` deps |
| Tailwind in use | `package.json` deps |
| Path aliases configured | `tsconfig.json` `compilerOptions.paths` (JSONC-aware) |
| `useSrcDir` / `hasComponentsDir` / `hasLibDir` / `hasHooksDir` / `hasServicesDir` / `hasUiSubdir` | Tree walk |
| File-naming convention | Component file basenames in `components/` (PascalCase vs. kebab vs. camel) |
| Component style (default vs. named export) | Sniff up to 2 small component files |
| Import style (absolute vs. relative) | Same samples — does the repo use `@/...` or `../...`? |

### How it influences generation

Once aggregated into a single profile, the frontend generator (`generateFrontend.ts`) reshapes:

- **File names** — `Header.tsx` vs. `header.tsx` vs. (camel) `header.tsx`.
- **Where components live** — Button at `components/ui/Button.tsx` vs. `components/Button.tsx`.
- **Source root** — everything under `src/` if any reference uses it.
- **Optional dirs** — `hooks/use-example.ts` and/or `services/api.ts` are emitted only if a reference has them.
- **Component definitions** — `export default function Header()` vs. `export function Header()`.
- **Imports** — `import Header from "@/components/Header"` vs. `import { Header } from "../components/header"`.
- **`tsconfig.json` paths** — `paths: { "@/*": [...] }` is only emitted when imports are absolute.
- **Tailwind `content` globs** — extended to cover `hooks/` and `services/` if those dirs exist.

The README of each generated repo also includes a *"Why this structure?"* section listing
the reference repos analysed, the chosen conventions, and a rationale.

### Aggregation rules (anti-overfitting)

- **Structure flags** are aggregated *inclusively* — if any reference has `hooks/`, the
  scaffold gets `hooks/`. This keeps the generator from missing useful dirs when one
  reference happens to lack them.
- **Conventions** are aggregated by majority vote across all sampled file names / file contents.
- **Safety override:** if conventions vote for absolute imports but no reference actually
  configures path aliases, the generator silently downgrades to relative imports — otherwise
  the generated repo wouldn't compile. The downgrade is logged in the rationale.
- **Default fallback:** if no references are supplied, or none can be analysed, the
  generator uses `DEFAULT_PROFILE` — same output as Phase 3 (PascalCase, default export,
  absolute imports, `components/`, `lib/`, `components/ui/`).

### Dry-run mode

```jsonc
{
  "name": "generate_client_repo",
  "arguments": {
    "project_name": "pulse",
    "include_backend": false,
    "include_stripe": true,
    "style_reference_repos": ["my-org/my-app"],
    "dry_run": true
  }
}
```

When `dry_run: true`:
- Style references **are still read** (read-only) so the preview is style-accurate.
- The generator runs in memory — file list and content are produced.
- **No write API calls happen.** No repo, no branch, no commit, no PR.
- The tool returns a Markdown report containing the resolved style profile, a manifest
  of every file that *would* be written, and a 30-line / 2 KB preview of each file.

For a fully offline run (zero API calls of any kind), pass `style_reference_repos: []`
along with `dry_run: true`.

### How to test it safely

1. **Always start with `dry_run: true`** for a brand-new template or style-ref combination.
   Inspect the manifest and previews. Only when the output looks right do you run with
   `dry_run: false`.
2. **Use a sandbox account or test org** for the first non-dry runs (same as Phase 3).
3. **Spot-check the rationale** — the README's *"Why this structure?"* section should
   match what you expected. If it says "imports downgraded from absolute → relative
   because no reference repo configured path aliases", that means your style reference
   wasn't using `@/` aliases.
4. **Try contradictory references** to verify aggregation. Pass two refs where one uses
   PascalCase and the other kebab. Whichever convention has more component files wins —
   you'll see which in the rationale.

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
