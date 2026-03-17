#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { InstanceManager } from "./lsp/manager.js";
import { log, error as logError } from "./utils/logger.js";

import { registerDefinitionTool } from "./tools/definition.js";
import { registerReferencesTool } from "./tools/references.js";
import { registerDiagnosticsTool } from "./tools/diagnostics.js";
import { registerHoverTool } from "./tools/hover.js";
import { registerRenameTool } from "./tools/rename.js";
import { registerImplementationsTool } from "./tools/implementations.js";
import { registerCallHierarchyTool } from "./tools/call-hierarchy.js";
import { registerWorkspaceSymbolsTool } from "./tools/workspace-symbols.js";
import { registerStatusTool } from "./tools/status.js";

async function main(): Promise<void> {
  const server = new McpServer(
    { name: "java-lsp", version: "0.1.0" },
    { capabilities: { logging: {} } },
  );

  const manager = new InstanceManager();

  // Register all tools
  registerDefinitionTool(server, manager);
  registerReferencesTool(server, manager);
  registerDiagnosticsTool(server, manager);
  registerHoverTool(server, manager);
  registerRenameTool(server, manager);
  registerImplementationsTool(server, manager);
  registerCallHierarchyTool(server, manager);
  registerWorkspaceSymbolsTool(server, manager);
  registerStatusTool(server, manager);

  // Graceful shutdown
  const shutdown = async () => {
    log("Shutting down...");
    await manager.closeAll();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  log("Java LSP MCP Server running on stdio");
}

main().catch((err) => {
  logError("Fatal error", err);
  process.exit(1);
});
