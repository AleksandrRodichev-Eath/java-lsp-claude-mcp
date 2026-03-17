import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InstanceManager } from "../lsp/manager.js";
import { positionInput, toZeroBased } from "./schemas.js";
import { formatHover } from "../utils/formatter.js";

export function registerHoverTool(server: McpServer, manager: InstanceManager): void {
  server.tool(
    "java_get_hover",
    "Get type information, Javadoc, and method signatures for a Java symbol at a specific position. Returns the documentation and type details as markdown.",
    positionInput.shape,
    async (input) => {
      try {
        const { line, column } = toZeroBased(input);
        const client = await manager.getInstance(input.filePath, input.projectRoot);
        const result = await client.getHover(input.filePath, line, column);
        const text = formatHover(result, input.filePath, input.line, input.column);
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
