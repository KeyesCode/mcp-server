# Learning notes

A companion to the README. The README tells you *how to run* the server;
this file tells you *what the pieces mean*.

---

## 1. Server lifecycle

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

Concretely, in this codebase:

1. The client (Claude Desktop, etc.) **spawns** `node dist/index.js`.
2. `src/index.ts` calls `buildServer()` and then `server.connect(transport)`.
3. The client sends `initialize` → server replies with its capabilities and
   server info → client sends `notifications/initialized`.
4. From here on, either side can send requests (`tools/call`,
   `resources/read`, `prompts/get`, `ping`, etc.) or notifications.
5. When the client closes stdin or sends SIGTERM, our `shutdown` handler
   in `index.ts` calls `server.close()` and we exit cleanly.

---

## 2. What "stdio transport" means

Stdio is the simplest transport MCP supports. The contract is:

- **stdin** — the server *reads* one JSON-RPC message per newline-terminated
  line.
- **stdout** — the server *writes* one JSON-RPC message per line.
- **stderr** — free for the server to log to. The client typically captures
  it for debugging but never parses it.

This is why our code uses `console.error(...)` everywhere instead of
`console.log(...)`. A stray `console.log` on stdout would inject garbage
into the JSON-RPC stream and the client would disconnect.

Stdio is great for **local** servers spawned by a desktop client. For
**remote** servers, MCP also defines a *streamable HTTP* transport — same
`McpServer` instance, different transport adapter.

---

## 3. Tools vs. resources vs. prompts (in detail)

### Tool

- **Purpose:** an action the LLM can decide to invoke.
- **Has a JSON Schema** describing its inputs.
- **Returns** an array of "content blocks" (`text`, `image`, `audio`,
  `resource`, etc.).
- **Examples in this repo:** `add_numbers`, `get_current_time`, `save_note`.

The LLM gets the tool list during the handshake; on each turn it can choose
to call any of them. The server validates the arguments against the schema,
runs the handler, and returns content the LLM then incorporates into its
reply.

### Resource

- **Purpose:** a read-only blob (text or binary) addressed by a URI.
- **Two flavours:**
  - **Static**: the URI is fixed (`server://status`).
  - **Templated**: the URI is a pattern (`notes://by-title/{title}`) — the
    SDK exposes `ResourceTemplate` for this. We don't use it here, but it's
    one of the first things you'll reach for as you grow the server.
- **Examples in this repo:** `notes://all`, `server://status`.

Clients usually surface resources to the *user* ("attach this to the
conversation"), not to the LLM directly.

### Prompt

- **Purpose:** a reusable, parameterised instruction template.
- **The server does not run the LLM** — it just returns a list of `messages`
  the client can hand off to whichever LLM it's using.
- **Examples in this repo:** `summarize_note`, `explain_mcp`.

Clients typically surface prompts in a slash-command menu, e.g.
`/summarize_note title=meeting-notes`.

---

## 4. JSON Schema validation for tool inputs

When you write:

```ts
inputSchema: {
  a: z.number().describe("First addend"),
  b: z.number().describe("Second addend"),
}
```

…the SDK does three things:

1. **At registration time:** converts your Zod shape into a JSON Schema and
   stores it on the tool descriptor.
2. **At `tools/list` time:** advertises that JSON Schema to the client, so
   the client (and the LLM) knows exactly what arguments are expected.
3. **At `tools/call` time:** validates the incoming `arguments` against the
   schema *before* invoking your handler. If validation fails, the SDK
   returns an error to the client and your handler never runs.

You can verify this by sending a malformed call and watching it bounce:

```jsonc
{"jsonrpc":"2.0","id":99,"method":"tools/call","params":{"name":"add_numbers","arguments":{"a":"not-a-number","b":3}}}
```

The same machinery applies to **prompt arguments** (`argsSchema`). Resources
do not validate inputs because resources are addressed by URI, not by a
JSON body.

---

## 5. Growing this prototype

Today this server reads and writes a single JSON file. The same skeleton
extends naturally:

| If you want…                  | Replace…                                  | Watch out for…                                |
| ----------------------------- | ----------------------------------------- | --------------------------------------------- |
| **A real database**           | `storage/notesStore.ts` with a SQLite or  | Connection pooling, async init, migrations.   |
|                               | Postgres driver.                          |                                                |
| **GitHub access**             | A new tool that calls the GitHub REST or  | Auth (PAT vs. OAuth), rate limits, pagination.|
|                               | GraphQL API via `fetch`.                  |                                                |
| **Stripe access**             | A tool wrapping the Stripe SDK.           | Idempotency keys, test vs. live keys, PCI.   |
| **The local filesystem**      | A `fs://` resource template + read/write  | Path traversal, symlinks, permission checks. |
|                               | tools.                                    |                                                |
| **An internal company API**   | A tool that fetches with a service token  | Where to load secrets from (env, keychain),  |
|                               | from `process.env`.                       | and never logging the token to stderr.        |
| **Streaming long responses**  | Use `progressToken` notifications and the | Backpressure, partial results on disconnect. |
|                               | streamable HTTP transport.                |                                                |

The pattern is always the same: **a tool is just an async function with a
typed schema**, and the SDK handles the wire protocol. The interesting part
is what the function does inside — that's where MCP servers earn their keep.

---

## 6. Useful next reads

- The **MCP specification**: <https://modelcontextprotocol.io/specification/>
- The **TypeScript SDK** (read `dist/esm/server/mcp.d.ts` for the API
  surface): <https://github.com/modelcontextprotocol/typescript-sdk>
- The **reference servers** (filesystem, git, GitHub, etc.):
  <https://github.com/modelcontextprotocol/servers>
- **JSON-RPC 2.0** (the wire protocol underneath everything):
  <https://www.jsonrpc.org/specification>
