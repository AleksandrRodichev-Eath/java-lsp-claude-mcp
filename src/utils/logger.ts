const DEBUG = process.env.JAVA_LSP_DEBUG === "true";

export function log(message: string): void {
  console.error(`[java-lsp] ${message}`);
}

export function debug(message: string): void {
  if (DEBUG) {
    console.error(`[java-lsp:debug] ${message}`);
  }
}

export function error(message: string, err?: unknown): void {
  const suffix = err instanceof Error ? `: ${err.message}` : "";
  console.error(`[java-lsp:error] ${message}${suffix}`);
}
