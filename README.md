# mcp-learning-server

A small, well-commented **Model Context Protocol** (MCP) server written in
TypeScript. Built to be read top-to-bottom rather than to be a production
template — every file has comments explaining *why* the code looks the way
it does.

---

## What is MCP?

**MCP (Model Context Protocol)** is an open protocol that lets an AI client
(like Claude Desktop, Claude Code, or Cursor) talk to *external* programs
that expose **tools**, **resources**, and **prompts** over a JSON-RPC
connection. The protocol standardises the handshake, so any MCP-compatible
client can use any MCP-compatible server.

You can think of MCP as "USB-C for LLMs": one cable, many devices.

### Tools vs. Resources vs. Prompts

| Concept     | Who initiates? | Has side effects? | Mental model                                    |
| ----------- | -------------- | ----------------- | ----------------------------------------------- |
| **Tool**    | The LLM        | Usually yes       | "A function the LLM can call."                   |
| **Resource**| The user/client| No (read-only)    | "A file or page the client can attach to chat."  |
| **Prompt**  | The user       | No                | "A reusable, parameterised instruction template."|

This server demonstrates all three.

---

## Project layout

```
src/
  index.ts              # boot + stdio transport
  server.ts             # builds McpServer, wires everything up, logging helpers
  tools/
    addNumbers.ts       # add_numbers
    getCurrentTime.ts   # get_current_time
    saveNote.ts         # save_note (writes to data/notes.json)
  resources/
    notesResource.ts    # notes://all
    statusResource.ts   # server://status
  prompts/
    summarizeNote.ts    # summarize_note
    explainMcp.ts       # explain_mcp
  storage/
    notesStore.ts       # tiny JSON-file "database"
  types/
    note.ts             # Note interface
docs/
  learning-notes.md     # deeper notes on MCP concepts
data/
  notes.json            # auto-created on first save
```

---

## Run it

```bash
npm install
npm run build      # compile TypeScript → dist/
npm start          # run the compiled server
# or
npm run dev        # run from src/ with tsx watch (auto-reload)
```

The server speaks **stdio** — it does nothing visible until a client (or your
terminal) sends it JSON-RPC frames. Logs go to **stderr** so they cannot
corrupt the JSON-RPC stream on stdout.

---

## Test it from the terminal

You can pipe raw JSON-RPC at the server to confirm it works without any
client. Each line is one frame.

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"add_numbers","arguments":{"a":2,"b":3}}}' \
  | node dist/index.js
```

Expected response for the `add_numbers` call (id=3):

```json
{"result":{"content":[{"type":"text","text":"2 + 3 = 5"}]},"jsonrpc":"2.0","id":3}
```

A few more frames to try:

```jsonc
// Save a note
{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"save_note","arguments":{"title":"hello","body":"world"}}}

// Read every note back
{"jsonrpc":"2.0","id":11,"method":"resources/read","params":{"uri":"notes://all"}}

// Server status
{"jsonrpc":"2.0","id":12,"method":"resources/read","params":{"uri":"server://status"}}

// Build a "summarize this note" prompt
{"jsonrpc":"2.0","id":13,"method":"prompts/get","params":{"name":"summarize_note","arguments":{"title":"hello"}}}
```

---

## Connect it to Claude Desktop

Edit Claude Desktop's MCP config (path varies by OS — on macOS it's
`~/Library/Application Support/Claude/claude_desktop_config.json`) and add an
entry under `mcpServers`:

```json
{
  "mcpServers": {
    "learning-server": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You should see the server's tools, resources, and
prompts available in the UI.

### Claude Code

```bash
claude mcp add learning-server -- node /absolute/path/to/mcp-server/dist/index.js
```

---

## What to study next

1. **Read `docs/learning-notes.md`** in this repo — it goes deeper on the
   server lifecycle, stdio framing, JSON Schema validation, and how to grow
   this prototype into something that wraps a real system.
2. **The MCP spec**: <https://modelcontextprotocol.io/> — short and readable.
3. **The TypeScript SDK source**: `node_modules/@modelcontextprotocol/sdk/`
   — the `server/mcp.ts` file is the easiest entrypoint.
4. **Reference servers** (filesystem, git, GitHub, Postgres) at
   <https://github.com/modelcontextprotocol/servers> — pattern-match against
   real-world implementations.
5. **Streamable HTTP transport** — once stdio makes sense, look at how the
   same `McpServer` instance can be hosted over HTTP for remote clients.
