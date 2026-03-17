import * as fs from "node:fs";
import * as path from "node:path";
import {
  type Location,
  type LocationLink,
  type Diagnostic,
  type WorkspaceEdit,
  type TextEdit,
  type CallHierarchyItem,
  type CallHierarchyIncomingCall,
  type CallHierarchyOutgoingCall,
  type SymbolInformation,
  type WorkspaceSymbol,
  type Hover,
  type MarkupContent,
  DiagnosticSeverity,
  SymbolKind,
} from "vscode-languageserver-protocol";
import { uriToPath, isJdtUri } from "./uri.js";
import { MAX_RESULTS } from "../lsp/protocol.js";

const CONTEXT_LINES = 3;

// -- Location formatting --

export function formatLocation(loc: Location, label?: string): string {
  const filePath = uriToPath(loc.uri);
  const line = loc.range.start.line + 1; // 1-based
  const col = loc.range.start.character + 1;

  if (!filePath) {
    // jdt:// URI or other non-file
    return `${loc.uri}:${line}:${col}`;
  }

  const header = label ? `${label}\n` : "";
  const relativePath = filePath;
  const snippet = getCodeSnippet(filePath, loc.range.start.line);

  return `${header}${relativePath}:${line}:${col}\n${snippet}`;
}

export function formatLocationLink(link: LocationLink): string {
  const loc: Location = {
    uri: link.targetUri,
    range: link.targetSelectionRange || link.targetRange,
  };
  return formatLocation(loc);
}

function getCodeSnippet(filePath: string, targetLine: number): string {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    const start = Math.max(0, targetLine - CONTEXT_LINES);
    const end = Math.min(lines.length - 1, targetLine + CONTEXT_LINES);

    const result: string[] = [];
    const lineNumWidth = String(end + 1).length;

    for (let i = start; i <= end; i++) {
      const lineNum = String(i + 1).padStart(lineNumWidth);
      const marker = i === targetLine ? ">" : " ";
      result.push(`${marker} ${lineNum} | ${lines[i]}`);
    }

    return result.join("\n");
  } catch {
    return "  (source not available)";
  }
}

// -- Definition formatting --

export function formatDefinitions(
  result: Location | Location[] | LocationLink[] | null,
  filePath: string,
  line: number,
  col: number,
): string {
  if (!result) {
    return `No definition found at ${filePath}:${line}:${col}.`;
  }

  const locations = normalizeLocations(result);
  if (locations.length === 0) {
    return `No definition found at ${filePath}:${line}:${col}.`;
  }

  if (locations.length === 1) {
    return formatLocation(locations[0]);
  }

  return locations.map((loc, i) =>
    formatLocation(loc, `Definition ${i + 1}:`)
  ).join("\n\n");
}

// -- References formatting --

export function formatReferences(
  refs: Location[] | null,
  filePath: string,
  line: number,
  col: number,
): string {
  if (!refs || refs.length === 0) {
    return `No references found at ${filePath}:${line}:${col}.`;
  }

  const total = refs.length;
  const truncated = refs.slice(0, MAX_RESULTS);

  // Group by file
  const byFile = new Map<string, Location[]>();
  for (const ref of truncated) {
    const fp = uriToPath(ref.uri) ?? ref.uri;
    if (!byFile.has(fp)) byFile.set(fp, []);
    byFile.get(fp)!.push(ref);
  }

  const parts: string[] = [`Found ${total} reference(s):`];

  for (const [fp, locs] of byFile) {
    parts.push(`\n${fp}:`);
    for (const loc of locs) {
      const ln = loc.range.start.line + 1;
      const c = loc.range.start.character + 1;
      parts.push(`  Line ${ln}:${c}`);
    }
  }

  if (total > MAX_RESULTS) {
    parts.push(`\nShowing ${MAX_RESULTS} of ${total} references. Results truncated.`);
  }

  return parts.join("\n");
}

// -- Diagnostics formatting --

export function formatDiagnostics(
  diagnostics: Diagnostic[],
  filePath: string,
): string {
  if (diagnostics.length === 0) {
    return `No diagnostics for ${filePath}.`;
  }

  const parts: string[] = [`${diagnostics.length} diagnostic(s) for ${filePath}:\n`];

  for (const diag of diagnostics) {
    const severity = severityToString(diag.severity);
    const line = diag.range.start.line + 1;
    const col = diag.range.start.character + 1;
    parts.push(`[${severity}] Line ${line}:${col} — ${diag.message}`);
    if (diag.source) {
      parts.push(`  Source: ${diag.source}`);
    }
  }

  return parts.join("\n");
}

function severityToString(severity: DiagnosticSeverity | undefined): string {
  switch (severity) {
    case DiagnosticSeverity.Error: return "ERROR";
    case DiagnosticSeverity.Warning: return "WARNING";
    case DiagnosticSeverity.Information: return "INFO";
    case DiagnosticSeverity.Hint: return "HINT";
    default: return "UNKNOWN";
  }
}

// -- Hover formatting --

export function formatHover(
  hover: Hover | null,
  filePath: string,
  line: number,
  col: number,
): string {
  if (!hover) {
    return `No hover information at ${filePath}:${line}:${col}.`;
  }

  if (typeof hover.contents === "string") {
    return hover.contents;
  }

  if ("kind" in hover.contents) {
    // MarkupContent
    return (hover.contents as MarkupContent).value;
  }

  if (Array.isArray(hover.contents)) {
    return hover.contents.map(c =>
      typeof c === "string" ? c : ("value" in c ? c.value : String(c))
    ).join("\n\n");
  }

  if ("value" in hover.contents) {
    return hover.contents.value;
  }

  return JSON.stringify(hover.contents);
}

// -- Rename formatting --

export function formatRenamePreview(
  edit: WorkspaceEdit | null,
  filePath: string,
  line: number,
  col: number,
): string {
  if (!edit || !edit.changes) {
    return `Cannot rename symbol at ${filePath}:${line}:${col}.`;
  }

  const parts: string[] = ["Rename preview:\n"];

  let totalEdits = 0;
  for (const [uri, edits] of Object.entries(edit.changes)) {
    const fp = uriToPath(uri) ?? uri;
    parts.push(`${fp}: ${edits.length} edit(s)`);
    for (const e of edits as TextEdit[]) {
      const ln = e.range.start.line + 1;
      const col = e.range.start.character + 1;
      parts.push(`  Line ${ln}:${col} → "${e.newText}"`);
      totalEdits++;
    }
  }

  parts.unshift(`${totalEdits} edit(s) across ${Object.keys(edit.changes).length} file(s):\n`);

  return parts.join("\n");
}

// -- Implementations formatting --

export function formatImplementations(
  result: Location | Location[] | LocationLink[] | null,
  filePath: string,
  line: number,
  col: number,
): string {
  if (!result) {
    return `No implementations found at ${filePath}:${line}:${col}.`;
  }

  const locations = normalizeLocations(result);
  if (locations.length === 0) {
    return `No implementations found at ${filePath}:${line}:${col}.`;
  }

  const parts: string[] = [`Found ${locations.length} implementation(s):\n`];
  const truncated = locations.slice(0, MAX_RESULTS);

  for (const loc of truncated) {
    parts.push(formatLocation(loc));
    parts.push("");
  }

  if (locations.length > MAX_RESULTS) {
    parts.push(`Showing ${MAX_RESULTS} of ${locations.length} implementations. Results truncated.`);
  }

  return parts.join("\n");
}

// -- Call hierarchy formatting --

export function formatCallHierarchy(
  item: CallHierarchyItem,
  calls: CallHierarchyIncomingCall[] | CallHierarchyOutgoingCall[] | null,
  direction: "incoming" | "outgoing",
): string {
  const itemName = `${item.name} (${symbolKindToString(item.kind)})`;

  if (!calls || calls.length === 0) {
    return `No ${direction} calls for ${itemName}.`;
  }

  const parts: string[] = [`${direction === "incoming" ? "Callers of" : "Calls from"} ${itemName}:\n`];

  for (const call of calls) {
    if ("from" in call) {
      // IncomingCall
      const from = (call as CallHierarchyIncomingCall).from;
      const fp = uriToPath(from.uri) ?? from.uri;
      const ln = from.range.start.line + 1;
      parts.push(`  ← ${from.name} (${symbolKindToString(from.kind)}) at ${fp}:${ln}`);
    } else {
      // OutgoingCall
      const to = (call as CallHierarchyOutgoingCall).to;
      const fp = uriToPath(to.uri) ?? to.uri;
      const ln = to.range.start.line + 1;
      parts.push(`  → ${to.name} (${symbolKindToString(to.kind)}) at ${fp}:${ln}`);
    }
  }

  return parts.join("\n");
}

// -- Workspace symbols formatting --

export function formatWorkspaceSymbols(
  symbols: (SymbolInformation | WorkspaceSymbol)[] | null,
  query: string,
): string {
  if (!symbols || symbols.length === 0) {
    return `No symbols found matching "${query}".`;
  }

  const truncated = symbols.slice(0, MAX_RESULTS);
  const parts: string[] = [`Found ${symbols.length} symbol(s) matching "${query}":\n`];

  for (const sym of truncated) {
    const kind = symbolKindToString(sym.kind);
    if ("location" in sym && sym.location) {
      const loc = sym.location as Location | { uri: string };
      const fp = uriToPath(loc.uri) ?? loc.uri;
      if ("range" in loc) {
        const ln = loc.range.start.line + 1;
        parts.push(`  ${kind} ${sym.name} — ${fp}:${ln}`);
      } else {
        parts.push(`  ${kind} ${sym.name} — ${fp}`);
      }
    } else {
      parts.push(`  ${kind} ${sym.name}`);
    }
  }

  if (symbols.length > MAX_RESULTS) {
    parts.push(`\nShowing ${MAX_RESULTS} of ${symbols.length} symbols. Results truncated.`);
  }

  return parts.join("\n");
}

// -- Helpers --

function normalizeLocations(result: Location | Location[] | LocationLink[]): Location[] {
  if (Array.isArray(result)) {
    if (result.length === 0) return [];
    // Check if LocationLink
    if ("targetUri" in result[0]) {
      return (result as LocationLink[]).map(link => ({
        uri: link.targetUri,
        range: link.targetSelectionRange || link.targetRange,
      }));
    }
    return result as Location[];
  }
  return [result as Location];
}

function symbolKindToString(kind: SymbolKind): string {
  const names: Record<number, string> = {
    1: "File", 2: "Module", 3: "Namespace", 4: "Package",
    5: "Class", 6: "Method", 7: "Property", 8: "Field",
    9: "Constructor", 10: "Enum", 11: "Interface", 12: "Function",
    13: "Variable", 14: "Constant", 15: "String", 16: "Number",
    17: "Boolean", 18: "Array", 19: "Object", 20: "Key",
    21: "Null", 22: "EnumMember", 23: "Struct", 24: "Event",
    25: "Operator", 26: "TypeParameter",
  };
  return names[kind] ?? "Symbol";
}
