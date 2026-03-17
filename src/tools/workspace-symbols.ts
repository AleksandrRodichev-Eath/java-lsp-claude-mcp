import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InstanceManager } from "../lsp/manager.js";
import { formatWorkspaceSymbols } from "../utils/formatter.js";

export function registerWorkspaceSymbolsTool(server: McpServer, manager: InstanceManager): void {
  server.tool(
    "java_get_workspace_symbols",
    "Search for Java symbols (classes, methods, fields) across the entire project by name. Returns matching symbols with their kind, file path, and line number.",
    {
      query: z.string().describe("Symbol name or pattern to search for (e.g., 'UserService', 'process')"),
      projectRoot: z.string().describe("Java project root path (required since there is no file to auto-detect from)"),
    },
    async (input) => {
      try {
        const client = await manager.getInstance(input.projectRoot, input.projectRoot);
        const result = await client.getWorkspaceSymbols(input.query);
        const text = formatWorkspaceSymbols(result, input.query);
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: `${(err as Error).message}` }],
        };
      }
    },
  );
}
