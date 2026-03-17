import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InstanceManager } from "../lsp/manager.js";
import { toZeroBased } from "./schemas.js";
import { formatCallHierarchy } from "../utils/formatter.js";

export function registerCallHierarchyTool(server: McpServer, manager: InstanceManager): void {
  server.tool(
    "java_get_call_hierarchy",
    "Get the call hierarchy for a Java method — either incoming calls (who calls this method?) or outgoing calls (what does this method call?).",
    {
      filePath: z.string().describe("Absolute path to the Java source file"),
      line: z.number().int().min(1).describe("Line number (1-based)"),
      column: z.number().int().min(1).describe("Column number (1-based)"),
      direction: z.enum(["incoming", "outgoing"]).describe("Direction: 'incoming' for callers, 'outgoing' for callees"),
      projectRoot: z.string().optional().describe("Java project root path. Auto-detected if omitted."),
    },
    async (input) => {
      try {
        const line = input.line - 1;
        const column = input.column - 1;
        const client = await manager.getInstance(input.filePath, input.projectRoot);

        // Step 1: Prepare
        const items = await client.getCallHierarchyPrepare(input.filePath, line, column);
        if (!items || items.length === 0) {
          return {
            content: [{ type: "text", text: `No call hierarchy item found at ${input.filePath}:${input.line}:${input.column}.` }],
          };
        }

        const item = items[0];

        // Step 2: Get calls
        const calls = input.direction === "incoming"
          ? await client.getIncomingCalls(item)
          : await client.getOutgoingCalls(item);

        const text = formatCallHierarchy(item, calls, input.direction);
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
