import { JdtLsClient, ClientStatus } from "./client.js";
import { getJdtlsHome, getWorkspaceDir, ensureJdtls } from "../jdtls/downloader.js";
import { checkJavaVersion } from "../jdtls/java-check.js";
import { detectProjectRoot } from "../utils/project-detect.js";
import { log, error as logError } from "../utils/logger.js";

const MAX_RESTARTS = 3;

interface ManagedInstance {
  client: JdtLsClient;
  restartCount: number;
}

export interface InstanceInfo {
  projectRoot: string;
  status: ClientStatus;
  uptimeMs: number;
}

export class InstanceManager {
  private instances = new Map<string, ManagedInstance>();
  private initializing = new Map<string, Promise<JdtLsClient>>();
  private javaChecked = false;
  private jdtlsEnsured = false;

  /**
   * Get a ready JdtLsClient for a given file path.
   * Auto-detects project root if not provided.
   * Lazily initializes JDT LS on first call.
   */
  async getInstance(filePath: string, explicitRoot?: string): Promise<JdtLsClient> {
    // Ensure Java and JDT LS are available (only on first call)
    await this.ensurePrerequisites();

    const projectRoot = this.resolveProjectRoot(filePath, explicitRoot);
    const normalized = projectRoot.replace(/\\/g, "/");

    // Check for existing ready instance
    const existing = this.instances.get(normalized);
    if (existing) {
      if (existing.client.status === "ready") {
        return existing.client;
      }
      // Instance is dead — try to restart
      if (existing.client.status === "dead") {
        if (existing.restartCount >= MAX_RESTARTS) {
          throw new Error(
            `JDT LS for ${projectRoot} has crashed repeatedly (${MAX_RESTARTS} times). ` +
            `Check Java installation and project configuration.`
          );
        }
        log(`Restarting JDT LS for ${projectRoot} (attempt ${existing.restartCount + 1}/${MAX_RESTARTS})`);
        this.instances.delete(normalized);
        // Fall through to create new instance
        return this.createInstance(normalized, projectRoot, existing.restartCount + 1);
      }
    }

    // Check for in-progress initialization (dedup concurrent calls)
    const pending = this.initializing.get(normalized);
    if (pending) {
      return pending;
    }

    return this.createInstance(normalized, projectRoot, 0);
  }

  private async createInstance(key: string, projectRoot: string, restartCount: number): Promise<JdtLsClient> {
    const initPromise = (async () => {
      const client = new JdtLsClient(
        projectRoot,
        getJdtlsHome(),
        getWorkspaceDir(projectRoot),
      );

      try {
        await client.start();
        this.instances.set(key, { client, restartCount });
        return client;
      } catch (err) {
        logError(`Failed to start JDT LS for ${projectRoot}`, err);
        throw err;
      } finally {
        this.initializing.delete(key);
      }
    })();

    this.initializing.set(key, initPromise);
    return initPromise;
  }

  private resolveProjectRoot(filePath: string, explicitRoot?: string): string {
    if (explicitRoot) {
      return explicitRoot;
    }

    const detected = detectProjectRoot(filePath);
    if (!detected) {
      throw new Error(
        `No Java project found. Expected pom.xml or build.gradle in a parent directory of ${filePath}.`
      );
    }
    return detected;
  }

  private async ensurePrerequisites(): Promise<void> {
    if (!this.javaChecked) {
      await checkJavaVersion();
      this.javaChecked = true;
    }
    if (!this.jdtlsEnsured) {
      await ensureJdtls();
      this.jdtlsEnsured = true;
    }
  }

  /**
   * Get info about all active instances.
   */
  getStatus(): InstanceInfo[] {
    const result: InstanceInfo[] = [];
    for (const [, managed] of this.instances) {
      result.push({
        projectRoot: managed.client.projectRoot,
        status: managed.client.status,
        uptimeMs: managed.client.uptime,
      });
    }
    // Include initializing instances
    for (const [key] of this.initializing) {
      if (!this.instances.has(key)) {
        result.push({
          projectRoot: key,
          status: "initializing",
          uptimeMs: 0,
        });
      }
    }
    return result;
  }

  /**
   * Shut down a specific instance.
   */
  async closeInstance(projectRoot: string): Promise<void> {
    const normalized = projectRoot.replace(/\\/g, "/");
    const managed = this.instances.get(normalized);
    if (managed) {
      await managed.client.stop();
      this.instances.delete(normalized);
    }
  }

  /**
   * Shut down all instances.
   */
  async closeAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const [, managed] of this.instances) {
      promises.push(managed.client.stop());
    }
    await Promise.allSettled(promises);
    this.instances.clear();
    this.initializing.clear();
  }
}
