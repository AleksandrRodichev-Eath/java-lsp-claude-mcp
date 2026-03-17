# Brainstorm: Java LSP MCP Server

**Date:** 2026-03-17
**Status:** Draft

## What We're Building

An MCP (Model Context Protocol) server written in **TypeScript** that wraps **Eclipse JDT Language Server** to give Claude intelligent Java code navigation capabilities. The server exposes LSP features as MCP tools, enabling Claude to navigate large Java codebases with semantic understanding — go-to-definition, find-references, call hierarchies, and more.

### Architecture

```
Claude Code ──stdio/MCP──► TypeScript MCP Server ──stdio/LSP──► Eclipse JDT LS ──► Java Project(s)
```

The MCP server acts as a bridge: it translates MCP tool calls into LSP protocol requests, manages JDT LS instance lifecycles, and formats LSP responses into Claude-friendly output.

### Multi-Project Support

The server manages **multiple JDT LS instances**, one per Java project root. Instances are created lazily — when a tool is first called with a new `projectRoot`, a JDT LS process is spawned and initialized for that project. This supports microservices architectures and multi-repo workflows.

## Why This Approach

- **Semantic navigation beats text search:** `grep` finds text matches; LSP finds the *actual* definition, respecting Java's type system, overloading, and inheritance. For large codebases (100k+ LOC), this dramatically reduces noise and false positives.
- **Multi-project flexibility:** Real-world Java work often spans multiple services. Being able to query across projects without restarting the server removes friction.
- **Auto-managed lifecycle:** Zero manual setup — the MCP server handles downloading, starting, and stopping JDT LS instances automatically.
- **TypeScript + official MCP SDK:** Best ecosystem support, most documentation and examples, fastest path to a working server.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Implementation language | TypeScript | Best MCP SDK support, most examples |
| LSP server | Eclipse JDT LS | Industry standard, powers VS Code Java, supports Maven + Gradle |
| Transport (MCP) | stdio | Standard for Claude Code MCP servers |
| Transport (LSP) | stdio (child process) | Simplest — spawn JDT LS as child process per project |
| Project model | Multi-project, lazy init | Flexibility for microservices; instances created on first use |
| Tool scope | 8 tools (see below) | Covers navigation, diagnostics, refactoring, and search |
| JDT LS distribution | Auto-download on first run | Downloaded to ~/.java-lsp-mcp/ cache, zero manual setup |
| Max instances | No limit | User manages their own resources |
| Rename behavior | Preview only | Shows what would change; Claude uses Edit tool to apply |
| Project discovery | Auto-detect | Scans for pom.xml / build.gradle to find project roots |

## Tools

### 1. `go_to_definition`
- **Input:** file path, line, column (cursor position)
- **Output:** definition location(s) — file path, line, column, preview of the code
- **LSP method:** `textDocument/definition`

### 2. `find_references`
- **Input:** file path, line, column
- **Output:** list of all locations where the symbol is used
- **LSP method:** `textDocument/references`

### 3. `get_diagnostics`
- **Input:** file path
- **Output:** compilation errors, warnings, and hints with locations and messages for that file
- **LSP flow:** Open the file via `textDocument/didOpen`, then collect `textDocument/publishDiagnostics` notifications pushed by JDT LS (this is server-initiated, not a request — the tool must listen for the async notification after triggering analysis)

### 4. `get_hover`
- **Input:** file path, line, column
- **Output:** type information, Javadoc, method signatures
- **LSP method:** `textDocument/hover`

### 5. `rename_symbol`
- **Input:** file path, line, column, new name
- **Output:** list of all file edits that would be made (preview only — Claude applies via Edit tool)
- **LSP method:** `textDocument/rename`

### 6. `get_implementations`
- **Input:** file path, line, column (on a class, interface, or method)
- **Output:** all implementing classes/methods
- **LSP method:** `textDocument/implementation`

### 7. `get_call_hierarchy`
- **Input:** file path, line, column, direction (incoming/outgoing)
- **Output:** tree of callers or callees
- **LSP methods:** `textDocument/prepareCallHierarchy` → `callHierarchy/incomingCalls` or `callHierarchy/outgoingCalls`

### 8. `get_workspace_symbols`
- **Input:** query string (e.g., class name, method name), optional project root
- **Output:** matching symbols across the project with locations and kinds
- **LSP method:** `workspace/symbol`

## Technical Details

### JDT LS Management
- **Download:** Auto-download JDT LS release on first run to `~/.java-lsp-mcp/`
- **Startup:** Spawn as child process with stdio transport
- **Initialization:** Send LSP `initialize` with project root as workspace folder
- **Ready detection:** Wait for `initialized` response + initial indexing to complete. First-time init takes 10-30+ seconds for large projects — tools should report "initializing project..." status while waiting
- **Shutdown:** Graceful `shutdown` → `exit` when MCP server stops or project is closed
- **Memory:** Each instance uses ~500MB-1GB RAM; no enforced limit (user's responsibility)

### File Synchronization
- JDT LS needs to know about file contents. For read-only queries (definition, references, hover), we `textDocument/didOpen` the file before querying
- For `rename_symbol`, JDT LS returns a `WorkspaceEdit` describing all changes — we format this as a human-readable preview (no files modified on disk)

### Project Routing
- Each tool accepts an optional `projectRoot` parameter; if omitted, the server auto-detects which project a file belongs to by walking up from the file path to find the nearest pom.xml / build.gradle
- This determines which JDT LS instance handles the request (or triggers lazy initialization of a new one)

### Prerequisites
- **Java 21+** must be installed and available on PATH — JDT LS requires it to run

### Output Formatting
- LSP responses contain URIs and positions — translate these to human-readable file paths and line numbers
- Include code snippets around the target location for context
- For large result sets (e.g., 500 references), paginate or summarize

## Resolved Questions

1. **JDT LS distribution:** Auto-download on first run to `~/.java-lsp-mcp/` cache directory.
2. **Max concurrent instances:** No limit — user manages their own resources.
3. **rename_symbol behavior:** Preview only — shows what would change, Claude applies edits itself.
4. **Project discovery:** Auto-detect by scanning for pom.xml / build.gradle.

## Out of Scope (for now)

- Code completion / IntelliSense (not useful for Claude's workflow)
- Code actions / quick fixes (could add later)
- Debugging integration
- File watching / live diagnostics (JDT LS does this, but Claude works in request/response)
- Web UI or dashboard
