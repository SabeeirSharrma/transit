/**
 * transit dev — Live dev mode with file watching
 *
 * Loads transit.config.json, scans all registered language directories,
 * starts file watchers, and re-scans on changes. Logs function discovery
 * and provides a clean shutdown path.
 */

import { resolve, join } from "node:path";
import { watch, readFileSync, readdirSync, statSync, type FSWatcher } from "node:fs";
import { existsSync } from "node:fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DevOptions {
  /** Project root directory (default: cwd) */
  dir?: string;
  /** Verbose output — show per-file scan results */
  verbose?: boolean;
}

interface LanguageDir {
  lang: string;
  dir: string;
  absDir: string;
}

interface ScanResult {
  dir: string;
  functions: string[];
  changed: string[];
  added: string[];
  removed: string[];
  signatureChanges: { name: string; old: string; new: string }[];
}

// ─── Scanner wrapper ────────────────────────────────────────────────────────

let scannerModule: any = null;

async function loadScanner(): Promise<boolean> {
  try {
    const imported = await import("@sabeeirsharrma/scanner");
    scannerModule = imported.default ?? imported;
    return true;
  } catch {
    // Try loading through the transit package
    try {
      const transit = await import("@sabeeirsharrma/transit");
      // Access the scanner functions from the transit package
      scannerModule = transit;
      return true;
    } catch {
      return false;
    }
  }
}

function scanDirectory(dir: string): { name: string; signature: string }[] {
  if (!scannerModule) return [];
  try {
    const json = scannerModule.scanDirectory(resolve(dir));
    const raw = JSON.parse(json);
    return (raw.entries ?? []).map((e: any) => ({
      name: e.function_name ?? e.functionName,
      signature: e.signature ?? "",
    }));
  } catch (err) {
    console.error(`[transit] Scan error for ${dir}: ${(err as Error).message}`);
    return [];
  }
}

function scanFile(filePath: string): { name: string; signature: string }[] {
  if (!scannerModule) return [];
  try {
    const json = scannerModule.scanFilePath(resolve(filePath));
    const raw = JSON.parse(json);
    return raw.map((e: any) => ({
      name: e.function_name ?? e.functionName,
      signature: e.signature ?? "",
    }));
  } catch {
    return [];
  }
}

// ─── Config loading ─────────────────────────────────────────────────────────

interface TransitConfig {
  build?: Record<string, any>;
  exports?: { file: string; function: string }[];
}

function loadConfig(dir: string): TransitConfig {
  const configPath = join(dir, "transit.config.json");
  if (!existsSync(configPath)) {
    return {};
  }
  try {
    const content = readFileSync(configPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

// ─── Language directory discovery ────────────────────────────────────────────

/**
 * Find all language source directories from config and source files.
 * Falls back to scanning common directory patterns if no config exists.
 */
function discoverLanguageDirs(dir: string, config: TransitConfig): LanguageDir[] {
  const dirs: LanguageDir[] = [];
  const seen = new Set<string>();

  // 1. From exports in config
  if (config.exports && config.exports.length > 0) {
    for (const exp of config.exports) {
      const filePath = join(dir, exp.file);
      const fileDir = resolve(dir, exp.file.replace(/[/\\][^/\\]+$/, ""));
      if (!seen.has(fileDir)) {
        seen.add(fileDir);
        const lang = detectLanguageFromExtension(exp.file);
        if (lang) {
          dirs.push({ lang, dir: exp.file.replace(/[/\\][^/\\]+$/, ""), absDir: fileDir });
        }
      }
    }
  }

  // 2. From build keys in config
  if (config.build) {
    for (const lang of Object.keys(config.build)) {
      const candidates = getLanguageDirCandidates(lang, dir);
      for (const candidate of candidates) {
        if (!seen.has(candidate.absDir) && existsSync(candidate.absDir)) {
          seen.add(candidate.absDir);
          dirs.push(candidate);
        }
      }
    }
  }

  // 3. Fallback: scan immediate subdirectories for source files
  if (dirs.length === 0) {
    const extMap: Record<string, string[]> = {
      rust: [".rs"],
      java: [".java"],
      python: [".py"],
    };

    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (SKIP_DIRS.has(entry)) continue;
        const subDir = join(dir, entry);
        let stat;
        try {
          stat = statSync(subDir);
        } catch {
          continue;
        }
        if (!stat.isDirectory()) continue;

        // Check if this subdirectory contains source files
        for (const [lang, exts] of Object.entries(extMap)) {
          if (hasLanguageFiles(subDir, exts)) {
            if (!seen.has(subDir)) {
              seen.add(subDir);
              dirs.push({ lang, dir: entry, absDir: subDir });
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return dirs;
}

/**
 * Check if a directory contains files with the given extensions.
 * Only checks immediate children (not recursive) for efficiency.
 */
function hasLanguageFiles(dir: string, extensions: string[]): boolean {
  try {
    const entries = readdirSync(dir);
    return entries.some((entry) => {
      if (SKIP_DIRS.has(entry)) return false;
      const fullPath = join(dir, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        return false;
      }
      if (!stat.isFile()) return false;
      const ext = "." + entry.split(".").pop()?.toLowerCase();
      return extensions.includes(ext);
    });
  } catch {
    return false;
  }
}

function detectLanguageFromExtension(file: string): string | null {
  if (file.endsWith(".rs")) return "rust";
  if (file.endsWith(".java")) return "java";
  if (file.endsWith(".py")) return "python";
  return null;
}

function getLanguageDirCandidates(lang: string, rootDir: string): LanguageDir[] {
  const candidates: [string, string][] = [];
  switch (lang) {
    case "rust":
      candidates.push(["rust", "src"], ["rust", "lib"], ["rust", "."]);
      break;
    case "java":
      candidates.push(["java", "src/main/java"], ["java", "src"], ["java", "."]);
      break;
    case "python":
      candidates.push(["python", "."], ["python", "src"]);
      break;
  }
  return candidates.map(([l, subDir]) => ({
    lang: l,
    dir: subDir,
    absDir: join(rootDir, subDir),
  }));
}

// ─── File watcher ───────────────────────────────────────────────────────────

const SOURCE_EXTENSIONS = new Set([
  ".rs", ".java", ".py", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx",
]);

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "target",
  ".next", "__pycache__", ".cache", ".transit-cache",
]);

class DirWatcher {
  private watchers = new Map<string, FSWatcher>();
  private previousFunctions = new Map<string, Map<string, string>>();
  private verbose: boolean;
  private onChange: (dir: string, result: ScanResult) => void;

  constructor(verbose: boolean, onChange: (dir: string, result: ScanResult) => void) {
    this.verbose = verbose;
    this.onChange = onChange;
  }

  watch(dirs: LanguageDir[]): void {
    for (const ld of dirs) {
      this.watchDir(ld.absDir, ld.dir, ld.lang);
    }
  }

  private watchDir(absDir: string, relDir: string, lang: string): void {
    if (this.watchers.has(absDir)) return;

    // Initial scan
    const initialFunctions = scanDirectory(absDir);
    const sigMap = new Map<string, string>();
    for (const fn of initialFunctions) {
      sigMap.set(fn.name, fn.signature);
    }
    this.previousFunctions.set(absDir, sigMap);

    if (this.verbose) {
      console.log(`[transit] ${lang} (${relDir}): ${initialFunctions.length} functions`);
      for (const fn of initialFunctions) {
        console.log(`  - ${fn.name}`);
      }
    } else {
      const names = initialFunctions.map((f) => f.name).join(", ");
      console.log(`[transit] ${lang}: ${initialFunctions.length} functions${names ? ` (${names})` : ""}`);
    }

    try {
      const watcher = watch(absDir, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        const ext = "." + filename.split(".").pop()?.toLowerCase();
        if (!SOURCE_EXTENSIONS.has(ext)) return;
        if (SKIP_DIRS.has(filename.split("/")[0])) return;

        this.handleChange(absDir, relDir, lang);
      });

      this.watchers.set(absDir, watcher);
    } catch (err) {
      console.error(`[transit] Failed to watch ${absDir}: ${(err as Error).message}`);
    }
  }

  private handleChange(absDir: string, relDir: string, lang: string): void {
    const newFunctions = scanDirectory(absDir);
    const newNames = newFunctions.map((f) => f.name);
    const oldMap = this.previousFunctions.get(absDir) ?? new Map();
    const oldNames = [...oldMap.keys()];

    const added = newNames.filter((n) => !oldNames.includes(n));
    const removed = oldNames.filter((n) => !newNames.includes(n));

    // Detect signature changes
    const signatureChanges: { name: string; old: string; new: string }[] = [];
    for (const fn of newFunctions) {
      const oldSig = oldMap.get(fn.name);
      if (oldSig && oldSig !== fn.signature && !added.includes(fn.name)) {
        signatureChanges.push({ name: fn.name, old: oldSig, new: fn.signature });
      }
    }

    const changed = added.length > 0 || removed.length > 0 || signatureChanges.length > 0;

    // Update the map
    const newMap = new Map<string, string>();
    for (const fn of newFunctions) {
      newMap.set(fn.name, fn.signature);
    }
    this.previousFunctions.set(absDir, newMap);

    if (changed || this.verbose) {
      this.onChange(lang, {
        dir: relDir,
        functions: newNames,
        changed: changed ? [relDir] : [],
        added,
        removed,
        signatureChanges,
      });
    }
  }

  close(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
  }
}

// ─── Main dev function ──────────────────────────────────────────────────────

export async function dev(options: DevOptions = {}): Promise<void> {
  const projectDir = resolve(options.dir ?? process.cwd());
  const verbose = options.verbose ?? false;

  console.log(`[transit] Starting dev mode in ${projectDir}`);

  // 1. Load scanner
  const scannerAvailable = await loadScanner();
  if (!scannerAvailable) {
    console.error("[transit] Scanner not available. Run cargo build --release in packages/transit-scanner first.");
    process.exit(1);
  }
  console.log("[transit] Scanner loaded");

  // 2. Load config
  const config = loadConfig(projectDir);
  const hasConfig = existsSync(join(projectDir, "transit.config.json"));
  console.log(`[transit] Config: ${hasConfig ? "loaded" : "not found — using defaults"}`);

  // 3. Discover language directories
  const langDirs = discoverLanguageDirs(projectDir, config);
  if (langDirs.length === 0) {
    console.log("[transit] No language directories found. Run `transit init` first.");
    process.exit(0);
  }

  console.log(`[transit] Watching ${langDirs.length} language(s): ${langDirs.map((l) => l.lang).join(", ")}`);

  // 4. Start file watchers
  const watcher = new DirWatcher(verbose, (lang, result) => {
    if (result.added.length > 0) {
      console.log(`[transit] ${lang}: +${result.added.length} function(s): ${result.added.join(", ")}`);
    }
    if (result.removed.length > 0) {
      console.log(`[transit] ${lang}: -${result.removed.length} function(s): ${result.removed.join(", ")}`);
    }
    for (const sig of result.signatureChanges) {
      console.warn(`[transit] ${lang}: signature changed for "${sig.name}"`);
      console.warn(`  old: ${sig.old}`);
      console.warn(`  new: ${sig.new}`);
    }
    if (verbose && result.changed.length === 0) {
      console.log(`[transit] ${lang}: ${result.functions.length} functions (no changes)`);
    }
  });

  watcher.watch(langDirs);

  // 5. Handle shutdown
  const shutdown = () => {
    console.log("\n[transit] Shutting down...");
    watcher.close();
    console.log("[transit] Stopped.");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // 6. Keep alive
  console.log("[transit] Dev server running. Press Ctrl+C to stop.");
}
