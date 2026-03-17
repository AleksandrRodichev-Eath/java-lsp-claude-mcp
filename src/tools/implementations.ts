import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InstanceManager } from "../lsp/manager.js";
import { positionInput, toZeroBased } from "./schemas.js";
import { formatImplementations } from "../utils/formatter.js";

export function registerImplementationsTool(server: McpServer, manager: InstanceManager): void {
  server.tool(
    "java_get_implementations",
    "Find all implementations of a Java interface, abstract class, or method. Returns subclasses, implementing classes, and method overrides with their locations.",
    positionInput.shape,
    async (input) => {
      try {
        const { line, column } = toZeroBased(input);
        const client = await manager.getInstance(input.filePath, input.projectRoot);
        const result = await client.getImplementations(input.filePath, line, column);
        const text = formatImplementations(result, input.filePath, input.line, input.column);
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
