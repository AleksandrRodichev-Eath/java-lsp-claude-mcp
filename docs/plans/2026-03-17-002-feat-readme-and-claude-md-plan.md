---
title: "feat: Add README.md and CLAUDE.md for public repo"
type: feat
status: completed
date: 2026-03-17
origin: docs/brainstorms/2026-03-17-readme-claude-md-brainstorm.md
---

# feat: Add README.md and CLAUDE.md for public repo

## Overview

Create two documentation files to prepare `java-lsp-mcp-server` for publication as a public GitHub repository:

1. **README.md** — Human-facing setup guide targeting Claude Code users
2. **CLAUDE.md** — Instructions for Claude to prefer MCP tools over grep for Java navigation, designed to be copied into users' Java projects

## Problem Statement

The repo has no README or CLAUDE.md. Without these, users who discover the repo won't know how to install, configure, or benefit from it. Without CLAUDE.md, Claude will default to grep/glob for Java code navigation instead of using the semantically accurate MCP tools.

## Proposed Solution

Two separate files (see brainstorm: `docs/brainstorms/2026-03-17-readme-claude-md-brainstorm.md`):

- **README.md** at repo root — concise, practical, targeting Claude Code users who want IDE-quality Java navigation
- **CLAUDE.md** at repo root — copyable template that teaches Claude when to use MCP vs grep

### README.md Structure

```
# java-lsp-mcp-server
One-line: MCP server that gives Claude Code IDE-quality Java navigation via Eclipse JDT LS.

## What It Does
- 2-3 sentence pitch: type-aware go-to-definition, find references, etc. instead of grep
- Architecture diagram (text): Claude Code → MCP → JDT LS → Java project

## Prerequisites
- Java 21+ (JDK)
- Node.js 18+

## Installation
git clone, npm install, npm run build

## Configuration
### 1. Register the MCP server
Show .mcp.json snippet to add to your Java project (with absolute path to dist/index.js)

### 2. Add CLAUDE.md to your Java project
Explain: copy the CLAUDE.md from this repo into your Java project root
Show the content or link to the file
Explain WHY: tells Claude to use MCP tools for Java navigation instead of grep

## Tools
Table with 9 tools: name, description, key inputs

## Examples
### Example 1: Go to definition
Show tool input JSON and formatted output (fabricated realistic example)
### Example 2: Find references
Show tool input JSON and formatted output

## How It Works
Brief: auto-downloads JDT LS on first use (~50MB to ~/.java-lsp-mcp), manages one instance per project, auto-detects project root via pom.xml/build.gradle

## Troubleshooting
- Java not found → check JAVA_HOME / PATH
- First run slow → JDT LS downloading + indexing
- "Initializing" takes long → large projects need 1-2 min on first open
- Debug mode → JAVA_LSP_DEBUG=true

## Environment Variables
- JAVA_HOME: path to JDK
- JAVA_LSP_DEBUG: enable verbose logging
```

### CLAUDE.md Content

```markdown
# Java LSP MCP Server

## Code Navigation

When working with Java source files in this project, prefer the java_* MCP tools
over grep/glob for code navigation:

- **java_go_to_definition** — Jump to where a class/method/field is defined
- **java_find_references** — Find all usages of a symbol
- **java_get_implementations** — Find classes implementing an interface or overriding a method
- **java_get_hover** — Get type info and Javadoc for a symbol
- **java_get_call_hierarchy** — Trace incoming/outgoing calls
- **java_get_workspace_symbols** — Search for classes/methods by name across the project
- **java_get_diagnostics** — Check compilation errors/warnings in a file
- **java_rename_symbol** — Preview what a rename would change (does not modify files)
- **java_lsp_status** — Check if JDT LS instances are running

### When to use grep/glob instead
- Searching for string literals, log messages, or TODO comments
- Searching non-Java files (XML, properties, YAML, etc.)
- Finding files by name pattern
- Text-based searches where semantic understanding isn't needed

### Tips
- Line/column numbers are 1-based (matching Read tool output)
- projectRoot is auto-detected from filePath — usually no need to specify it
- First use per project takes 1-2 minutes for JDT LS to index
```

## Acceptance Criteria

- [x] `README.md` exists at repo root with all sections from the structure above
- [x] `CLAUDE.md` exists at repo root with MCP-preferred navigation instructions
- [x] README includes working `.mcp.json` configuration example with absolute path placeholder
- [x] README tools table covers all 9 tools
- [x] README includes 1-2 tool usage examples with realistic output
- [x] CLAUDE.md lists all 9 MCP tools with brief descriptions
- [x] CLAUDE.md explains when grep/glob is still appropriate
- [x] CLAUDE.md is self-contained (works when copied to any Java project root)

## Implementation Notes

### File: `README.md`

- Keep concise — target audience already knows Claude Code
- Use the tool descriptions from `src/index.ts` tool registrations as source of truth
- For the `.mcp.json` example, use a placeholder path like `/path/to/java-lsp-mcp-server/dist/index.js`
- For tool examples, fabricate realistic output based on the formatter patterns in `src/utils/formatter.ts`
- Mention that JDT LS v1.43.0 is auto-downloaded to `~/.java-lsp-mcp/`

### File: `CLAUDE.md`

- Must work standalone when copied to any Java project
- Do NOT reference the MCP server repo internals
- Keep the "when to use grep" section — this was a key brainstorm decision (prefer MCP, allow grep)
- Include practical tips (1-based line numbers, auto-detection, indexing time)

## Sources

- **Origin brainstorm:** [docs/brainstorms/2026-03-17-readme-claude-md-brainstorm.md](../brainstorms/2026-03-17-readme-claude-md-brainstorm.md) — Key decisions: separate files, Claude Code audience, clone+build install, MCP-preferred with grep fallback, include examples
- Tool definitions: `src/index.ts`, `src/tools/*.ts`
- Output formatting: `src/utils/formatter.ts`
- Prerequisites: `src/jdtls/java-check.ts` (Java 21+), `src/jdtls/downloader.ts` (JDT LS 1.43.0)
- Schema: `src/tools/schemas.ts` (1-based line/column)
