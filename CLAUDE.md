# Java LSP MCP Server

## Code Navigation

When working with Java source files in this project, prefer the `java_*` MCP tools over grep/glob for code navigation. These tools provide type-aware, semantically accurate results powered by Eclipse JDT Language Server.

### Available tools

- **java_go_to_definition** — Jump to where a class, method, field, or variable is defined
- **java_find_references** — Find all locations where a symbol is used
- **java_get_implementations** — Find classes implementing an interface or overriding a method
- **java_get_hover** — Get type info, Javadoc, and method signatures for a symbol
- **java_get_call_hierarchy** — Trace incoming callers or outgoing callees of a method
- **java_get_workspace_symbols** — Search for classes, methods, or fields by name across the project
- **java_get_diagnostics** — Check compilation errors, warnings, and hints in a file
- **java_rename_symbol** — Preview what a rename refactoring would change (does not modify files)
- **java_lsp_status** — Check if JDT LS instances are running and their status

### When to use grep/glob instead

- Searching for string literals, log messages, or TODO comments
- Searching non-Java files (XML, properties, YAML, build configs, etc.)
- Finding files by name pattern
- Text-based searches where semantic understanding isn't needed

### Tips

- Line and column numbers are 1-based (matching the Read tool output)
- `projectRoot` is auto-detected from `filePath` — usually no need to specify it
- First use per project takes 1-2 minutes while JDT LS indexes the codebase
- Use `java_get_diagnostics` to check for compilation errors if other tools return no results
