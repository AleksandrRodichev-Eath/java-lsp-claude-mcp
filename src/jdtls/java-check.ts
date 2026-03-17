import { execFile } from "node:child_process";
import * as path from "node:path";
import { log, error as logError } from "../utils/logger.js";

const MIN_JAVA_VERSION = 21;

/**
 * Find the java executable path, checking JAVA_HOME first, then PATH.
 */
export function findJavaExecutable(): string {
  const javaHome = process.env.JAVA_HOME;
  if (javaHome) {
    const javaBin = path.join(javaHome, "bin", process.platform === "win32" ? "java.exe" : "java");
    return javaBin;
  }
  return "java";
}

/**
 * Check that Java 21+ is installed and return the version string.
 * Throws with a clear error message if Java is missing or too old.
 */
export async function checkJavaVersion(): Promise<string> {
  const javaPath = findJavaExecutable();

  return new Promise((resolve, reject) => {
    execFile(javaPath, ["-version"], (err, _stdout, stderr) => {
      if (err) {
        reject(new Error(
          `Java not found. Install JDK ${MIN_JAVA_VERSION}+ and ensure 'java' is on PATH or set JAVA_HOME.\n` +
          `Tried: ${javaPath}`
        ));
        return;
      }

      // java -version outputs to stderr
      const output = stderr || _stdout;
      const match = output.match(/version "(\d+)(?:\.(\d+))?/);
      if (!match) {
        reject(new Error(`Could not parse Java version from output: ${output}`));
        return;
      }

      const major = parseInt(match[1], 10);
      if (major < MIN_JAVA_VERSION) {
        reject(new Error(
          `Java ${MIN_JAVA_VERSION}+ required but found Java ${major}. ` +
          `Please install JDK ${MIN_JAVA_VERSION}+ and update PATH or JAVA_HOME.`
        ));
        return;
      }

      log(`Java ${major} found at: ${javaPath}`);
      resolve(output.trim());
    });
  });
}
