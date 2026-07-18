/**
 * transit build — Build pipeline for Transit projects
 *
 * Orchestrates: scan → codegen → compile → package.
 * Generates typed stubs and glue code from discovered functions.
 */

import { resolve, join } from "node:path";
import { writeFileSync, copyFileSync, existsSync, readFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import type { Manifest, ManifestEntry } from "@transit/schema";

// ─── Types ──────────────────────────────────────────────────────────────────

interface BuildOptions {
  /** Project root directory (default: cwd) */
  dir?: string;
  /** Verbose output */
  verbose?: boolean;
  /** Skip compilation step (codegen only) */
  codegenOnly?: boolean;
  /** Output directory for generated files (default: project root) */
  outDir?: string;
}

interface BuildResult {
  /** Generated TypeScript file path */
  tsOutput?: string;
  /** Generated Java file path */
  javaOutput?: string;
  /** Generated Python file path */
  pythonOutput?: string;
  /** Build manifest path */
  manifestOutput?: string;
  /** Compilation results per language */
  compiled: Record<string, { success: boolean; error?: string }>;
  /** Total functions discovered */
  functionCount: number;
  /** Languages processed */
  languages: string[];
  /** Whether all compilations succeeded */
  success: boolean;
}

// ─── Scanner wrapper ────────────────────────────────────────────────────────

let scannerModule: any = null;

async function loadScanner(): Promise<boolean> {
  try {
    const imported = await import("@transit/scanner");
    scannerModule = imported.default ?? imported;
    return true;
  } catch {
    return false;
  }
}

function scanDirectory(dir: string): ManifestEntry[] {
  if (!scannerModule) return [];
  try {
    const json = scannerModule.scanDirectory(resolve(dir));
    const raw = JSON.parse(json);
    return (raw.entries ?? []).map((e: any) => ({
      language: e.language,
      sourceFile: e.source_file ?? e.sourceFile,
      functionName: e.function_name ?? e.functionName,
      signature: e.signature ?? "",
      export_tier: e.export_tier ?? e.exportTier,
      exportTier: e.export_tier ?? e.exportTier,
    }));
  } catch (err) {
    console.error(`[transit] Scan error for ${dir}: ${(err as Error).message}`);
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
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    return {};
  }
}

// ─── Language directory discovery ────────────────────────────────────────────

interface LanguageDir {
  lang: string;
  dir: string;
  absDir: string;
}

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "target",
  ".next", "__pycache__", ".cache", ".transit-cache",
]);

function discoverLanguageDirs(dir: string, config: TransitConfig): LanguageDir[] {
  const dirs: LanguageDir[] = [];
  const seen = new Set<string>();

  // From config exports
  if (config.exports && config.exports.length > 0) {
    for (const exp of config.exports) {
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

  // From config build keys
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

  // Fallback: scan immediate subdirectories
  if (dirs.length === 0) {
    try {
      const entries = readdirSync(dir);
      const extMap: Record<string, string[]> = {
        rust: [".rs"],
        java: [".java"],
        python: [".py"],
      };

      for (const entry of entries) {
        if (SKIP_DIRS.has(entry)) continue;
        const subDir = join(dir, entry);
        try {
          const stat = statSync(subDir);
          if (!stat.isDirectory()) continue;
          for (const [lang, exts] of Object.entries(extMap)) {
            if (hasLanguageFiles(subDir, exts) && !seen.has(subDir)) {
              seen.add(subDir);
              dirs.push({ lang, dir: entry, absDir: subDir });
            }
          }
        } catch {
          continue;
        }
      }
    } catch {
      // ignore
    }
  }

  return dirs;
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
      candidates.push(["rust", "src"], ["rust", "lib"]);
      break;
    case "java":
      candidates.push(["java", "src/main/java"], ["java", "src"]);
      break;
    case "python":
      candidates.push(["python", "."]);
      break;
  }
  return candidates.map(([l, subDir]) => ({
    lang: l,
    dir: subDir,
    absDir: join(rootDir, subDir),
  }));
}

function hasLanguageFiles(dir: string, extensions: string[]): boolean {
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue;
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          // Recurse into subdirectories (but not too deep)
          if (hasLanguageFiles(fullPath, extensions)) return true;
        } else if (stat.isFile()) {
          const ext = "." + entry.split(".").pop()?.toLowerCase();
          if (extensions.includes(ext)) return true;
        }
      } catch {
        continue;
      }
    }
    return false;
  } catch {
    return false;
  }
}

// ─── Compilation ────────────────────────────────────────────────────────────

function compileRust(dir: string, verbose: boolean): { success: boolean; error?: string } {
  const cargoDir = findCargoDir(dir);
  if (!cargoDir) {
    return { success: false, error: "No Cargo.toml found" };
  }

  try {
    const cmd = "cargo build --release";
    if (verbose) console.log(`[transit] Running: ${cmd} in ${cargoDir}`);
    execSync(cmd, { cwd: cargoDir, stdio: verbose ? "inherit" : "pipe" });

    // Copy .so to .node for Node.js loading
    const targetDir = join(cargoDir, "target/release");
    const soFiles = readdirSync(targetDir).filter((f: string) => f.endsWith(".so") || f.endsWith(".dylib"));
    for (const soFile of soFiles) {
      const nodeFile = soFile.replace(/\.(so|dylib)$/, ".node");
      copyFileSync(join(targetDir, soFile), join(targetDir, nodeFile));
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

function findCargoDir(dir: string): string | null {
  let current = dir;
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(current, "Cargo.toml"))) {
      return current;
    }
    const parent = resolve(current, "..");
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function compileJava(dir: string, verbose: boolean): { success: boolean; error?: string } {
  const buildDir = join(dir, "..", "build");
  if (!existsSync(buildDir)) {
    try {
      mkdirSync(buildDir, { recursive: true });
    } catch {
      return { success: false, error: "Failed to create build directory" };
    }
  }

  try {
    // Find all .java files
    const javaFiles: string[] = [];
    const findJava = (d: string) => {
      for (const entry of readdirSync(d)) {
        const full = join(d, entry);
        try {
          const stat = statSync(full);
          if (stat.isDirectory()) {
            findJava(full);
          } else if (entry.endsWith(".java")) {
            javaFiles.push(full);
          }
        } catch {
          continue;
        }
      }
    };
    findJava(dir);

    if (javaFiles.length === 0) {
      return { success: false, error: "No .java files found" };
    }

    const cmd = `javac -d ${buildDir} ${javaFiles.join(" ")}`;
    if (verbose) console.log(`[transit] Running: ${cmd}`);
    execSync(cmd, { stdio: verbose ? "inherit" : "pipe" });

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ─── Main build function ────────────────────────────────────────────────────

export async function build(options: BuildOptions = {}): Promise<BuildResult> {
  const projectDir = resolve(options.dir ?? process.cwd());
  const verbose = options.verbose ?? false;
  const codegenOnly = options.codegenOnly ?? false;
  const outDir = resolve(options.outDir ?? projectDir);

  console.log(`[transit] Building project in ${projectDir}`);

  // 1. Load scanner
  const scannerAvailable = await loadScanner();
  if (!scannerAvailable) {
    console.error("[transit] Scanner not available. Run cargo build --release in packages/transit-scanner first.");
    process.exit(1);
  }

  // 2. Load config
  const config = loadConfig(projectDir);
  console.log(`[transit] Config: ${existsSync(join(projectDir, "transit.config.json")) ? "loaded" : "not found"}`);

  // 3. Discover language directories
  const langDirs = discoverLanguageDirs(projectDir, config);
  if (langDirs.length === 0) {
    console.log("[transit] No language directories found. Run `transit init` first.");
    return { compiled: {}, functionCount: 0, languages: [], success: true };
  }

  console.log(`[transit] Found ${langDirs.length} language(s): ${langDirs.map((l) => l.lang).join(", ")}`);

  // 4. Scan all directories
  const allEntries: ManifestEntry[] = [];
  for (const ld of langDirs) {
    const entries = scanDirectory(ld.absDir);
    if (verbose) {
      console.log(`[transit] ${ld.lang} (${ld.dir}): ${entries.length} functions`);
      for (const e of entries) {
        console.log(`  - ${e.functionName}`);
      }
    }
    allEntries.push(...entries);
  }

  const manifest: Manifest = {
    entries: allEntries,
    generatedAt: Date.now(),
  };

  console.log(`[transit] Total: ${allEntries.length} functions`);

  // 5. Generate code
  const result: BuildResult = {
    compiled: {},
    functionCount: allEntries.length,
    languages: [...new Set(allEntries.map((e) => e.language))],
    success: true,
  };

  // Import codegen dynamically
  const { generateTypeScript, generateJavaGlue, generatePythonGlue } = await import("@transit/codegen");

  // Generate TypeScript
  const tsCode = generateTypeScript(manifest, { outputPath: "transit.gen.ts" });
  const tsPath = join(outDir, "transit.gen.ts");
  writeFileSync(tsPath, tsCode, "utf-8");
  result.tsOutput = tsPath;
  console.log(`[transit] Generated transit.gen.ts (${allEntries.length} functions)`);

  // Generate Java glue
  const javaEntries = allEntries.filter((e) => e.language === "java");
  if (javaEntries.length > 0) {
    const javaCode = generateJavaGlue(manifest);
    const javaPath = join(outDir, "TransitService.gen.java");
    writeFileSync(javaPath, javaCode, "utf-8");
    result.javaOutput = javaPath;
    console.log(`[transit] Generated TransitService.gen.java (${javaEntries.length} functions)`);
  }

  // Generate Python glue
  const pyEntries = allEntries.filter((e) => e.language === "python");
  if (pyEntries.length > 0) {
    const pyCode = generatePythonGlue(manifest);
    const pyPath = join(outDir, "transit_service.gen.py");
    writeFileSync(pyPath, pyCode, "utf-8");
    result.pythonOutput = pyPath;
    console.log(`[transit] Generated transit_service.gen.py (${pyEntries.length} functions)`);
  }

  // 6. Compile (unless codegen-only)
  if (!codegenOnly) {
    console.log("[transit] Compiling...");

    // Compile each language in parallel
    const compilePromises: Promise<void>[] = [];

    for (const ld of langDirs) {
      const compileFn = async () => {
        switch (ld.lang) {
          case "rust":
            result.compiled.rust = compileRust(ld.absDir, verbose);
            break;
          case "java":
            result.compiled.java = compileJava(ld.absDir, verbose);
            break;
          // Python doesn't need compilation
        }
      };
      compilePromises.push(compileFn());
    }

    await Promise.all(compilePromises);

    // Report compilation results
    for (const [lang, compileResult] of Object.entries(result.compiled)) {
      if (compileResult.success) {
        console.log(`[transit] ${lang}: compiled successfully`);
      } else {
        console.error(`[transit] ${lang}: compilation failed — ${compileResult.error}`);
      }
    }
  }

  // 7. Write build manifest to dist/
  const distDir = join(projectDir, "dist");
  if (!existsSync(distDir)) {
    try {
      mkdirSync(distDir, { recursive: true });
    } catch {
      // ignore
    }
  }

  const buildManifest = {
    generatedAt: manifest.generatedAt,
    entryPoint: "transit.gen.ts",
    functions: manifest.entries.map((e) => ({
      language: e.language,
      functionName: e.functionName,
      signature: e.signature,
      exportTier: e.exportTier,
    })),
    compilation: Object.fromEntries(
      Object.entries(result.compiled).map(([lang, r]) => [lang, { success: r.success, error: r.error }])
    ),
  };

  const manifestPath = join(distDir, "transit-manifest.json");
  writeFileSync(manifestPath, JSON.stringify(buildManifest, null, 2), "utf-8");
  result.manifestOutput = manifestPath;
  console.log(`[transit] Wrote build manifest to dist/transit-manifest.json`);

  // 8. Check for compilation failures
  const compiledLangs = Object.keys(result.compiled);
  const failedLangs = Object.entries(result.compiled)
    .filter(([, r]) => !r.success)
    .map(([lang]) => lang);
  const succeededLangs = compiledLangs.filter((l) => !failedLangs.includes(l));

  result.success = failedLangs.length === 0 || codegenOnly;

  if (failedLangs.length > 0 && !codegenOnly) {
    if (succeededLangs.length > 0) {
      // Partial success — warn but don't fail
      console.warn(`[transit] Warning: ${failedLangs.join(", ")} compilation failed, but ${succeededLangs.join(", ")} succeeded.`);
      console.warn("[transit] Build completed with warnings. Generated files are still available.");
    } else {
      // Total failure
      console.error("[transit] Build failed: all compilations failed.");
      process.exit(1);
    }
  }

  console.log("[transit] Build complete.");
  return result;
}
