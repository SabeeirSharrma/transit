/**
 * transit — The public API surface
 *
 * Usage:
 *   import { transit } from "transit"
 *   const rs = transit.rust("./rust")
 *   const jv = transit.java("./java")
 *   const result = await rs.processFile(buffer)
 *
 * In dev mode, the Proxy resolves function names against the scanner manifest
 * and dispatches through the appropriate transport bridge.
 */

import { resolve, join } from "node:path";
import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import type { Manifest, ManifestEntry, TransitConfig, BuildOverride } from "@sabeeirsharrma/schema";
import { loadConfigWithDefaults } from "@sabeeirsharrma/schema";

// ─── Runtime bridge types ─────────────────────────────────────────────────────

interface RuntimeBridge {
  /** Call a function on this bridge. Args are already JSON-serialized if needed. */
  call(functionName: string, args: unknown[]): Promise<unknown>;
  /** Start the bridge (e.g. launch resident process). */
  start?(): Promise<void>;
  /** Stop the bridge gracefully. */
  stop?(): Promise<void>;
}

// ─── TransitError ────────────────────────────────────────────────────────────

/**
 * Unified error type for all Transit cross-language calls.
 * Wraps errors from Rust, Java, and Python bridges with context.
 */
export class TransitError extends Error {
  /** Which language threw the error */
  readonly language: string;
  /** Which function was called */
  readonly functionName: string;
  /** The original error message (renamed from 'cause' to avoid shadowing Error.cause) */
  readonly detail: string;
  /** The original error object (if available) */
  readonly raw: unknown;

  constructor(opts: {
    language: string;
    functionName: string;
    detail: string;
    raw?: unknown;
  }) {
    const msg = `[${opts.language}] ${opts.functionName}: ${opts.detail}`;
    super(msg);
    this.name = "TransitError";
    this.language = opts.language;
    this.functionName = opts.functionName;
    this.detail = opts.detail;
    this.raw = opts.raw;
  }
}

// ─── Scanner (preloaded at module init) ───────────────────────────────────────

let scannerModule: any = null;

// Eagerly load the scanner native addon on module init
try {
  const imported = await import("@sabeeirsharrma/scanner");
  // CJS-to-ESM interop: static analysis may only lift some exports as named.
  // Fall back to the .default object (full CJS module.exports) if available.
  scannerModule = imported.default ?? imported;
} catch (err) {
  // Scanner not compiled — functions will be discovered via bridge fallback
  console.error(
    "\n[transit] ⚠ WARNING: Scanner failed to load. Function discovery is disabled.\n" +
    "To fix, run one of:\n" +
    "  cd packages/transit-scanner && cargo build --release && cp target/release/libtransit_scanner.so index.node\n" +
    "  napi build --release\n" +
    `Error: ${(err as Error).message}\n`
  );
}

function scanDirectorySync(dir: string): Manifest {
  if (!scannerModule) {
    return { entries: [], generatedAt: Date.now() };
  }
  try {
    const json = scannerModule.scanDirectory(resolve(dir));
    const raw = JSON.parse(json);
    // Normalize snake_case (from Rust scanner) to camelCase
    const entries: ManifestEntry[] = raw.entries.map((e: any) => ({
      language: e.language,
      sourceFile: e.source_file ?? e.sourceFile,
      functionName: e.function_name ?? e.functionName,
      signature: e.signature,
      export_tier: e.export_tier ?? e.exportTier,
      exportTier: e.export_tier ?? e.exportTier,
    }));
    return { entries, generatedAt: raw.generated_at ?? raw.generatedAt };
  } catch (err) {
    console.error(`[transit] Scanner error for ${dir}: ${(err as Error).message}`);
    return { entries: [], generatedAt: Date.now() };
  }
}

/**
 * Scan a single file and return manifest entries.
 * Used by the file watcher for incremental updates.
 */
function scanFileSync(filePath: string): ManifestEntry[] {
  if (!scannerModule) {
    return [];
  }
  try {
    const json = scannerModule.scanFilePath(resolve(filePath));
    const raw = JSON.parse(json);
    return raw.map((e: any) => ({
      language: e.language,
      sourceFile: e.source_file ?? e.sourceFile,
      functionName: e.function_name ?? e.functionName,
      signature: e.signature,
      export_tier: e.export_tier ?? e.exportTier,
      exportTier: e.export_tier ?? e.exportTier,
    }));
  } catch (err) {
    console.error(`[transit] Scanner error for ${filePath}: ${(err as Error).message}`);
    return [];
  }
}

/**
 * Invalidate cache for a specific file (e.g. on file delete).
 */
function invalidateFileCache(root: string, filePath: string): void {
  if (!scannerModule) return;
  try {
    scannerModule.invalidateCache(resolve(root), resolve(filePath));
  } catch (err) {
    console.error(`[transit] Cache invalidation error: ${(err as Error).message}`);
  }
}

/**
 * Clear the entire cache for a directory.
 */
function clearScanCache(root: string): void {
  if (!scannerModule) return;
  try {
    scannerModule.clearCache(resolve(root));
  } catch (err) {
    console.error(`[transit] Cache clear error: ${(err as Error).message}`);
  }
}

// ─── Manifest-aware Proxy ─────────────────────────────────────────────────────

type FunctionProxy = {
  [key: string]: (...args: unknown[]) => Promise<unknown>;
} & {
  _manifest: Manifest;
  _bridge: RuntimeBridge;
  _lang: string;
  /** List all discovered functions */
  _functions(): ManifestEntry[];
};

/**
 * Create a Proxy-based language handle that resolves function names
 * against the scanner manifest and dispatches through the bridge.
 */
function createLanguageHandle(
  lang: string,
  manifest: Manifest,
  bridge: RuntimeBridge
): FunctionProxy {
  // Build lookup maps for fast resolution
  const flatMap = new Map<string, ManifestEntry>();
  const fileMap = new Map<string, Map<string, ManifestEntry>>();

  for (const entry of manifest.entries) {
    const filename = entry.sourceFile
      .replace(/^.*\//, "")
      .replace(/\.[^.]+$/, "");

    // Register under original name (snake_case from Rust)
    if (!flatMap.has(entry.functionName)) {
      flatMap.set(entry.functionName, entry);
    } else {
      flatMap.delete(entry.functionName);
    }

    // Also register under camelCase (napi-rs convention)
    // Only if camelCase differs from original (avoids self-delete for names without underscores)
    const camelName = entry.functionName.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
    if (camelName !== entry.functionName) {
      if (!flatMap.has(camelName)) {
        flatMap.set(camelName, entry);
      } else {
        flatMap.delete(camelName);
      }
    }

    // Also register under snake_case (for camelCase Java/Python names)
    const snakeName = entry.functionName.replace(/([A-Z])/g, (_: string, c: string) => '_' + c.toLowerCase());
    if (snakeName !== entry.functionName) {
      if (!flatMap.has(snakeName)) {
        flatMap.set(snakeName, entry);
      } else {
        flatMap.delete(snakeName);
      }
    }

    if (!fileMap.has(filename)) {
      fileMap.set(filename, new Map());
    }
    fileMap.get(filename)!.set(entry.functionName, entry);
    if (camelName !== entry.functionName) {
      fileMap.get(filename)!.set(camelName, entry);
    }
    if (snakeName !== entry.functionName) {
      fileMap.get(filename)!.set(snakeName, entry);
    }
  }

  const handle: FunctionProxy = {
    _manifest: manifest,
    _bridge: bridge,
    _lang: lang,
    _functions() {
      return manifest.entries;
    },
  } as FunctionProxy;

  return new Proxy(handle, {
    get(target, prop: string | symbol) {
      if (typeof prop === "string" && prop.startsWith("_")) {
        return Reflect.get(target, prop);
      }
      if (typeof prop !== "string") return undefined;

      // String disambiguation: transit.rs["filename"]["function"]()
      if (fileMap.has(prop)) {
        const fileFunctions = fileMap.get(prop)!;
        return new Proxy({} as FunctionProxy, {
          get(_fileTarget, fnProp: string | symbol) {
            if (typeof fnProp !== "string") return undefined;
            if (!fileFunctions.has(fnProp)) {
              throw new Error(
                `Function "${fnProp}" not found in file "${prop}". Available: ${[...fileFunctions.keys()].join(", ")}`
              );
            }
            return (...args: unknown[]) => target._bridge.call(fnProp, args);
          },
        });
      }

      // Flat namespace: transit.rs.functionName()
      if (flatMap.has(prop)) {
        return (...args: unknown[]) => target._bridge.call(prop, args);
      }

      // Not found — give helpful error
      throw new Error(
        `Function "${prop}" not found in ${target._lang}. Available: ${[...flatMap.keys()].join(", ")}`
      );
    },
  });
}

// ─── Rust bridge (in-process native addon) ────────────────────────────────────

class RustDevBridge implements RuntimeBridge {
  private addonPath: string;
  private addon: any = null;
  private buildOverride?: BuildOverride;

  constructor(dir: string, buildOverride?: BuildOverride) {
    this.addonPath = resolve(dir);
    this.buildOverride = buildOverride;
  }

  async call(functionName: string, args: unknown[]): Promise<unknown> {
    if (!this.addon) {
      this.addon = await this.loadAddon();
    }

    const camelName = functionName.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
    const fn = this.addon[camelName] ?? this.addon[functionName];
    if (!fn) {
      throw new TransitError({
        language: "rust",
        functionName,
        detail: `Function not found. Available: ${Object.keys(this.addon).join(", ")}`,
      });
    }
    try {
      return await fn(...args);
    } catch (err) {
      throw new TransitError({
        language: "rust",
        functionName,
        detail: (err as Error).message ?? String(err),
        raw: err,
      });
    }
  }

  private async loadAddon(): Promise<any> {
    const candidates = [
      join(this.addonPath, "transit-scanner.node"),
      join(this.addonPath, "index.node"),
      join(this.addonPath, "target/release"),
      join(this.addonPath, "target/debug"),
    ];

    let addonPath: string | null = null;

    for (const candidate of candidates) {
      if (candidate.endsWith(".node")) {
        if (existsSync(candidate) && statSync(candidate).isFile()) {
          addonPath = candidate;
          break;
        }
      } else {
        try {
          const files = readdirSync(candidate);
          const soFile = files.find((f: string) => f.endsWith(".node") || f.endsWith(".so"));
          if (soFile) {
            addonPath = join(candidate, soFile);
            break;
          }
        } catch {}
      }
    }

    if (!addonPath) {
      throw new Error(
        `Rust addon not found. Run "cargo build --release" in ${this.addonPath} first.`
      );
    }

    // Load native addon via createRequire (CJS interop for .node/.so files)
    const { createRequire } = await import("node:module");
    const { pathToFileURL } = await import("node:url");
    const req = createRequire(pathToFileURL(import.meta.url).href);
    return req(addonPath);
  }
}

// ─── Java bridge (resident process + binary protocol) ─────────────────────────

class JavaDevBridge implements RuntimeBridge {
  private dir: string;
  private processManager: any = null;
  private started = false;
  private buildOverride?: BuildOverride;
  private maxRestarts: number;
  private classpathOverride?: string;
  private mainClassOverride?: string;

  constructor(
    dir: string,
    buildOverride?: BuildOverride,
    maxRestarts: number = 3,
    options?: { classpath?: string; mainClass?: string }
  ) {
    this.dir = resolve(dir);
    this.buildOverride = buildOverride;
    this.maxRestarts = maxRestarts;
    this.classpathOverride = options?.classpath;
    this.mainClassOverride = options?.mainClass;
  }

  async call(functionName: string, args: unknown[]): Promise<unknown> {
    if (!this.started) {
      await this.start();
    }
    // Unwrap single-element args: proxy passes [obj] but Java expects {obj}
    // (matches Python bridge behavior — consistent API across all languages)
    const payload = args.length === 1 ? args[0] : args;
    try {
      return await this.processManager.callFunction(functionName, JSON.stringify(payload));
    } catch (err) {
      throw new TransitError({
        language: "java",
        functionName,
        detail: (err as Error).message ?? String(err),
        raw: err,
      });
    }
  }

  async start(): Promise<void> {
    if (this.started) return;

    const { JavaProcessManager } = await import("@sabeeirsharrma/java-runtime");
    const classpath = this.classpathOverride ?? this.findClasspath();
    const mainClass = this.mainClassOverride ?? this.findMainClass(classpath);

    this.processManager = new JavaProcessManager({
      javaDir: this.dir,
      classpath,
      mainClass,
      jvmArgs: this.buildOverride?.jvmArgs,
      maxRestarts: this.maxRestarts,
    });

    await this.processManager.start();
    this.started = true;
  }

  async stop(): Promise<void> {
    if (this.processManager) {
      await this.processManager.stop();
      this.processManager = null;
      this.started = false;
    }
  }

  private findClasspath(): string {
    // Walk up from scan dir to find compiled classes (build/, out/, target/)
    // Java source dirs are often like .../src/main/java — classes live at .../build/
    let dir = this.dir;
    const maxDepth = 5;
    for (let i = 0; i < maxDepth; i++) {
      for (const subdir of ["build", "out", "target"]) {
        const candidate = join(dir, subdir);
        if (existsSync(candidate) && existsSync(join(candidate, "transit", "java", "TransitService.class"))) {
          return candidate;
        }
      }
      const parent = resolve(dir, "..");
      if (parent === dir) break;
      dir = parent;
    }
    // Fallback: check direct children
    for (const subdir of ["build", "out", "target"]) {
      const candidate = join(this.dir, subdir);
      if (existsSync(candidate)) return candidate;
    }
    return this.dir;
  }

  private findMainClass(classpath: string): string {
    // First, check if the default transit.java.TransitService exists
    const transitServiceFile = join(classpath, "transit", "java", "TransitService.class");
    if (existsSync(transitServiceFile)) return "transit.java.TransitService";

    // Auto-detect: walk classpath looking for any class with public static void main
    try {
      const walkForMain = (dir: string, prefix: string): string | null => {
        try {
          const entries = readdirSync(dir);
          for (const entry of entries) {
            const fullPath = join(dir, entry);
            const stat = statSync(fullPath);
            if (stat.isDirectory()) {
              const result = walkForMain(fullPath, prefix ? `${prefix}.${entry}` : entry);
              if (result) return result;
            } else if (entry.endsWith(".class") && !entry.startsWith("Transit")) {
              // Convert file path to class name: com/example/App.class → com.example.App
              const className = prefix
                ? `${prefix}.${entry.replace(".class", "")}`
                : entry.replace(".class", "");
              // Check if this class has a main method by reading the .class file
              try {
                const bytes = readFileSync(fullPath);
                // Look for the method name "main" in the constant pool (simplified check)
                const content = bytes.toString("latin1");
                if (content.includes("main") && content.includes("([Ljava/lang/String;)V")) {
                  return className;
                }
              } catch {}
            }
          }
        } catch {}
        return null;
      };

      const detected = walkForMain(classpath, "");
      if (detected) return detected;
    } catch {}

    // Fallback
    return "transit.java.TransitService";
  }
}

// ─── Python bridge (resident process + binary protocol) ────────────────────────

class PythonDevBridge implements RuntimeBridge {
  private dir: string;
  private processManager: any = null;
  private started = false;
  private maxRestarts: number;
  private serverScript?: string;
  private buildOverride?: BuildOverride;
  private extraEnv?: Record<string, string>;

  constructor(dir: string, maxRestarts: number = 3, serverScript?: string, buildOverride?: BuildOverride, extraEnv?: Record<string, string>) {
    this.dir = resolve(dir);
    this.maxRestarts = maxRestarts;
    this.serverScript = serverScript;
    this.buildOverride = buildOverride;
    this.extraEnv = extraEnv;
  }

  async call(functionName: string, args: unknown[]): Promise<unknown> {
    if (!this.started) {
      await this.start();
    }
    // Unwrap single-element args: proxy passes [obj] but Python expects {obj}
    const payload = args.length === 1 ? args[0] : args;
    try {
      return await this.processManager.callFunction(functionName, JSON.stringify(payload));
    } catch (err) {
      throw new TransitError({
        language: "python",
        functionName,
        detail: (err as Error).message ?? String(err),
        raw: err,
      });
    }
  }

  async start(): Promise<void> {
    if (this.started) return;

    const { PythonProcessManager } = await import("@sabeeirsharrma/python-runtime");

    // Build extra env vars from config + caller-provided env
    const env: Record<string, string> = { ...this.extraEnv };
    if (this.buildOverride?.fastJson) {
      env.TRANSIT_USE_ORJSON = "1";
    }

    this.processManager = new PythonProcessManager({
      pythonDir: this.dir,
      maxRestarts: this.maxRestarts,
      serverScript: this.serverScript,
      interpreter: this.buildOverride?.interpreter,
      env,
    });

    await this.processManager.start();
    this.started = true;
  }

  async stop(): Promise<void> {
    if (this.processManager) {
      await this.processManager.stop();
      this.processManager = null;
      this.started = false;
    }
  }
}

// ─── Main transit object ──────────────────────────────────────────────────────

class Transit {
  private handles = new Map<string, FunctionProxy>();
  private bridges: RuntimeBridge[] = [];
  private _config: Required<TransitConfig>;
  private _configDir: string;
  private shutdownRegistered = false;

  constructor(configDir?: string) {
    this._configDir = configDir ?? process.cwd();
    this._config = loadConfigWithDefaults(this._configDir);

    if (Object.keys(this._config.build).length > 0 || this._config.exports.length > 0) {
      console.error(`[transit] Config loaded from ${this._configDir}`);
    }
  }

  /**
   * Register graceful shutdown handler.
   * Called lazily on first bridge creation to avoid registering if no bridges are used.
   */
  private registerShutdown(): void {
    if (this.shutdownRegistered) return;
    this.shutdownRegistered = true;

    const shutdown = async () => {
      for (const bridge of this.bridges) {
        try {
          await bridge.stop?.();
        } catch {}
      }
    };

    process.on("exit", () => {
      // Synchronous cleanup attempt — best effort
    });
    process.on("SIGINT", async () => {
      await shutdown();
      process.exit(0);
    });
    process.on("SIGTERM", async () => {
      await shutdown();
      process.exit(0);
    });
  }

  /** The resolved config (always complete with defaults). */
  get config(): Required<TransitConfig> {
    return this._config;
  }

  /** The directory the config was loaded from. */
  get configDir(): string {
    return this._configDir;
  }

  /**
   * Reload config from disk. Call this if transit.config.json changes.
   */
  reloadConfig(dir?: string): void {
    if (dir) this._configDir = dir;
    this._config = loadConfigWithDefaults(this._configDir);
    console.error(`[transit] Config reloaded from ${this._configDir}`);
  }

  rust(dir: string): FunctionProxy {
    const key = `rust:${resolve(dir)}`;
    if (this.handles.has(key)) return this.handles.get(key)!;

    const buildOverride = this._config.build?.rust;
    const bridge = new RustDevBridge(dir, buildOverride);
    this.bridges.push(bridge);
    this.registerShutdown();
    const manifest = scanDirectorySync(dir);
    this.mergeConfigExports(manifest, dir);
    const handle = createLanguageHandle("rust", manifest, bridge);
    this.handles.set(key, handle);

    if (manifest.entries.length > 0) {
      const fns = manifest.entries.map((e) => e.functionName).join(", ");
      console.error(`[transit] Rust: discovered ${manifest.entries.length} functions: ${fns}`);
    }

    return handle;
  }

  java(dir: string, options?: { classpath?: string; mainClass?: string }): FunctionProxy {
    const key = `java:${resolve(dir)}`;
    if (this.handles.has(key)) return this.handles.get(key)!;

    const buildOverride = this._config.build?.java;
    const bridge = new JavaDevBridge(dir, buildOverride, this._config.maxRestarts, options);
    this.bridges.push(bridge);
    this.registerShutdown();
    // Scan Java source files for public methods
    const manifest = scanDirectorySync(dir);
    this.mergeConfigExports(manifest, dir);
    const handle = createLanguageHandle("java", manifest, bridge);
    this.handles.set(key, handle);

    if (manifest.entries.length > 0) {
      const fns = manifest.entries.map((e) => e.functionName).join(", ");
      console.error(`[transit] Java: discovered ${manifest.entries.length} functions: ${fns}`);
    }

    return handle;
  }

  python(dir: string, options?: { serverScript?: string; env?: Record<string, string> }): FunctionProxy {
    const key = `python:${resolve(dir)}`;
    if (this.handles.has(key)) return this.handles.get(key)!;

    const buildOverride = this._config.build?.python;
    const bridge = new PythonDevBridge(dir, this._config.maxRestarts, options?.serverScript, buildOverride, options?.env);
    this.bridges.push(bridge);
    this.registerShutdown();
    const manifest = scanDirectorySync(dir);
    this.mergeConfigExports(manifest, dir);
    const handle = createLanguageHandle("python", manifest, bridge);
    this.handles.set(key, handle);

    if (manifest.entries.length > 0) {
      const fns = manifest.entries.map((e) => e.functionName).join(", ");
      console.error(`[transit] Python: discovered ${manifest.entries.length} functions: ${fns}`);
    }

    return handle;
  }

  info(): void {
    for (const [key, handle] of this.handles) {
      const [lang, dir] = key.split(":");
      const fns = handle._functions();
      console.log(`${lang} (${dir}): ${fns.length} functions`);
      for (const fn of fns) {
        console.log(`  - ${fn.functionName} [tier ${fn.export_tier}] (${fn.signature})`);
      }
    }
  }

  /**
   * Merge config export overrides into a manifest.
   * Config exports are additive — they don't replace scanner results.
   */
  private mergeConfigExports(manifest: Manifest, dir: string): void {
    if (!this._config.exports || this._config.exports.length === 0) return;

    for (const exp of this._config.exports) {
      const fullPath = resolve(dir, exp.file);
      // Check if this export already exists in the manifest (scanner found it)
      const alreadyExists = manifest.entries.some(
        (e) =>
          e.functionName === exp.function &&
          (e.sourceFile === fullPath || e.sourceFile.endsWith(exp.file))
      );
      if (!alreadyExists) {
        manifest.entries.push({
          language: "", // will be inferred by the bridge
          sourceFile: fullPath,
          functionName: exp.function,
          signature: `// config export: ${exp.function}`,
          export_tier: 1,
          exportTier: 1,
        });
      }
    }
  }
}

// ─── Export ───────────────────────────────────────────────────────────────────

export const transit = new Transit();
export default transit;

export { scanFileSync, invalidateFileCache, clearScanCache };

export type { Manifest, ManifestEntry, TransitConfig, BuildOverride, LinkOverride, ExportOverride } from "@sabeeirsharrma/schema";
export { loadConfig, loadConfigWithDefaults, validateConfig, mergeWithDefaults } from "@sabeeirsharrma/schema";
