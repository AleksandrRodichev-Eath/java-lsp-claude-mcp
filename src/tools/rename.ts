import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InstanceManager } from "../lsp/manager.js";
import { toZeroBased } from "./schemas.js";
import { formatRenamePreview } from "../utils/formatter.js";

export function registerRenameTool(server: McpServer, manager: InstanceManager): void {
  server.tool(
    "java_rename_symbol",
    "Preview a rename refactoring for a Java symbol. Returns a list of all files and edits that would be made — does NOT modify files. Use the Edit tool to apply changes after reviewing.",
    {
      filePath: z.string().describe("Absolute path to the Java source file"),
      line: z.number().int().min(1).describe("Line number (1-based)"),
      column: z.number().int().min(1).describe("Column number (1-based)"),
      newName: z.string().describe("The new name for the symbol"),
      projectRoot: z.string().optional().describe("Java project root path. Auto-detected if omitted."),
    },
    async (input) => {
      try {
        const line = input.line - 1;
        const column = input.column - 1;
        const client = await manager.getInstance(input.filePath, input.projectRoot);
        const result = await client.getRename(input.filePath, line, column, input.newName);
        const text = formatRenamePreview(result, input.filePath, input.line, input.column);
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
