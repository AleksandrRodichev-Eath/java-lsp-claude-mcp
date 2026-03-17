---
title: "vscode-jsonrpc type conflicts when bridging MCP SDK and LSP protocol"
category: integration-issues
date: 2026-03-17
tags: [typescript, mcp, lsp, vscode-jsonrpc, vscode-languageserver-protocol, type-conflicts]
severity: blocking
components: [lsp-client, mcp-server]
---

# vscode-jsonrpc Type Conflicts in MCP + LSP Bridge

## Problem

When building a TypeScript MCP server that wraps an LSP server (Eclipse JDT LS), importing both `@modelcontextprotocol/sdk` and `vscode-languageserver-protocol` alongside a direct `vscode-jsonrpc` dependency causes **duplicate type declarations**. The `vscode-languageserver-protocol` package bundles its own copy of `vscode-jsonrpc` internally, resulting in two separate copies with incompatible private property types.

**Symptom:** TypeScript errors like:
```
Types have separate declarations of a private property '_parameterStructures'.
Argument of type 'ProtocolRequestType<...>' is not assignable to parameter of type 'string'.
```

These errors appear on every `sendRequest()` and `sendNotification()` call when using typed LSP request objects (e.g., `DefinitionRequest.type`, `InitializeRequest.type`) with a `MessageConnection` created from the directly-imported `vscode-jsonrpc`.

## Root Cause

`vscode-languageserver-protocol` re-exports `vscode-jsonrpc` types but bundles its own copy under `node_modules/vscode-languageserver-protocol/node_modules/vscode-jsonrpc/`. When you also install `vscode-jsonrpc` as a direct dependency, npm creates two separate copies. TypeScript sees the `ParameterStructures` class from each copy as distinct types (different private property declarations), making them structurally incompatible.

Additionally, `StreamMessageReader` and `StreamMessageWriter` are Node.js-specific classes exported from `vscode-jsonrpc/node` (or the `/node` subpath of `vscode-languageserver-protocol`), but the TypeScript type declarations for `vscode-languageserver-protocol`'s main export don't include them — they're only available at runtime via the CommonJS main entry which re-exports `vscode-jsonrpc/node`.

## Solution

**1. Remove direct `vscode-jsonrpc` dependency.** Only depend on `vscode-languageserver-protocol`, which transitively provides all jsonrpc types.

**2. Use `createProtocolConnection` from `vscode-languageserver-protocol`** instead of `createMessageConnection` from `vscode-jsonrpc`.

**3. Use string-based method names** instead of typed request objects to avoid cross-package type conflicts:

```typescript
// ❌ BROKEN — typed request objects from LSP protocol don't match jsonrpc connection types
await connection.sendRequest(DefinitionRequest.type, params);
await connection.sendNotification(InitializedNotification.type, {});

// ✅ WORKS — string method names bypass type system conflicts entirely
await connection.sendRequest("textDocument/definition", params) as Definition | null;
await connection.sendNotification("initialized", {});
```

**4. For connection creation**, use a dynamic import wrapper to bypass the TypeScript type mismatch on Node.js stream arguments:

```typescript
async function createConnection(
  stdout: NodeJS.ReadableStream,
  stdin: NodeJS.WritableStream,
): Promise<ProtocolConnection> {
  const mod = await import("vscode-languageserver-protocol") as any;
  return mod.createProtocolConnection(stdout, stdin) as ProtocolConnection;
}
```

This works because at runtime, `vscode-languageserver-protocol`'s main.js re-exports the Node.js overload of `createProtocolConnection` that accepts streams directly — but the TypeScript declarations only expose the `MessageReader/MessageWriter` overload.

## Prevention

- **Never install `vscode-jsonrpc` alongside `vscode-languageserver-protocol`** in a standalone LSP client project. The protocol package already bundles it.
- **When building non-VS Code LSP clients**, use `vscode-languageserver-protocol` (not `vscode-languageclient`, which depends on VS Code APIs).
- **Use string method names** for LSP requests when the connection is created from a different package than the request type definitions. This is the safest approach for cross-package interop.
- **Cast return types explicitly** since string-based `sendRequest` returns `unknown`.
