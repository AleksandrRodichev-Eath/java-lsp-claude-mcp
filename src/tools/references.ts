import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InstanceManager } from "../lsp/manager.js";
import { positionInput, toZeroBased } from "./schemas.js";
import { formatReferences } from "../utils/formatter.js";

export function registerReferencesTool(server: McpServer, manager: InstanceManager): void {
  server.tool(
    "java_find_references",
    "Find all locations where a Java symbol is used (references). Returns a list of file paths and line numbers grouped by file.",
    positionInput.shape,
    async (input) => {
      try {
        const { line, column } = toZeroBased(input);
        const client = await manager.getInstance(input.filePath, input.projectRoot);
        const result = await client.getReferences(input.filePath, line, column);
        const text = formatReferences(result, input.filePath, input.line, input.column);
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
