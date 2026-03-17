# java-lsp-mcp-server

MCP server that gives Claude Code IDE-quality Java code navigation via Eclipse JDT Language Server.

## What It Does

Instead of relying on grep/glob to search Java code by text patterns, this MCP server provides **type-aware navigation** — go to definition, find references, get implementations, and more — powered by the same language engine used by VS Code and Eclipse.

```
Claude Code  --MCP/stdio-->  java-lsp-mcp-server  --LSP/stdio-->  Eclipse JDT LS  -->  Your Java Project
```

## Prerequisites

- **Java 21+** (JDK) — on PATH or via `JAVA_HOME`
- **Node.js 18+**

## Installation

```bash
git clone https://github.com/AIDevelopmentTools/java-lsp-mcp-server.git
cd java-lsp-mcp-server
npm install
npm run build
```

## Configuration

### 1. Register the MCP server

Add a `.mcp.json` file to the root of your Java project:

```json
{
  "mcpServers": {
    "java-lsp": {
      "command": "node",
      "args": ["/absolute/path/to/java-lsp-mcp-server/dist/index.js"]
    }
  }
}
```

Replace `/absolute/path/to/java-lsp-mcp-server` with the actual path where you cloned the repo.

### 2. Add CLAUDE.md to your Java project

Copy the `CLAUDE.md` from this repo into your Java project root. This tells Claude to use the MCP tools for Java navigation instead of defaulting to grep.

```bash
cp /path/to/java-lsp-mcp-server/CLAUDE.md /path/to/your-java-project/CLAUDE.md
```

Without this file, Claude will still have access to the tools but won't know to prefer them over grep/glob. See [CLAUDE.md](CLAUDE.md) for the full content.

## Tools

| Tool | Description | Key Inputs |
|------|-------------|------------|
| `java_go_to_definition` | Jump to the definition of a class, method, field, or variable | `filePath`, `line`, `column` |
| `java_find_references` | Find all locations where a symbol is used | `filePath`, `line`, `column` |
| `java_get_implementations` | Find implementing classes, subclasses, and method overrides | `filePath`, `line`, `column` |
| `java_get_hover` | Get type info, Javadoc, and method signatures | `filePath`, `line`, `column` |
| `java_get_call_hierarchy` | Get incoming callers or outgoing callees of a method | `filePath`, `line`, `column`, `direction` |
| `java_get_workspace_symbols` | Search for symbols by name across the entire project | `query`, `projectRoot` |
| `java_get_diagnostics` | Get compilation errors, warnings, and hints for a file | `filePath` |
| `java_rename_symbol` | Preview what a rename refactoring would change (does not modify files) | `filePath`, `line`, `column`, `newName` |
| `java_lsp_status` | Check status of all active JDT LS instances | _(none)_ |

All position-based tools accept 1-based `line` and `column` numbers (matching the output of Claude's Read tool). The optional `projectRoot` parameter is auto-detected by walking up from `filePath` to find `pom.xml` or `build.gradle`.

## Examples

### Go to definition

**Input:**
```json
{
  "filePath": "/home/user/myapp/src/main/java/com/example/OrderService.java",
  "line": 42,
  "column": 15
}
```

**Output:**
```
/home/user/myapp/src/main/java/com/example/repository/OrderRepository.java:18:1
  15 | import java.util.Optional;
  16 |
  17 | @Repository
> 18 | public interface OrderRepository extends JpaRepository<Order, Long> {
  19 |
  20 |     Optional<Order> findByOrderNumber(String orderNumber);
  21 |
```

### Find references

**Input:**
```json
{
  "filePath": "/home/user/myapp/src/main/java/com/example/model/Order.java",
  "line": 12,
  "column": 20
}
```

**Output:**
```
Found 4 reference(s):

/home/user/myapp/src/main/java/com/example/service/OrderService.java:
  Line 31:5
  Line 58:12

/home/user/myapp/src/main/java/com/example/controller/OrderController.java:
  Line 24:9

/home/user/myapp/src/main/java/com/example/repository/OrderRepository.java:
  Line 18:52
```

## How It Works

- **Auto-download:** On first use, the server downloads Eclipse JDT LS v1.43.0 (~50MB) to `~/.java-lsp-mcp/jdtls/`. No manual setup needed.
- **One instance per project:** Each Java project gets its own JDT LS process, lazily started on first tool call. Workspace data is stored in `~/.java-lsp-mcp/workspaces/`.
- **Project detection:** The server walks up from the file path to find the topmost `pom.xml` or `build.gradle`/`build.gradle.kts`, so multi-module projects work correctly.
- **Crash recovery:** If a JDT LS instance crashes, it automatically restarts on the next tool call (up to 3 times per session).

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `Java not found` error | Install JDK 21+ and ensure `java` is on PATH, or set `JAVA_HOME` |
| First tool call is slow | JDT LS is downloading (~50MB) and indexing your project. Subsequent calls are fast. |
| "Initializing" status for a long time | Large projects can take 1-2 minutes for initial indexing. Check with `java_lsp_status`. |
| No definition/references found | The file may have compilation errors. Run `java_get_diagnostics` to check. |
| Stale results after code changes | JDT LS picks up saved file changes automatically. Make sure the file is saved. |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `JAVA_HOME` | Path to JDK installation. If set, uses `$JAVA_HOME/bin/java` instead of `java` from PATH. |
| `JAVA_LSP_DEBUG` | Set to `true` to enable verbose debug logging to stderr. |

## License

MIT
