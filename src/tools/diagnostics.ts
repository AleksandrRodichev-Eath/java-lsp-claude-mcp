import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InstanceManager } from "../lsp/manager.js";
import { formatDiagnostics } from "../utils/formatter.js";

export function registerDiagnosticsTool(server: McpServer, manager: InstanceManager): void {
  server.tool(
    "java_get_diagnostics",
    "Get compilation errors, warnings, and hints for a Java source file. Returns a list of diagnostics with severity, message, and location.",
    {
      filePath: z.string().describe("Absolute path to the Java source file"),
      projectRoot: z.string().optional().describe("Java project root path. Auto-detected if omitted."),
    },
    async (input) => {
      try {
        const client = await manager.getInstance(input.filePath, input.projectRoot);
        const diagnostics = await client.getDiagnostics(input.filePath);
        const text = formatDiagnostics(diagnostics, input.filePath);
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
