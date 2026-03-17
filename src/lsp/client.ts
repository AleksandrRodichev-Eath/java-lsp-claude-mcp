import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  type ProtocolConnection,
  type InitializeParams,
  type PublishDiagnosticsParams,
  type Location,
  type LocationLink,
  type Hover,
  type WorkspaceEdit,
  type CallHierarchyItem,
  type CallHierarchyIncomingCall,
  type CallHierarchyOutgoingCall,
  type SymbolInformation,
  type WorkspaceSymbol,
  type Diagnostic,
  type Definition,
} from "vscode-languageserver-protocol";

import { findJavaExecutable } from "../jdtls/java-check.js";
import { findLauncherJar, getConfigDir } from "../jdtls/downloader.js";
import { pathToUri } from "../utils/uri.js";
import { log, debug, error as logError } from "../utils/logger.js";
import { CLIENT_CAPABILITIES, REQUEST_TIMEOUT, INIT_TIMEOUT, DIAGNOSTICS_TIMEOUT } from "./protocol.js";

// Dynamic import to avoid TypeScript type conflicts between
// vscode-jsonrpc and vscode-languageserver-protocol's bundled copy.
// At runtime, vscode-languageserver-protocol re-exports createProtocolConnection
// with a Node.js stream overload that accepts ReadableStream/WritableStream directly.
async function createConnection(
  stdout: NodeJS.ReadableStream,
  stdin: NodeJS.WritableStream,
): Promise<ProtocolConnection> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = await import("vscode-languageserver-protocol") as any;
  return mod.createProtocolConnection(stdout, stdin) as ProtocolConnection;
}

export type ClientStatus = "initializing" | "ready" | "error" | "dead";

export class JdtLsClient {
  private process: cp.ChildProcess | null = null;
  private connection: ProtocolConnection | null = null;
  private _status: ClientStatus = "initializing";
  private _error: Error | null = null;
  private startTime: number = 0;

  // Async mutex for serializing LSP requests
  private lockPromise: Promise<void> = Promise.resolve();

  // Diagnostics storage — keyed by URI
  private diagnosticsMap = new Map<string, Diagnostic[]>();

  constructor(
    public readonly projectRoot: string,
    private readonly jdtlsHome: string,
    private readonly dataDir: string,
  ) {}

  get status(): ClientStatus { return this._status; }
  get uptime(): number { return this._status === "ready" ? Date.now() - this.startTime : 0; }

  async start(): Promise<void> {
    const launcherJar = await findLauncherJar();
    const configDir = getConfigDir();
    const javaPath = findJavaExecutable();

    // Ensure data directory exists
    fs.mkdirSync(this.dataDir, { recursive: true });

    log(`Starting JDT LS for project: ${this.projectRoot}`);
    debug(`Data dir: ${this.dataDir}`);

    this.process = cp.spawn(javaPath, [
      "-Declipse.application=org.eclipse.jdt.ls.core.id1",
      "-Dosgi.bundles.defaultStartLevel=4",
      "-Declipse.product=org.eclipse.jdt.ls.core.product",
      "-Xmx1G",
      "--add-modules=ALL-SYSTEM",
      "--add-opens", "java.base/java.util=ALL-UNNAMED",
      "--add-opens", "java.base/java.lang=ALL-UNNAMED",
      "-jar", launcherJar,
      "-configuration", configDir,
      "-data", this.dataDir,
    ], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    this.process.on("exit", (code, signal) => {
      log(`JDT LS exited (code=${code}, signal=${signal}) for ${this.projectRoot}`);
      if (this._status !== "dead") {
        this._status = "dead";
      }
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      debug(`[jdtls stderr] ${data.toString().trim()}`);
    });

    this.connection = await createConnection(
      this.process.stdout!,
      this.process.stdin!,
    );

    // Register diagnostics handler using string method name
    this.connection.onNotification("textDocument/publishDiagnostics", (params: PublishDiagnosticsParams) => {
      this.diagnosticsMap.set(params.uri, params.diagnostics);
    });

    this.connection.listen();

    // Initialize with timeout
    await this.initializeWithTimeout();
  }

  private async initializeWithTimeout(): Promise<void> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(
        `JDT LS initialization timed out after ${INIT_TIMEOUT / 1000}s for ${this.projectRoot}`
      )), INIT_TIMEOUT)
    );

    try {
      await Promise.race([this.doInitialize(), timeout]);
      this._status = "ready";
      this.startTime = Date.now();
      log(`JDT LS ready for: ${this.projectRoot}`);
    } catch (err) {
      this._status = "error";
      this._error = err instanceof Error ? err : new Error(String(err));
      throw this._error;
    }
  }

  private async doInitialize(): Promise<void> {
    const rootUri = pathToUri(this.projectRoot);
    const initParams: InitializeParams = {
      processId: process.pid,
      clientInfo: { name: "java-lsp-mcp", version: "0.1.0" },
      rootUri,
      capabilities: CLIENT_CAPABILITIES,
      workspaceFolders: [
        { uri: rootUri, name: path.basename(this.projectRoot) },
      ],
    };

    await this.connection!.sendRequest("initialize", initParams);
    this.connection!.sendNotification("initialized", {});
  }

  async stop(): Promise<void> {
    if (!this.connection || !this.process) return;

    this._status = "dead";
    try {
      await Promise.race([
        this.connection.sendRequest("shutdown"),
        new Promise<void>((resolve) => setTimeout(resolve, 5000)),
      ]);
      this.connection.sendNotification("exit");
    } catch {
      // Ignore errors during shutdown
    }

    // Force kill if still running
    setTimeout(() => {
      if (this.process && !this.process.killed) {
        this.process.kill("SIGKILL");
      }
    }, 2000);

    this.connection.dispose();
    this.connection = null;
  }

  // -- File synchronization --

  private openFile(filePath: string): void {
    const uri = pathToUri(filePath);
    const content = fs.readFileSync(filePath, "utf-8");
    this.connection!.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId: "java",
        version: 1,
        text: content,
      },
    });
  }

  private closeFile(filePath: string): void {
    const uri = pathToUri(filePath);
    this.connection!.sendNotification("textDocument/didClose", {
      textDocument: { uri },
    });
  }

  // -- Async mutex --

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.lockPromise;
    let release: () => void;
    this.lockPromise = new Promise((resolve) => { release = resolve; });

    await prev;
    try {
      return await fn();
    } finally {
      release!();
    }
  }

  private assertReady(): void {
    if (this._status !== "ready") {
      throw new Error(`JDT LS is not ready (status: ${this._status})`);
    }
  }

  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("LSP request timed out")), REQUEST_TIMEOUT)
      ),
    ]);
  }

  // -- LSP methods (using string method names to avoid jsonrpc type conflicts) --

  async getDefinition(filePath: string, line: number, column: number): Promise<Definition | null> {
    this.assertReady();
    return this.withLock(async () => {
      this.openFile(filePath);
      try {
        return await this.withTimeout(
          this.connection!.sendRequest("textDocument/definition", {
            textDocument: { uri: pathToUri(filePath) },
            position: { line, character: column },
          })
        ) as Definition | null;
      } finally {
        this.closeFile(filePath);
      }
    });
  }

  async getReferences(filePath: string, line: number, column: number): Promise<Location[] | null> {
    this.assertReady();
    return this.withLock(async () => {
      this.openFile(filePath);
      try {
        return await this.withTimeout(
          this.connection!.sendRequest("textDocument/references", {
            textDocument: { uri: pathToUri(filePath) },
            position: { line, character: column },
            context: { includeDeclaration: true },
          })
        ) as Location[] | null;
      } finally {
        this.closeFile(filePath);
      }
    });
  }

  async getHover(filePath: string, line: number, column: number): Promise<Hover | null> {
    this.assertReady();
    return this.withLock(async () => {
      this.openFile(filePath);
      try {
        return await this.withTimeout(
          this.connection!.sendRequest("textDocument/hover", {
            textDocument: { uri: pathToUri(filePath) },
            position: { line, character: column },
          })
        ) as Hover | null;
      } finally {
        this.closeFile(filePath);
      }
    });
  }

  async getRename(filePath: string, line: number, column: number, newName: string): Promise<WorkspaceEdit | null> {
    this.assertReady();
    return this.withLock(async () => {
      this.openFile(filePath);
      try {
        return await this.withTimeout(
          this.connection!.sendRequest("textDocument/rename", {
            textDocument: { uri: pathToUri(filePath) },
            position: { line, character: column },
            newName,
          })
        ) as WorkspaceEdit | null;
      } finally {
        this.closeFile(filePath);
      }
    });
  }

  async getImplementations(filePath: string, line: number, column: number): Promise<Definition | null> {
    this.assertReady();
    return this.withLock(async () => {
      this.openFile(filePath);
      try {
        return await this.withTimeout(
          this.connection!.sendRequest("textDocument/implementation", {
            textDocument: { uri: pathToUri(filePath) },
            position: { line, character: column },
          })
        ) as Definition | null;
      } finally {
        this.closeFile(filePath);
      }
    });
  }

  async getCallHierarchyPrepare(filePath: string, line: number, column: number): Promise<CallHierarchyItem[] | null> {
    this.assertReady();
    return this.withLock(async () => {
      this.openFile(filePath);
      try {
        return await this.withTimeout(
          this.connection!.sendRequest("textDocument/prepareCallHierarchy", {
            textDocument: { uri: pathToUri(filePath) },
            position: { line, character: column },
          })
        ) as CallHierarchyItem[] | null;
      } finally {
        this.closeFile(filePath);
      }
    });
  }

  async getIncomingCalls(item: CallHierarchyItem): Promise<CallHierarchyIncomingCall[] | null> {
    this.assertReady();
    return this.withLock(async () => {
      return this.withTimeout(
        this.connection!.sendRequest("callHierarchy/incomingCalls", { item })
      ) as Promise<CallHierarchyIncomingCall[] | null>;
    });
  }

  async getOutgoingCalls(item: CallHierarchyItem): Promise<CallHierarchyOutgoingCall[] | null> {
    this.assertReady();
    return this.withLock(async () => {
      return this.withTimeout(
        this.connection!.sendRequest("callHierarchy/outgoingCalls", { item })
      ) as Promise<CallHierarchyOutgoingCall[] | null>;
    });
  }

  async getWorkspaceSymbols(query: string): Promise<(SymbolInformation | WorkspaceSymbol)[] | null> {
    this.assertReady();
    return this.withLock(async () => {
      return this.withTimeout(
        this.connection!.sendRequest("workspace/symbol", { query })
      ) as Promise<(SymbolInformation | WorkspaceSymbol)[] | null>;
    });
  }

  async getDiagnostics(filePath: string): Promise<Diagnostic[]> {
    this.assertReady();
    return this.withLock(async () => {
      const uri = pathToUri(filePath);

      // Clear any stale diagnostics for this URI
      this.diagnosticsMap.delete(uri);

      this.openFile(filePath);
      try {
        // Wait for diagnostics notification (async push from JDT LS)
        const diagnostics = await new Promise<Diagnostic[]>((resolve) => {
          const checkInterval = setInterval(() => {
            const diags = this.diagnosticsMap.get(uri);
            if (diags !== undefined) {
              clearInterval(checkInterval);
              clearTimeout(timer);
              resolve(diags);
            }
          }, 200);

          const timer = setTimeout(() => {
            clearInterval(checkInterval);
            resolve(this.diagnosticsMap.get(uri) ?? []);
          }, DIAGNOSTICS_TIMEOUT);
        });

        return diagnostics;
      } finally {
        this.closeFile(filePath);
      }
    });
  }

  /**
   * Request content for a jdt:// URI (decompiled/source-attached library code).
   */
  async getClassFileContents(jdtUri: string): Promise<string | null> {
    this.assertReady();
    return this.withLock(async () => {
      try {
        const result = await this.withTimeout(
          this.connection!.sendRequest("java/classFileContents", { uri: jdtUri })
        );
        return result as string | null;
      } catch {
        return null;
      }
    });
  }
}
