import * as path from "node:path";

/**
 * Convert an absolute file path to a file:// URI.
 * Handles Windows drive letters (C:\foo -> file:///C:/foo).
 */
export function pathToUri(fsPath: string): string {
  const normalized = fsPath.replace(/\\/g, "/");
  if (/^[a-zA-Z]:/.test(normalized)) {
    // Windows: C:/foo -> file:///C:/foo
    return `file:///${normalized}`;
  }
  // Unix: /foo -> file:///foo
  return `file://${normalized}`;
}

/**
 * Convert a file:// URI back to a local file path.
 * Returns null for non-file URIs (e.g. jdt://).
 */
export function uriToPath(uri: string): string | null {
  if (!uri.startsWith("file://")) {
    return null;
  }
  let fsPath = decodeURIComponent(uri.replace("file://", ""));
  // On Windows, file:///C:/foo -> /C:/foo, strip leading slash
  if (/^\/[a-zA-Z]:/.test(fsPath)) {
    fsPath = fsPath.substring(1);
  }
  return path.normalize(fsPath);
}

/**
 * Check if a URI is a jdt:// URI (library/decompiled source).
 */
export function isJdtUri(uri: string): boolean {
  return uri.startsWith("jdt://");
}
