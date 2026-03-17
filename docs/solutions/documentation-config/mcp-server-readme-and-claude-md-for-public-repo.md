---
title: "Add README.md and CLAUDE.md documentation for java-lsp-mcp-server"
category: documentation-config
date: 2026-03-17
tags:
  - documentation
  - readme
  - claude-md
  - mcp-server
  - onboarding
  - developer-experience
severity: medium
component: "project root (README.md, CLAUDE.md)"
---

# Add README.md and CLAUDE.md for MCP Server Public Repo

## Problem

The `java-lsp-mcp-server` (a TypeScript MCP server wrapping Eclipse JDT LS for Java code navigation) was fully implemented but had zero documentation. This caused two issues:

1. **Users can't onboard.** Without README.md, nobody knows how to install, configure, or use the server.
2. **Claude ignores the MCP tools.** Without CLAUDE.md, Claude defaults to grep/glob for Java code navigation instead of using the semantically accurate MCP tools. The tools are invisible to Claude without explicit instructions.

## Root Cause

The project was built implementation-first without documentation. For MCP servers specifically, documentation is not supplementary — **CLAUDE.md is the interface**. Without it, the tools functionally don't exist from Claude's perspective.

## Solution

Created two separate files at the repo root, each targeting a different audience:

### 1. README.md (for humans)

Structured for Claude Code users who already know what MCP is:

- **Architecture diagram:** `Claude Code → MCP/stdio → java-lsp-mcp-server → LSP/stdio → Eclipse JDT LS → Java Project`
- **Prerequisites:** Java 21+, Node.js 18+
- **Installation:** `git clone` + `npm install` + `npm run build`
- **Configuration:** `.mcp.json` snippet with absolute path placeholder, plus instructions to copy CLAUDE.md into target Java projects
- **Tools table:** All 9 tools with descriptions and key inputs
- **Examples:** Two realistic tool call/output pairs (go-to-definition, find-references) modeled on `src/utils/formatter.ts` output patterns
- **How it works:** Auto-download of JDT LS v1.43.0, one instance per project, project detection via pom.xml/build.gradle, crash recovery
- **Troubleshooting** and **environment variables** tables

### 2. CLAUDE.md (for Claude)

Self-contained file designed to be copied into any Java project root:

```markdown
# Java LSP MCP Server

## Code Navigation

When working with Java source files in this project, prefer the `java_*` MCP tools
over grep/glob for code navigation.

### Available tools
- java_go_to_definition — Jump to where a class/method/field is defined
- java_find_references — Find all usages of a symbol
- java_get_implementations — Find implementing classes/overriding methods
- java_get_hover — Get type info and Javadoc
- java_get_call_hierarchy — Trace incoming/outgoing calls
- java_get_workspace_symbols — Search symbols by name across the project
- java_get_diagnostics — Check compilation errors/warnings
- java_rename_symbol — Preview rename refactoring (no file modification)
- java_lsp_status — Check JDT LS instance status

### When to use grep/glob instead
- String literals, log messages, TODO comments
- Non-Java files (XML, properties, YAML)
- Finding files by name pattern
- Text-based searches where semantic understanding isn't needed

### Tips
- Line/column numbers are 1-based (matching Read tool output)
- projectRoot is auto-detected from filePath
- First use per project takes 1-2 minutes for JDT LS to index
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Separate files (README + CLAUDE.md) | Different audiences: humans vs Claude. Users copy CLAUDE.md independently. |
| "Prefer MCP, allow grep" | Grep is still better for text searches, non-Java files, string literals. Not absolute. |
| Clone + build installation | No npm publish yet. Simple and transparent. |
| Tool descriptions from source | Sourced from actual `src/tools/*.ts` registrations to stay accurate. |
| Example outputs from formatter patterns | Modeled on `src/utils/formatter.ts` to show realistic output. |

## Prevention Strategies

### For MCP server projects

1. **Treat CLAUDE.md as a functional requirement.** Without it, Claude doesn't know the tools exist. Add CLAUDE.md to project scaffolding from commit zero.

2. **Write CLAUDE.md entries alongside tool code.** When you register a new tool handler, immediately draft the CLAUDE.md entry. Same discipline as writing tests with code.

3. **Detect drift in CI.** Extract tool names from server registration code and compare against CLAUDE.md. Fail the build if they diverge:

```bash
# Extract registered tools from source
registered=$(grep -oP '"java_\w+"' src/tools/*.ts | sort -u)
# Extract documented tools from CLAUDE.md
documented=$(grep -oP '`java_\w+`' CLAUDE.md | tr -d '`' | sort -u)
diff <(echo "$registered") <(echo "$documented")
```

4. **Include explicit override directive.** The most important line in CLAUDE.md is "prefer MCP tools over grep." Without this, Claude will not infer the preference.

5. **Test CLAUDE.md manually.** Start a fresh Claude Code session with the MCP server configured, ask a Java navigation question, and verify Claude uses MCP tools rather than grep.

### Pre-release checklist for MCP server repos

- [ ] README.md exists with: purpose, prerequisites, install, config, tool reference, examples
- [ ] CLAUDE.md exists with: tool preference directive, complete tool list, when-to-use-grep guidance
- [ ] Every registered tool appears in CLAUDE.md
- [ ] `.mcp.json` example in README works when path is updated
- [ ] Fresh-session smoke test confirms Claude uses MCP tools

## Related Documentation

- **Origin brainstorm:** [docs/brainstorms/2026-03-17-readme-claude-md-brainstorm.md](../brainstorms/2026-03-17-readme-claude-md-brainstorm.md)
- **Implementation plan:** [docs/plans/2026-03-17-002-feat-readme-and-claude-md-plan.md](../plans/2026-03-17-002-feat-readme-and-claude-md-plan.md)
- **Project brainstorm:** [docs/brainstorms/2026-03-17-java-lsp-mcp-server-brainstorm.md](../brainstorms/2026-03-17-java-lsp-mcp-server-brainstorm.md)
- **Related solution — vscode-jsonrpc type conflicts:** [docs/solutions/integration-issues/vscode-jsonrpc-type-conflicts-mcp-lsp-bridge.md](../integration-issues/vscode-jsonrpc-type-conflicts-mcp-lsp-bridge.md)
- **Related solution — JDT LS download URL bug:** [docs/solutions/logic-errors/jdtls-double-tar-gz-url.md](../logic-errors/jdtls-double-tar-gz-url.md)
