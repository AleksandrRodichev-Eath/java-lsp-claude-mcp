import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InstanceManager } from "../lsp/manager.js";
import { positionInput, toZeroBased } from "./schemas.js";
import { formatDefinitions } from "../utils/formatter.js";
import { isJdtUri } from "../utils/uri.js";

export function registerDefinitionTool(server: McpServer, manager: InstanceManager): void {
  server.tool(
    "java_go_to_definition",
    "Jump to the definition of a Java symbol (class, method, field, variable). Returns the file path, line number, and surrounding code context.",
    positionInput.shape,
    async (input) => {
      try {
        const { line, column } = toZeroBased(input);
        const client = await manager.getInstance(input.filePath, input.projectRoot);
        const result = await client.getDefinition(input.filePath, line, column);

        // Check for jdt:// URIs (library code) and fetch decompiled source
        let extraContent = "";
        if (result) {
          const locations = Array.isArray(result) ? result : [result];
          for (const loc of locations) {
            const uri: string | null = "targetUri" in loc
              ? (loc as { targetUri: string }).targetUri
              : ("uri" in loc ? (loc as { uri: string }).uri : null);
            if (uri && isJdtUri(uri)) {
              const source = await client.getClassFileContents(uri);
              if (source) {
                extraContent += `\n\n--- Source from dependency ---\n${source.substring(0, 3000)}`;
                if (source.length > 3000) extraContent += "\n... (truncated)";
              }
            }
          }
        }

        const text = formatDefinitions(result, input.filePath, input.line, input.column) + extraContent;
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
