---
title: "JDT LS Download Fails with Double .tar.gz Extension"
category: logic-errors
date: 2026-03-17
tags: [jdtls, mcp, download, eclipse, url-construction]
component: java-lsp-mcp-server
file: src/jdtls/downloader.ts
severity: critical
---

## Problem

The JDT LS downloader failed with HTTP 404 because the URL construction appended `.tar.gz` to a filename that already contained this extension from the `latest.txt` file, resulting in malformed URLs like `jdt-language-server-1.43.0-202412191447.tar.gz.tar.gz`. This prevented the MCP server from bootstrapping and downloading the required Eclipse JDT Language Server binary during initialization.

**Error message:**
```
Failed to download JDT LS. Check internet connection.
URL: https://download.eclipse.org/jdtls/milestones/1.43.0/jdt-language-server-1.43.0-202412191447.tar.gz.tar.gz
HTTP 404
```

## Root Cause

The `latest.txt` endpoint returns a complete filename that already includes the `.tar.gz` extension (e.g., `jdt-language-server-1.43.0-202412191447.tar.gz`). However, line 91 in the download URL construction unconditionally appended `.tar.gz` again, resulting in the double extension and HTTP 404.

## Solution

Move the `.tar.gz` extension into the fallback case (where the version-based filename is constructed), and use the `latest.txt` filename as-is.

**Before (broken):**
```typescript
let filename: string;
try {
  const latestContent = await httpGet(latestUrl);
  filename = latestContent.trim();
} catch {
  filename = `jdt-language-server-${JDTLS_VERSION}`;
  log("Could not fetch latest.txt, using version-based filename.");
}
const tarUrl = `${JDTLS_MIRROR_BASE}/${filename}.tar.gz`;  // Double extension
```

**After (fixed):**
```typescript
let tarFilename: string;
try {
  const latestContent = await httpGet(latestUrl);
  tarFilename = latestContent.trim();  // Already includes .tar.gz
} catch {
  tarFilename = `jdt-language-server-${JDTLS_VERSION}.tar.gz`;  // Add .tar.gz here
  log("Could not fetch latest.txt, using version-based filename.");
}
const tarUrl = `${JDTLS_MIRROR_BASE}/${tarFilename}`;  // No extra appending
```

## Investigation Steps

1. Observed HTTP 404 error in MCP tool output with the malformed URL
2. Noticed the double `.tar.gz.tar.gz` extension in the URL
3. Grepped for `tar.gz` in the source to find the URL construction in `src/jdtls/downloader.ts`
4. Identified that `latest.txt` returns a complete filename with extension
5. Fixed the code to handle both paths correctly
6. Verified the build passes

## Prevention

- **Validate external API responses against actual values**: Don't assume API behavior based on naming conventions. The `latest.txt` file returns a complete filename with extension, not a bare name.
- **Use defensive parsing**: Before appending file extensions, check if the value already contains that extension (e.g., `if (!url.endsWith('.tar.gz'))`).
- **Test with real API responses**: A unit test that mocks `latest.txt` returning a filename with `.tar.gz` would have caught this immediately.

## Key Takeaway

Always validate external API responses against their observed behavior rather than assuming a format based on variable naming or context.

## Related Documentation

- [vscode-jsonrpc type conflicts](../integration-issues/vscode-jsonrpc-type-conflicts-mcp-lsp-bridge.md) - Another setup/integration issue in this project
