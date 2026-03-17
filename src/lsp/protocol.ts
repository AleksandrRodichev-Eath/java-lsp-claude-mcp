import {
  ClientCapabilities,
} from "vscode-languageserver-protocol";

/**
 * Client capabilities we declare to JDT LS.
 * Enables all features we plan to use.
 */
export const CLIENT_CAPABILITIES: ClientCapabilities = {
  textDocument: {
    definition: { dynamicRegistration: false, linkSupport: true },
    references: { dynamicRegistration: false },
    hover: {
      dynamicRegistration: false,
      contentFormat: ["markdown", "plaintext"],
    },
    rename: { dynamicRegistration: false, prepareSupport: true },
    implementation: { dynamicRegistration: false, linkSupport: true },
    callHierarchy: { dynamicRegistration: false },
    publishDiagnostics: {
      relatedInformation: true,
      tagSupport: { valueSet: [1, 2] },
    },
    synchronization: {
      didSave: true,
      willSave: false,
      willSaveWaitUntil: false,
    },
  },
  workspace: {
    symbol: {
      dynamicRegistration: false,
      symbolKind: {
        valueSet: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
                   14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26],
      },
    },
    workspaceFolders: true,
  },
};

/** Timeout for individual LSP requests (ms). */
export const REQUEST_TIMEOUT = 30_000;

/** Timeout for JDT LS initialization (ms). */
export const INIT_TIMEOUT = 120_000;

/** Timeout for diagnostics notification (ms). */
export const DIAGNOSTICS_TIMEOUT = 10_000;

/** Max references/results to return before truncating. */
export const MAX_RESULTS = 50;
