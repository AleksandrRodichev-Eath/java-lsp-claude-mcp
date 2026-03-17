import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InstanceManager } from "../lsp/manager.js";

export function registerStatusTool(server: McpServer, manager: InstanceManager): void {
  server.tool(
    "java_lsp_status",
    "Check the status of all active Java LSP server instances. Shows which projects are loaded, their status (ready/initializing/error), and uptime.",
    {},
    async () => {
      const instances = manager.getStatus();

      if (instances.length === 0) {
        return {
          content: [{ type: "text", text: "No Java LSP instances running. An instance will start when you use any Java tool." }],
        };
      }

      const lines: string[] = [`${instances.length} Java LSP instance(s):\n`];
      for (const inst of instances) {
        const uptime = inst.uptimeMs > 0
          ? `${Math.round(inst.uptimeMs / 1000)}s`
          : "n/a";
        lines.push(`  [${inst.status.toUpperCase()}] ${inst.projectRoot} (uptime: ${uptime})`);
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );
}
