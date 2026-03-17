---
title: "feat: Java LSP MCP Server for Claude Code"
type: feat
status: active
date: 2026-03-17
origin: docs/brainstorms/2026-03-17-java-lsp-mcp-server-brainstorm.md
---

# feat: Java LSP MCP Server for Claude Code

## Overview

A TypeScript MCP server that wraps Eclipse JDT Language Server, exposing Java code navigation tools (go-to-definition, find-references, call-hierarchy, etc.) for Claude Code. The server manages multiple JDT LS instances — one per Java project — with lazy initialization and auto-download of JDT LS on first run.

```
Claude Code ──stdio/MCP──► TypeScript MCP Server ──stdio/LSP──► Eclipse JDT LS ──► Java Project(s)
```

(see brainstorm: docs/brainstorms/2026-03-17-java-lsp-mcp-server-brainstorm.md)

## Problem Statement / Motivation

Navigating large Java codebases with `grep` and `Glob` is slow and imprecise. Java's type system (overloading, inheritance, generics) means text search produces false positives and misses semantic relationships. An LSP-backed server gives Claude the same navigation capabilities as an IDE — type-aware definition lookup, reference finding, call hierarchies — dramatically improving speed and accuracy on large projects.

## Proposed Solution

### Architecture

Three layers:

1. **MCP Layer** — Uses `@modelcontextprotocol/sdk` with stdio transport. Registers 8 tools + 1 status tool. Responds to MCP `initialize` immediately (never blocks on JDT LS).
2. **Instance Manager** — Manages multiple `JdtLsClient` instances keyed by project root. Handles lazy initialization, crash recovery, and concurrent access.
3. **LSP Client** — Uses `vscode-languageserver-protocol` + `vscode-jsonrpc/node` to communicate with JDT LS child processes over stdio.

### Key Libraries

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | MCP server framework (stdio transport) |
| `vscode-languageserver-protocol` | LSP message types (NOT `vscode-languageclient` — that depends on VS Code) |
| `vscode-jsonrpc` | JSON-RPC connection over child process stdio |
| `zod` | Tool input schema validation |
| `glob` | Find launcher JAR dynamically |
| `tar` | Extract JDT LS download |

## Technical Approach

### Phase 1: Foundation (Core Infrastructure)

Get a working end-to-end pipeline: MCP server starts, JDT LS spawns, one tool works.

#### 1.1 Project Scaffolding

- `src/index.ts` — Entry point: create MCP server, register tools, start stdio transport
- `package.json` — `type: "module"`, bin entry, dependencies
- `tsconfig.json` — ES2022 target, Node16 module resolution, strict mode
- `.mcp.json` — Project-scoped MCP config for testing with Claude Code

**`package.json` key fields:**
```json
{
  "name": "java-lsp-mcp-server",
  "type": "module",
  "bin": { "java-lsp-mcp-server": "./dist/index.js" },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.x",
    "vscode-languageserver-protocol": "^3.x",
    "vscode-jsonrpc": "^8.x",
    "zod": "^3.x",
    "glob": "^11.x",
    "tar": "^7.x"
  }
}
```

#### 1.2 JDT LS Downloader (`src/jdtls/downloader.ts`)

- Check if JDT LS exists in `~/.java-lsp-mcp/jdtls/`
- If not, download from `https://download.eclipse.org/jdtls/milestones/{version}/`
- Use `latest.txt` to resolve exact filename (avoids hardcoding timestamps)
- Extract tar.gz to cache directory
- Verify extraction by checking for `plugins/org.eclipse.equinox.launcher_*.jar`

**Error cases:**
- Network failure → clear error: "Failed to download JDT LS. Check internet connection."
- Disk space → check available space before download (~100MB needed)
- Corrupt archive → delete and retry once

#### 1.3 Java Version Check (`src/jdtls/java-check.ts`)

- Run `java -version` (check PATH first, then JAVA_HOME)
- Parse output for version number
- Require Java 21+ (JDT LS 1.57.0 requirement — see brainstorm)
- Return clear error: "Java 21+ required but found Java {version}" or "Java not found. Install JDK 21+ and ensure `java` is on PATH or set JAVA_HOME."

#### 1.4 LSP Client (`src/lsp/client.ts`)

Core class that manages a single JDT LS child process:

```
class JdtLsClient {
  constructor(projectRoot: string, jdtlsHome: string, dataDir: string)
  async start(): Promise<void>      // spawn + initialize handshake
  async stop(): Promise<void>       // shutdown + exit
  isReady(): boolean
  async getDefinition(file, line, col): Promise<Location[]>
  async getReferences(file, line, col): Promise<Location[]>
  // ... other LSP methods
}
```

**Spawn arguments for JDT LS:**
```
java
  -Declipse.application=org.eclipse.jdt.ls.core.id1
  -Dosgi.bundles.defaultStartLevel=4
  -Declipse.product=org.eclipse.jdt.ls.core.product
  -Xmx1G
  --add-modules=ALL-SYSTEM
  --add-opens java.base/java.util=ALL-UNNAMED
  --add-opens java.base/java.lang=ALL-UNNAMED
  -jar plugins/org.eclipse.equinox.launcher_*.jar
  -configuration config_win|config_linux|config_mac
  -data {unique-per-project-data-dir}
```

**LSP Initialization handshake:**
1. Send `initialize` request with `rootUri`, `workspaceFolders`, and capabilities declaring support for definition, references, hover, rename, implementation, callHierarchy, diagnostics, workspaceSymbol
2. Wait for `InitializeResult`
3. Send `initialized` notification
4. JDT LS begins indexing — monitor via `$/progress` notifications or `window/logMessage`

**Critical: `-data` directory must be unique per project root.** Store at `~/.java-lsp-mcp/workspaces/{hash-of-project-root}/`.

#### 1.5 File Synchronization

**Pattern: open-query-close per request.**
- Before any LSP query, send `textDocument/didOpen` with the file's current disk content
- After receiving the response, send `textDocument/didClose`
- This ensures JDT LS always sees fresh file content and avoids memory leaks from accumulated open files

**Line/column convention decision:**
- **Tool inputs accept 1-based** line and column numbers (matches what Claude sees in `Read` tool output)
- **Convert to 0-based** internally for LSP protocol
- **Tool outputs return 1-based** line and column numbers

#### 1.6 MCP Server Shell (`src/index.ts`)

```typescript
const server = new McpServer({ name: "java-lsp", version: "1.0.0" });
// Register all tools
// Start stdio transport
// CRITICAL: never use console.log — stdout is JSON-RPC only
// All logging goes to console.error (stderr)
```

**Deliverable:** `go_to_definition` tool works end-to-end against a real Java project.

---

### Phase 2: Instance Manager (Multi-Project Support)

#### 2.1 Instance Manager (`src/lsp/manager.ts`)

```
class InstanceManager {
  private instances: Map<string, JdtLsClient>
  private initializing: Map<string, Promise<JdtLsClient>>  // dedup concurrent init

  async getInstance(filePath: string, explicitRoot?: string): Promise<JdtLsClient>
  async closeInstance(projectRoot: string): void
  async closeAll(): void
}
```

**Project root detection** (`src/utils/project-detect.ts`):
- Walk up from file path looking for `pom.xml` or `build.gradle`
- For multi-module projects: use the **topmost** project root (parent pom) so JDT LS can resolve cross-module dependencies
- If both `pom.xml` and `build.gradle` exist at the same level, prefer `pom.xml` (more common in practice; Gradle projects rarely have both at the same level)
- If no project root found: return clear error "No Java project found. Expected pom.xml or build.gradle in a parent directory of {filePath}."

**Lazy initialization with deduplication:**
- When `getInstance` is called for a not-yet-initialized project, store the initialization Promise in `initializing` map
- Concurrent calls for the same project await the same Promise (no duplicate spawns)
- On completion, move from `initializing` to `instances`

**Initialization blocking behavior decision:**
- Tool calls **block until JDT LS is ready**, with a 120-second timeout
- While blocking, the tool returns progress via MCP's logging capability: `"Initializing JDT LS for project {name}... This typically takes 10-30 seconds."`
- If timeout is exceeded, return error: "JDT LS initialization timed out after 120 seconds."

**Crash recovery:**
- Listen for child process `exit` event
- Mark instance as dead in the map
- On next tool call, detect dead instance and auto-restart (max 3 restarts per project per session)
- After 3 failures: "JDT LS for {project} has crashed repeatedly. Check Java installation and project configuration."

#### 2.2 Concurrency Model

**Serialize all LSP requests per JDT LS instance** using an async mutex/queue. Rationale: simpler, safer, avoids race conditions in didOpen/didClose. LSP technically supports concurrent requests, but serialization is correct for v1.

```typescript
class JdtLsClient {
  private queue: AsyncMutex;

  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.queue.acquire();
    try { return await fn(); }
    finally { release(); }
  }
}
```

---

### Phase 3: All Tools

#### 3.1 Tool Definitions

All tools share common input patterns. Define shared schemas:

```typescript
// Shared position input (1-based, converted to 0-based internally)
const positionInput = z.object({
  filePath: z.string().describe("Absolute path to the Java source file"),
  line: z.number().int().min(1).describe("Line number (1-based)"),
  column: z.number().int().min(1).describe("Column number (1-based)"),
  projectRoot: z.string().optional().describe("Project root path. Auto-detected if omitted."),
});
```

#### Tool: `java_go_to_definition`
- Input: `positionInput`
- Flow: didOpen → `textDocument/definition` → didClose → format
- Output: List of definition locations with file path, line, column, and 3 lines of code context
- Handle `jdt://` URIs: use JDT LS's `java/classFileContents` custom request to retrieve decompiled source for library code. Return the content inline with a note: "Source from dependency: {jar-name}"

#### Tool: `java_find_references`
- Input: `positionInput`
- Flow: didOpen → `textDocument/references` (includeDeclaration: true) → didClose → format
- Output: List of reference locations, grouped by file
- **Large result sets:** Return first 50 results. If more exist, append: "Showing 50 of {total} references. Results truncated."

#### Tool: `java_get_diagnostics`
- Input: `{ filePath, projectRoot? }`
- Flow: Register `publishDiagnostics` handler → didOpen → wait for notification (timeout: 10s) → didClose → format
- Output: List of diagnostics with severity, message, line, column
- The wait uses a Promise that resolves when diagnostics notification arrives for this URI, with a 10-second timeout

#### Tool: `java_get_hover`
- Input: `positionInput`
- Flow: didOpen → `textDocument/hover` → didClose → format
- Output: Type information and Javadoc as markdown

#### Tool: `java_rename_symbol`
- Input: `positionInput` + `{ newName: string }`
- Flow: didOpen → `textDocument/rename` → didClose → format as preview
- Output: **Preview only** — list of files and the specific text edits that would be applied. Claude applies changes using its Edit tool. Format as a readable diff.

#### Tool: `java_get_implementations`
- Input: `positionInput`
- Flow: didOpen → `textDocument/implementation` → didClose → format
- Output: List of implementing classes/methods with locations and context

#### Tool: `java_get_call_hierarchy`
- Input: `positionInput` + `{ direction: "incoming" | "outgoing" }`
- Flow: didOpen → `prepareCallHierarchy` → `incomingCalls` or `outgoingCalls` → didClose → format
- Output: Tree structure showing callers (who calls this?) or callees (what does this call?)

#### Tool: `java_get_workspace_symbols`
- Input: `{ query: string, projectRoot?: string }`
- Flow: `workspace/symbol` → format
- Output: Matching symbols with kind (class/method/field/etc.), file path, line number
- No didOpen needed — workspace symbols search across the entire project index

#### Tool: `java_lsp_status`
- Input: `{}` (no parameters)
- Output: JSON listing all active JDT LS instances with: project root, status (ready/initializing/error), uptime

#### 3.2 Output Formatting (`src/utils/formatter.ts`)

All tools return `content: [{ type: "text", text: "..." }]` with human-readable formatted text.

**Location format:**
```
src/main/java/com/example/UserService.java:42:10
  40 |   public void processUser(User user) {
  41 |     validate(user);
> 42 |     repository.save(user);
  43 |     notifyListeners(user);
  44 |   }
```

- 3 lines of context before and after the target line
- `>` marker on the target line
- For `jdt://` URIs (library code), show decompiled source with a header note

**Empty results:** Return "No {definition|references|implementations} found at {filePath}:{line}:{column}."

**Error format:** All errors use `isError: true` with a clear message. Error taxonomy:
- `PROJECT_NOT_FOUND` — No pom.xml/build.gradle found
- `JAVA_NOT_INSTALLED` — Java not found or wrong version
- `JDTLS_INITIALIZING` — Still starting up (only if timeout hit)
- `JDTLS_CRASHED` — Instance died, restart failed
- `REQUEST_TIMEOUT` — LSP request took too long (30s per-request timeout)
- `NO_RESULTS` — Not an error, just informational empty result
- `INVALID_POSITION` — Line/column out of range

---

### Phase 4: Polish and Robustness

#### 4.1 Windows Support
- Path handling: normalize `\` to `/` for file URIs (`file:///C:/...`)
- JDT LS config: use `config_win` directory
- MCP registration: document `cmd /c` wrapper for npx on Windows

#### 4.2 Logging (`src/utils/logger.ts`)
- All output to `console.error` (stderr) — never console.log
- Debug mode via `JAVA_LSP_DEBUG=true` environment variable
- Log: JDT LS spawn/exit events, LSP request/response timing, initialization progress

#### 4.3 Graceful Shutdown
- Listen for MCP server disconnect / process signals (SIGTERM, SIGINT)
- Shut down all JDT LS instances (5-second timeout per instance)
- Force-kill any instances that don't respond

#### 4.4 Request Timeouts
- 30-second timeout per individual LSP request
- 120-second timeout for initialization
- 10-second timeout for diagnostics notification

#### 4.5 Input Validation
- Verify file exists on disk before sending to LSP
- Validate line/column are positive integers
- Validate filePath is absolute

#### 4.6 Workspace Data Cleanup
- Store workspace data in `~/.java-lsp-mcp/workspaces/{hash}/`
- No automatic cleanup in v1 (user can manually delete)
- Log data directory location on first init for discoverability

## System-Wide Impact

- **Interaction graph:** Claude Code calls MCP tool → MCP server sends LSP request → JDT LS reads/indexes Java files → response flows back. No side effects on the Java project (except for rename_symbol if applied).
- **Error propagation:** LSP errors → caught in JdtLsClient → returned as `isError: true` MCP responses. Child process crashes → detected via exit event → auto-restart.
- **State lifecycle risks:** Partial JDT LS initialization could leave instance in bad state. Mitigated by tracking state explicitly (initializing/ready/error/dead) and not exposing partially-initialized instances to tools.
- **API surface parity:** All 8 navigation tools + 1 status tool. Rename is preview-only by design.

## Acceptance Criteria

### Functional Requirements

- [x] MCP server starts and responds to Claude Code's initialize handshake immediately
- [x] JDT LS auto-downloads on first run to `~/.java-lsp-mcp/jdtls/`
- [x] Java version check returns clear error if Java 21+ not found
- [x] `java_go_to_definition` returns correct definition location with code context
- [x] `java_find_references` returns all references, truncated at 50 with count
- [x] `java_get_diagnostics` returns compilation errors/warnings for a file
- [x] `java_get_hover` returns type info and Javadoc
- [x] `java_rename_symbol` returns preview of all edits without modifying files
- [x] `java_get_implementations` returns implementing classes/methods
- [x] `java_get_call_hierarchy` returns incoming or outgoing call tree
- [x] `java_get_workspace_symbols` searches symbols across the project
- [x] `java_lsp_status` reports active instances and their state
- [x] Multi-project: tools work across different project roots simultaneously
- [x] Auto-detect project root from file path (walk up to pom.xml/build.gradle)
- [x] Multi-module Maven/Gradle projects: uses topmost project root
- [x] Line/column: accepts 1-based input, returns 1-based output
- [x] Library navigation: `jdt://` URIs resolved via `java/classFileContents`

### Non-Functional Requirements

- [x] MCP initialize response in < 1 second (JDT LS starts in background)
- [x] Per-request LSP timeout: 30 seconds
- [x] Initialization timeout: 120 seconds
- [x] Crash recovery: auto-restart up to 3 times per project per session
- [x] Works on Windows, macOS, and Linux

### Quality Gates

- [ ] End-to-end test: go_to_definition works on a sample Maven project
- [ ] End-to-end test: go_to_definition works on a sample Gradle project
- [ ] Error test: clear message when Java is not installed
- [ ] Error test: clear message when file is not in a Java project
- [ ] Tested in Claude Code via `/mcp` verification

## Dependencies & Prerequisites

- **Java 21+** installed on the system
- **Node.js 18+** for running the MCP server
- **Internet access** for first-run JDT LS download (~50MB)

## Risk Analysis & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| JDT LS initialization too slow (>30s) | Claude appears unresponsive | Block with progress logging; 120s timeout; inform user |
| JDT LS memory usage (~1GB per instance) | System runs out of RAM | Document resource requirements; no enforced limit per brainstorm decision |
| JDT LS crashes frequently | Tools become unusable | Auto-restart with 3-attempt limit; clear error messages |
| `vscode-languageclient` confusion | Wrong package used, VS Code dependency | Documented clearly: use `vscode-languageserver-protocol` only |
| Windows path handling bugs | Tools fail on Windows | Normalize paths early; test on Windows |
| MCP SDK version changes (v1 vs v2) | Import paths break | Pin SDK version; document which version is used |

## Project Structure

```
java-lsp/
  src/
    index.ts                    # MCP server entry point
    tools/
      definition.ts             # java_go_to_definition
      references.ts             # java_find_references
      diagnostics.ts            # java_get_diagnostics
      hover.ts                  # java_get_hover
      rename.ts                 # java_rename_symbol
      implementations.ts        # java_get_implementations
      call-hierarchy.ts         # java_get_call_hierarchy
      workspace-symbols.ts      # java_get_workspace_symbols
      status.ts                 # java_lsp_status
    lsp/
      client.ts                 # JdtLsClient: single JDT LS instance wrapper
      manager.ts                # InstanceManager: multi-project routing
      protocol.ts               # LSP capability declarations, shared types
    jdtls/
      downloader.ts             # Auto-download and extract JDT LS
      java-check.ts             # Verify Java 21+ is installed
    utils/
      formatter.ts              # Format LSP responses for Claude
      project-detect.ts         # Walk up to find pom.xml/build.gradle
      uri.ts                    # File path <-> URI conversion
      logger.ts                 # Stderr-safe logging
  package.json
  tsconfig.json
  .mcp.json                     # MCP config for local testing
```

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-03-17-java-lsp-mcp-server-brainstorm.md](../brainstorms/2026-03-17-java-lsp-mcp-server-brainstorm.md) — Key decisions carried forward: TypeScript + MCP SDK, multi-project with lazy init, 8 tools, auto-download JDT LS, preview-only rename, auto-detect projects.

### External References

- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Server Build Guide](https://modelcontextprotocol.io/docs/develop/build-server)
- [Claude Code MCP Docs](https://code.claude.com/docs/en/mcp)
- [Eclipse JDT LS](https://github.com/eclipse-jdtls/eclipse.jdt.ls)
- [JDT LS Command Line Wiki](https://github.com/eclipse-jdtls/eclipse.jdt.ls/wiki/Running-the-JAVA-LS-server-from-the-command-line)
- [vscode-languageserver-protocol](https://github.com/microsoft/vscode-languageserver-node)
- [LSP Specification 3.17](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/)
