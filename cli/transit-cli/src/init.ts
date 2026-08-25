/**
 * transit init — Bootstrap a new Transit project
 *
 * Scans source files for transit.rust(), transit.java(), transit.python() calls.
 * Detects which languages are in use, checks if runtime packages are installed,
 * and writes transit.config.json.
 *
 * Idempotent — safe to re-run when adding new languages.
 */

import { resolve, join, relative, dirname } from "node:path";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, copyFileSync, mkdirSync } from "node:fs";
import type { TransitConfig } from "@sabeeirsharrma/schema";

// ─── Language detection ──────────────────────────────────────────────────────

/** Pattern that matches transit.<lang>("path") calls */
const TRANSIT_CALL_RE = /transit\.(rust|java|python|c|cpp)\s*\(\s*["'`]([^"'`]+)["'`]/g;

/** Pattern that matches transit.<lang>(resolve(__dirname, "path")) calls */
const TRANSIT_RESOLVE_RE = /transit\.(rust|java|python|c|cpp)\s*\(\s*resolve\s*\([^,]+,\s*["'`]([^"'`]+)["'`]/g;

/** Source file extensions to scan */
const SCANNABLE_EXTENSIONS = new Set([
  ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx",
  ".mts",
]);

/** Directories to skip when scanning */
const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "target",
  ".next", "__pycache__", ".cache",
]);

interface DetectedLanguage {
  lang: "rust" | "java" | "python" | "c" | "cpp";
  /** Relative path to the source directory passed to transit.<lang>() */
  dir: string;
  /** Absolute path resolved from project root */
  absDir: string;
  /** Files where this call was found */
  foundIn: string[];
}

interface InitResult {
  /** Detected language directories */
  languages: DetectedLanguage[];
  /** Whether transit.config.json already existed */
  configExisted: boolean;
  /** The config that was written/updated */
  config: TransitConfig;
  /** Any warnings (e.g. missing packages) */
  warnings: string[];
}

// ─── Source file scanning ───────────────────────────────────────────────────

/**
 * Recursively find all scannable source files under a directory.
 */
function findSourceFiles(dir: string, root: string): string[] {
  const results: string[] = [];

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;

    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      results.push(...findSourceFiles(fullPath, root));
    } else if (stat.isFile()) {
      const ext = "." + entry.split(".").pop();
      if (SCANNABLE_EXTENSIONS.has(ext)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

/**
 * Scan a single file for transit.<lang>() calls.
 */
function scanFileForTransitCalls(filePath: string): DetectedLanguage[] {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  const results: DetectedLanguage[] = [];
  const found = new Set<string>();

  // Check both patterns
  for (const regex of [TRANSIT_CALL_RE, TRANSIT_RESOLVE_RE]) {
    let match: RegExpExecArray | null;
    regex.lastIndex = 0;
    while ((match = regex.exec(content)) !== null) {
      const lang = match[1] as "rust" | "java" | "python" | "c" | "cpp";
      const dir = match[2];
      if (!dir) continue;
      const key = `${lang}:${dir}`;
      if (!found.has(key)) {
        found.add(key);
        results.push({
          lang,
          dir,
          absDir: resolve(dirname(filePath), dir),
          foundIn: [relative(process.cwd(), filePath)],
        });
      }
    }
  }

  return results;
}

// ─── Package detection ──────────────────────────────────────────────────────

/**
 * Check if the runtime package for a language is installed.
 * Returns a human-readable status message.
 */
function checkPackageInstalled(lang: string, projectDir: string): string | null {
  switch (lang) {
    case "rust": {
      // Check if Cargo.toml exists and has transit-related deps
      const cargoPath = join(projectDir, "Cargo.toml");
      if (!existsSync(cargoPath)) return null; // can't determine
      const content = readFileSync(cargoPath, "utf-8");
      if (content.includes("transit") || content.includes("napi")) return null;
      return `Rust: no transit/napi dependency found in Cargo.toml`;
    }
    case "java": {
      // Java doesn't need a package — it's a compiled language with source files
      return null;
    }
    case "python": {
      // Check for requirements.txt or pyproject.toml
      const reqPath = join(projectDir, "requirements.txt");
      const pyprojectPath = join(projectDir, "pyproject.toml");
      if (existsSync(reqPath)) {
        const content = readFileSync(reqPath, "utf-8");
        if (content.includes("transit")) return null;
      }
      if (existsSync(pyprojectPath)) {
        const content = readFileSync(pyprojectPath, "utf-8");
        if (content.includes("transit")) return null;
      }
      return `Python: no transit dependency found in requirements.txt or pyproject.toml`;
    }
    case "c":
    case "cpp": {
      // Check for binding.gyp or CMakeLists.txt
      const bindingPath = join(projectDir, "binding.gyp");
      const cmakePath = join(projectDir, "CMakeLists.txt");
      if (existsSync(bindingPath) || existsSync(cmakePath)) return null;
      return `C/C++: no binding.gyp or CMakeLists.txt found for native addon build`;
    }
    default:
      return null;
  }
}

// ─── Runtime file copying ─────────────────────────────────────────────────────

/**
 * Walk up directory tree looking for a node_modules package.
 */
function* walkUpForPackage(startDir: string, packageName: string): Generator<string> {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    yield join(dir, "node_modules", packageName);
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
}

/**
 * Find a runtime package in node_modules.
 */
function findRuntimePackage(projectDir: string, packageName: string): string | null {
  // Check standard node_modules locations
  for (const candidate of walkUpForPackage(projectDir, packageName)) {
    if (existsSync(candidate)) return candidate;
  }
  
  // Check monorepo workspace packages (packages/<name>)
  const pkgName = packageName.split("/").pop() ?? packageName;
  const workspaceCandidates = [
    join(projectDir, "packages", pkgName),
    join(projectDir, "..", "packages", pkgName),
    join(projectDir, "..", "..", "packages", pkgName),
  ];
  
  for (const candidate of workspaceCandidates) {
    if (existsSync(candidate)) return candidate;
  }
  
  return null;
}

/**
 * Copy Java runtime files (TransitServer.java, TransitService.java, BinaryProtocol.java)
 * to the detected Java directory.
 */
function copyJavaRuntimeFiles(javaDir: string, projectDir: string): string[] {
  const warnings: string[] = [];
  const targetDir = join(javaDir, "lib", "transit", "java");
  const targetFiles = ["TransitServer.java", "TransitService.java", "BinaryProtocol.java"];

  // Check if all files already exist
  const allExist = targetFiles.every((f) => existsSync(join(targetDir, f)));
  if (allExist) {
    console.log(`[transit] Java runtime files already present in ${targetDir}`);
    return warnings;
  }

  // Find the npm package containing the Java runtime sources
  const runtimePackage = findRuntimePackage(projectDir, "@sabeeirsharrma/java-runtime-sources");
  if (!runtimePackage) {
    warnings.push("Java: @sabeeirsharrma/java-runtime-sources not found in node_modules");
    return warnings;
  }

  // Try both possible source directory structures
  const sourceDirCandidates = [
    join(runtimePackage, "src", "main", "java", "transit", "java"), // npm package structure
    join(runtimePackage, "src", "main", "java", "transit", "java"), // workspace package structure
  ];
  
  let sourceDir = "";
  for (const candidate of sourceDirCandidates) {
    if (existsSync(candidate)) {
      sourceDir = candidate;
      break;
    }
  }
  
  if (!sourceDir) {
    warnings.push(`Java: TransitServer.java not found in ${runtimePackage}`);
    return warnings;
  }

  // Copy each runtime file
  mkdirSync(targetDir, { recursive: true });
  for (const file of targetFiles) {
    const source = join(sourceDir, file);
    const target = join(targetDir, file);
    if (!existsSync(target) && existsSync(source)) {
      copyFileSync(source, target);
      console.log(`[transit] Copied ${file} to ${target}`);
    }
  }

  return warnings;
}

/**
 * Copy Python runtime file (transit_server.py) to the detected Python directory.
 */
function copyPythonRuntimeFiles(pythonDir: string, projectDir: string): string[] {
  const warnings: string[] = [];
  const targetFile = join(pythonDir, "transit_server.py");

  // Check if file already exists
  if (existsSync(targetFile)) {
    console.log(`[transit] Python runtime file already present in ${targetFile}`);
    return warnings;
  }

  // Find the npm package containing the Python runtime
  const runtimePackage = findRuntimePackage(projectDir, "@sabeeirsharrma/py-runtime");
  if (!runtimePackage) {
    warnings.push("Python: @sabeeirsharrma/py-runtime not found in node_modules");
    return warnings;
  }

  const sourceFile = join(runtimePackage, "transit_server.py");
  if (existsSync(sourceFile)) {
    mkdirSync(pythonDir, { recursive: true });
    copyFileSync(sourceFile, targetFile);
    console.log(`[transit] Copied transit_server.py to ${targetFile}`);
  } else {
    warnings.push(`Python: transit_server.py not found in ${runtimePackage}`);
  }

  return warnings;
}

function copyCTemplateFiles(cDir: string, projectDir: string): string[] {
  const warnings: string[] = [];
  const templateDir = join(projectDir, "node_modules", "@sabeeirsharrma", "transit", "templates", "c");

  // Check if template directory exists
  if (!existsSync(templateDir)) {
    warnings.push("C: template directory not found in node_modules");
    return warnings;
  }

  // Copy binding.gyp if it doesn't exist
  const bindingGypTarget = join(cDir, "binding.gyp");
  const bindingGypSource = join(templateDir, "binding.gyp");
  if (!existsSync(bindingGypTarget) && existsSync(bindingGypSource)) {
    mkdirSync(cDir, { recursive: true });
    copyFileSync(bindingGypSource, bindingGypTarget);
    console.log(`[transit] Copied binding.gyp to ${bindingGypTarget}`);
  }

  // Copy package.json if it doesn't exist
  const packageJsonTarget = join(cDir, "package.json");
  const packageJsonSource = join(templateDir, "package.json");
  if (!existsSync(packageJsonTarget) && existsSync(packageJsonSource)) {
    copyFileSync(packageJsonSource, packageJsonTarget);
    console.log(`[transit] Copied package.json to ${packageJsonTarget}`);
  }

  // Copy example source file if src directory is empty
  const srcDir = join(cDir, "src");
  if (existsSync(srcDir)) {
    try {
      const entries = readdirSync(srcDir);
      if (entries.length === 0) {
        const exampleSource = join(templateDir, "src", "addon.c");
        const exampleTarget = join(srcDir, "addon.c");
        if (existsSync(exampleSource)) {
          copyFileSync(exampleSource, exampleTarget);
          console.log(`[transit] Copied example addon.c to ${exampleTarget}`);
        }
      }
    } catch {
      // ignore
    }
  }

  return warnings;
}

function copyCppTemplateFiles(cppDir: string, projectDir: string): string[] {
  const warnings: string[] = [];
  const templateDir = join(projectDir, "node_modules", "@sabeeirsharrma", "transit", "templates", "cpp");

  // Check if template directory exists
  if (!existsSync(templateDir)) {
    warnings.push("C++: template directory not found in node_modules");
    return warnings;
  }

  // Copy binding.gyp if it doesn't exist
  const bindingGypTarget = join(cppDir, "binding.gyp");
  const bindingGypSource = join(templateDir, "binding.gyp");
  if (!existsSync(bindingGypTarget) && existsSync(bindingGypSource)) {
    mkdirSync(cppDir, { recursive: true });
    copyFileSync(bindingGypSource, bindingGypTarget);
    console.log(`[transit] Copied binding.gyp to ${bindingGypTarget}`);
  }

  // Copy package.json if it doesn't exist
  const packageJsonTarget = join(cppDir, "package.json");
  const packageJsonSource = join(templateDir, "package.json");
  if (!existsSync(packageJsonTarget) && existsSync(packageJsonSource)) {
    copyFileSync(packageJsonSource, packageJsonTarget);
    console.log(`[transit] Copied package.json to ${packageJsonTarget}`);
  }

  // Copy example source file if src directory is empty
  const srcDir = join(cppDir, "src");
  if (existsSync(srcDir)) {
    try {
      const entries = readdirSync(srcDir);
      if (entries.length === 0) {
        const exampleSource = join(templateDir, "src", "addon.cpp");
        const exampleTarget = join(srcDir, "addon.cpp");
        if (existsSync(exampleSource)) {
          copyFileSync(exampleSource, exampleTarget);
          console.log(`[transit] Copied example addon.cpp to ${exampleTarget}`);
        }
      }
    } catch {
      // ignore
    }
  }

  return warnings;
}

/**
 * Copy runtime files for a detected language to its directory.
 */
function copyRuntimeFiles(lang: DetectedLanguage, projectDir: string): string[] {
  switch (lang.lang) {
    case "java":
      return copyJavaRuntimeFiles(lang.absDir, projectDir);
    case "python":
      return copyPythonRuntimeFiles(lang.absDir, projectDir);
    case "c":
      return copyCTemplateFiles(lang.absDir, projectDir);
    case "cpp":
      return copyCppTemplateFiles(lang.absDir, projectDir);
    default:
      return [];
  }
}

// ─── Config generation ──────────────────────────────────────────────────────

/**
 * Generate transit.config.json content from detected languages.
 */
function generateConfig(languages: DetectedLanguage[]): TransitConfig {
  const config: TransitConfig = {};

  // Set up build overrides for detected languages
  const detectedLangs = new Set(languages.map((l) => l.lang));

  if (detectedLangs.has("rust")) {
    config.build = config.build ?? {};
    config.build.rust = config.build.rust ?? {};
  }

  if (detectedLangs.has("java")) {
    config.build = config.build ?? {};
    config.build.java = config.build.java ?? {};
  }

  if (detectedLangs.has("python")) {
    config.build = config.build ?? {};
    config.build.python = config.build.python ?? {};
  }

  if (detectedLangs.has("c")) {
    config.build = config.build ?? {};
    config.build.c = config.build.c ?? {};
  }

  if (detectedLangs.has("cpp")) {
    config.build = config.build ?? {};
    config.build.cpp = config.build.cpp ?? {};
  }

  // Generate exports from detected directories
  config.exports = [];
  for (const lang of languages) {
    const dir = lang.dir;
    // Find source files in the detected directory
    let files: string[];
    try {
      files = readdirSync(lang.absDir).filter((f) => {
        const ext = "." + f.split(".").pop();
        const extMap: Record<string, string[]> = {
          rust: [".rs"],
          java: [".java"],
          python: [".py"],
          c: [".c", ".h"],
          cpp: [".cpp", ".cc", ".cxx", ".hpp", ".hxx"],
        };
        return extMap[lang.lang]?.includes(ext);
      });
    } catch {
      continue;
    }

    // For each source file, we don't know exact function names yet
    // (that's what the scanner does in dev mode). Record the file for future use.
    for (const file of files) {
      config.exports.push({
        file: join(dir, file),
        function: "*",
      });
    }
  }

  // Remove wildcard exports (they're just markers, not actual config)
  // In practice, we only add exports for files we can fully parse
  config.exports = config.exports.filter((e) => e.function !== "*");

  return config;
}

// ─── Main init function ─────────────────────────────────────────────────────

export interface InitOptions {
  /** Project root directory (default: cwd) */
  dir?: string;
  /** Skip writing config (dry run) */
  dryRun?: boolean;
}

export async function init(options: InitOptions = {}): Promise<InitResult> {
  const projectDir = resolve(options.dir ?? process.cwd());
  const warnings: string[] = [];

  console.log(`[transit] Scanning ${projectDir} for transit usage...`);

  // 1. Find all source files
  const sourceFiles = findSourceFiles(projectDir, projectDir);
  console.log(`[transit] Found ${sourceFiles.length} source files`);

  // 2. Scan each file for transit.<lang>() calls
  const langMap = new Map<string, DetectedLanguage>();

  for (const file of sourceFiles) {
    const detections = scanFileForTransitCalls(file);
    for (const det of detections) {
      const key = `${det.lang}:${det.dir}`;
      const existing = langMap.get(key);
      if (existing) {
        existing.foundIn.push(...det.foundIn);
      } else {
        langMap.set(key, det);
      }
    }
  }

  const languages = [...langMap.values()];

  if (languages.length === 0) {
    console.log("[transit] No transit usage detected in source files.");
    console.log("[transit] Add transit.rust(), transit.java(), transit.python(), transit.c(), or transit.cpp() calls to your code.");
    return {
      languages: [],
      configExisted: existsSync(join(projectDir, "transit.config.json")),
      config: {},
      warnings,
    };
  }

  // 3. Print detected languages
  console.log(`[transit] Detected ${languages.length} language(s):`);
  for (const lang of languages) {
    const files = lang.foundIn.map((f) => `  found in ${f}`).join("\n");
    console.log(`  ${lang.lang} → ${lang.dir}`);
    for (const f of lang.foundIn) {
      console.log(`    found in ${f}`);
    }
  }

  // 4. Check package installation
  for (const lang of languages) {
    const warning = checkPackageInstalled(lang.lang, projectDir);
    if (warning) {
      warnings.push(warning);
      console.log(`[transit] ⚠ ${warning}`);
    }
  }

  // 5. Copy runtime files to detected directories
  if (!options.dryRun) {
    console.log("[transit] Copying runtime files...");
    for (const lang of languages) {
      const copyWarnings = copyRuntimeFiles(lang, projectDir);
      warnings.push(...copyWarnings);
    }
  }

  // 6. Check if config already exists
  const configPath = join(projectDir, "transit.config.json");
  const configExisted = existsSync(configPath);

  if (configExisted) {
    console.log("[transit] transit.config.json already exists — updating...");
  }

  // 7. Generate and write config
  const config = generateConfig(languages);

  if (options.dryRun) {
    console.log("[transit] Dry run — would write:");
    console.log(JSON.stringify(config, null, 2));
  } else {
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
    console.log(`[transit] Wrote transit.config.json`);
  }

  return { languages, configExisted, config, warnings };
}
