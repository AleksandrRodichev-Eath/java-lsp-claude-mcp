# Brainstorm: README.md + CLAUDE.md for Public Repo

**Date:** 2026-03-17
**Status:** Complete

## What We're Building

Two documentation files for publishing the java-lsp-mcp-server as a public GitHub repo:

1. **README.md** — Human-facing documentation for Claude Code users who want Java navigation superpowers
2. **CLAUDE.md** — Instructions for Claude to prefer MCP tools over grep for Java code navigation, copyable to user's Java projects

## Why This Approach

- **Separate files** (Approach A) — README is for humans, CLAUDE.md is for Claude. Users can copy CLAUDE.md to their Java projects as a ready-to-use template.
- **Target audience: Claude Code users** — No need to explain what MCP is in depth. Focus on quick setup and practical value.
- **Clone + build installation** — Users clone the repo and build locally. No npm publish needed yet.

## Key Decisions

### README.md Structure
1. **Header** — Project name, one-line description, what it does
2. **Prerequisites** — Java 21+, Node.js 18+
3. **Installation** — Clone, npm install, npm run build
4. **Configuration** — How to add .mcp.json to your Java project pointing to this server
5. **CLAUDE.md Setup** — Tell users to copy CLAUDE.md to their project root (or reference it), explain why
6. **Tools Reference** — Table of 9 tools with descriptions
7. **Examples** — 1-2 example tool calls with sample output
8. **How It Works** — Brief architecture (Claude Code -> MCP -> JDT LS -> Java project)
9. **Troubleshooting** — Common issues (Java version, first-run download, initialization time)
10. **Environment Variables** — JAVA_HOME, JAVA_LSP_DEBUG

### CLAUDE.md Content
- **Prefer MCP tools** for type-aware Java navigation (definitions, references, implementations, hover, call hierarchy, workspace symbols)
- **Allow grep/glob** for text-based searches (string literals, config files, TODOs, non-Java files)
- List the available MCP tools briefly so Claude knows what's available
- Explain when to use which approach

### Tool Examples in README
- Include 1-2 concrete examples showing tool input and formatted output
- Helps users understand what to expect and verify the setup works

## Open Questions

None — all decisions resolved through brainstorming dialogue.
