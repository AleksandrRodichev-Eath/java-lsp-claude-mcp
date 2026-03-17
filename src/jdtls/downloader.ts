import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as https from "node:https";
import * as http from "node:http";
import { log, error as logError } from "../utils/logger.js";
import { glob } from "glob";

const JDTLS_VERSION = "1.43.0";
const JDTLS_MIRROR_BASE = `https://download.eclipse.org/jdtls/milestones/${JDTLS_VERSION}`;
const INSTALL_BASE = path.join(os.homedir(), ".java-lsp-mcp");
const JDTLS_HOME = path.join(INSTALL_BASE, "jdtls");

export function getJdtlsHome(): string {
  return JDTLS_HOME;
}

export function getWorkspaceDir(projectRoot: string): string {
  // Simple hash of project root for unique workspace dirs
  const hash = simpleHash(path.resolve(projectRoot));
  return path.join(INSTALL_BASE, "workspaces", hash);
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Find the equinox launcher JAR inside JDT LS installation.
 */
export async function findLauncherJar(): Promise<string> {
  const pattern = path.join(JDTLS_HOME, "plugins", "org.eclipse.equinox.launcher_*.jar").replace(/\\/g, "/");
  const matches = await glob(pattern);
  if (matches.length === 0) {
    throw new Error(`Launcher JAR not found in ${JDTLS_HOME}/plugins/`);
  }
  return matches[0];
}

/**
 * Get the platform-specific JDT LS config directory.
 */
export function getConfigDir(): string {
  const platform = process.platform;
  const configName = platform === "win32" ? "config_win" :
                     platform === "darwin" ? "config_mac" : "config_linux";
  return path.join(JDTLS_HOME, configName);
}

/**
 * Check if JDT LS is already installed.
 */
export async function isJdtlsInstalled(): Promise<boolean> {
  try {
    await findLauncherJar();
    return true;
  } catch {
    return false;
  }
}

/**
 * Download JDT LS if not already installed.
 */
export async function ensureJdtls(): Promise<void> {
  if (await isJdtlsInstalled()) {
    log("JDT LS already installed.");
    return;
  }

  log(`Downloading JDT LS ${JDTLS_VERSION}...`);

  // Fetch latest.txt to get exact filename
  const latestUrl = `${JDTLS_MIRROR_BASE}/latest.txt`;
  let tarFilename: string;
  try {
    const latestContent = await httpGet(latestUrl);
    tarFilename = latestContent.trim();
  } catch {
    // Fallback: construct filename directly
    tarFilename = `jdt-language-server-${JDTLS_VERSION}.tar.gz`;
    log("Could not fetch latest.txt, using version-based filename.");
  }

  const tarUrl = `${JDTLS_MIRROR_BASE}/${tarFilename}`;

  // Create install directory
  fs.mkdirSync(JDTLS_HOME, { recursive: true });

  const tarPath = path.join(INSTALL_BASE, `jdtls-${JDTLS_VERSION}.tar.gz`);

  try {
    // Download
    log(`Downloading from ${tarUrl}...`);
    await downloadFile(tarUrl, tarPath);

    // Extract using tar module
    log("Extracting JDT LS...");
    const tar = await import("tar");
    await tar.x({ file: tarPath, cwd: JDTLS_HOME });

    // Verify installation
    await findLauncherJar();
    log("JDT LS installed successfully.");
  } catch (err) {
    // Cleanup on failure
    logError("JDT LS installation failed", err);
    try { fs.rmSync(JDTLS_HOME, { recursive: true, force: true }); } catch { /* ignore */ }
    throw new Error(
      `Failed to download JDT LS. Check internet connection.\n` +
      `URL: ${tarUrl}\n` +
      `${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    // Cleanup tar file
    try { fs.unlinkSync(tarPath); } catch { /* ignore */ }
  }
}

function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const handler = (res: http.IncomingMessage) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpGet(res.headers.location).then(resolve, reject);
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve(data));
      res.on("error", reject);
    };

    const mod = url.startsWith("https") ? https : http;
    mod.get(url, handler).on("error", reject);
  });
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(dest);
    fs.mkdirSync(dir, { recursive: true });

    const handler = (res: http.IncomingMessage) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location, dest).then(resolve, reject);
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(); });
      file.on("error", (err) => {
        fs.unlinkSync(dest);
        reject(err);
      });
    };

    const mod = url.startsWith("https") ? https : http;
    mod.get(url, handler).on("error", reject);
  });
}
