import * as fs from "node:fs";
import * as path from "node:path";

const BUILD_FILES = ["pom.xml", "build.gradle", "build.gradle.kts"];

/**
 * Walk up from a file path to find the Java project root.
 * Looks for pom.xml or build.gradle/build.gradle.kts.
 * For multi-module projects, returns the topmost project root.
 * If both pom.xml and build.gradle exist at the same level, prefers pom.xml.
 */
export function detectProjectRoot(filePath: string): string | null {
  let current = path.dirname(path.resolve(filePath));
  let foundRoot: string | null = null;

  const root = path.parse(current).root;

  while (current !== root) {
    for (const buildFile of BUILD_FILES) {
      const candidate = path.join(current, buildFile);
      if (fs.existsSync(candidate)) {
        foundRoot = current;
        // Don't break — keep walking up to find topmost root
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return foundRoot;
}
