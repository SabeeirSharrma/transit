/**
 * transit start — Production mode for Transit projects
 *
 * Loads the build manifest (dist/transit-manifest.json), starts resident
 * processes (Java, Python), runs the application entry point, and forwards
 * signals for graceful shutdown.
 */

import { resolve, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { spawn, ChildProcess } from "node:child_process";

// ─── Types ──────────────────────────────────────────────────────────────────

interface BuildManifest {
  generatedAt: number;
  entryPoint: string;
  functions: {
    language: string;
    functionName: string;
    signature: string;
    exportTier: string;
  }[];
  compilation: Record<string, { success: boolean; error?: string }>;
}

interface StartOptions {
  /** Project root directory (default: cwd) */
  dir?: string;
  /** Application entry point script (e.g., "src/index.js") */
  entry?: string;
  /** Verbose output */
  verbose?: boolean;
}

// ─── Manifest loading ────────────────────────────────────────────────────────

function loadBuildManifest(projectDir: string): BuildManifest | null {
  const manifestPath = join(projectDir, "dist", "transit-manifest.json");
  if (!existsSync(manifestPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(manifestPath, "utf-8"));
  } catch {
    return null;
  }
}

// ─── Language directory discovery ────────────────────────────────────────────

interface LanguageDir {
  lang: string;
  absDir: string;
}

function discoverLanguageDirs(projectDir: string): LanguageDir[] {
  const dirs: LanguageDir[] = [];
  const candidates: [string, string[]][] = [
    ["rust", ["rust/src", "src"]],
    ["java", ["java/src/main/java", "src/main/java"]],
    ["python", ["python", "."]],
  ];

  for (const [lang, subDirs] of candidates) {
    for (const subDir of subDirs) {
      const absDir = join(projectDir, subDir);
      if (existsSync(absDir)) {
        dirs.push({ lang, absDir });
        break;
      }
    }
  }

  return dirs;
}

// ─── Process management ─────────────────────────────────────────────────────

interface ManagedProcess {
  name: string;
  process: ChildProcess;
}

async function startJavaProcess(
  javaDir: string,
  verbose: boolean
): Promise<ManagedProcess | null> {
  const buildDir = join(javaDir, "build");
  if (!existsSync(buildDir)) {
    console.error(`[transit] Java build directory not found: ${buildDir}`);
    console.error("[transit] Run `transit build` first.");
    return null;
  }

  // Find TransitService.class
  const classPath = join(buildDir, "transit", "java", "TransitService.class");
  if (!existsSync(classPath)) {
    console.error(`[transit] TransitService.class not found in ${buildDir}`);
    return null;
  }

  const args = [
    "-Xmx512m",
    "-cp", buildDir,
    "transit.java.TransitService",
  ];

  if (verbose) console.log(`[transit] Starting Java: java ${args.join(" ")}`);

  const proc = spawn("java", args, {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
  });

  // Wait for PORT=<port> on stdout
  const port = await new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Java process did not print PORT= within timeout"));
    }, 15000);

    let buffer = "";
    proc.stdout!.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const match = buffer.match(/PORT=(\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(parseInt(match[1], 10));
      }
    });

    proc.stderr!.on("data", (chunk: Buffer) => {
      if (verbose) process.stderr.write(`[transit-java] ${chunk}`);
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    proc.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Java process exited with code ${code}`));
    });
  });

  console.log(`[transit] Java process started on port ${port}`);

  // Store port as env var so transit-js can connect
  process.env.TRANSIT_JAVA_PORT = String(port);

  return { name: "java", process: proc };
}

async function startPythonProcess(
  pythonDir: string,
  verbose: boolean
): Promise<ManagedProcess | null> {
  // Find the service file (transit_service.py, service.py, main.py, app.py)
  const candidates = ["transit_service.py", "service.py", "main.py", "app.py"];
  let serviceFile: string | null = null;

  for (const candidate of candidates) {
    const path = join(pythonDir, candidate);
    if (existsSync(path)) {
      serviceFile = path;
      break;
    }
  }

  if (!serviceFile) {
    console.error(`[transit] No Python service file found in ${pythonDir}`);
    return null;
  }

  if (verbose) console.log(`[transit] Starting Python: python3 ${serviceFile}`);

  const proc = spawn("python3", [serviceFile], {
    cwd: pythonDir,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
  });

  // Wait for PORT=<port> on stdout
  const port = await new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Python process did not print PORT= within timeout"));
    }, 15000);

    let buffer = "";
    proc.stdout!.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const match = buffer.match(/PORT=(\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(parseInt(match[1], 10));
      }
    });

    proc.stderr!.on("data", (chunk: Buffer) => {
      if (verbose) process.stderr.write(`[transit-python] ${chunk}`);
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    proc.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Python process exited with code ${code}`));
    });
  });

  console.log(`[transit] Python process started on port ${port}`);

  // Store port as env var so transit-js can connect
  process.env.TRANSIT_PYTHON_PORT = String(port);

  return { name: "python", process: proc };
}

// ─── Main start function ────────────────────────────────────────────────────

export async function start(options: StartOptions = {}): Promise<void> {
  const projectDir = resolve(options.dir ?? process.cwd());
  const entryScript = options.entry ?? "src/index.js";
  const verbose = options.verbose ?? false;

  console.log(`[transit] Starting production mode in ${projectDir}`);

  // 1. Load build manifest
  const manifest = loadBuildManifest(projectDir);
  if (!manifest) {
    console.error("[transit] Build manifest not found at dist/transit-manifest.json");
    console.error("[transit] Run `transit build` first.");
    process.exit(1);
  }

  console.log(`[transit] Loaded manifest: ${manifest.functions.length} functions, generated at ${new Date(manifest.generatedAt).toISOString()}`);

  // 2. Check compilation status
  for (const [lang, result] of Object.entries(manifest.compilation)) {
    if (!result.success) {
      console.error(`[transit] ${lang} compilation failed: ${result.error}`);
      process.exit(1);
    }
  }

  // 3. Discover language directories
  const langDirs = discoverLanguageDirs(projectDir);

  // 4. Start resident processes based on manifest
  const managed: ManagedProcess[] = [];
  const hasJava = manifest.functions.some((f) => f.language === "java");
  const hasPython = manifest.functions.some((f) => f.language === "python");

  if (hasJava) {
    const javaDir = langDirs.find((d) => d.lang === "java");
    if (javaDir) {
      try {
        const proc = await startJavaProcess(javaDir.absDir, verbose);
        if (proc) managed.push(proc);
      } catch (err) {
        console.error(`[transit] Failed to start Java: ${(err as Error).message}`);
        process.exit(1);
      }
    }
  }

  if (hasPython) {
    const pythonDir = langDirs.find((d) => d.lang === "python");
    if (pythonDir) {
      try {
        const proc = await startPythonProcess(pythonDir.absDir, verbose);
        if (proc) managed.push(proc);
      } catch (err) {
        console.error(`[transit] Failed to start Python: ${(err as Error).message}`);
        process.exit(1);
      }
    }
  }

  // 5. Run the application entry point
  const entryPath = resolve(projectDir, entryScript);
  if (!existsSync(entryPath)) {
    console.error(`[transit] Entry point not found: ${entryPath}`);
    process.exit(1);
  }

  // Set env vars for the generated transit module
  process.env.TRANSIT_MANIFEST = join(projectDir, "dist", "transit-manifest.json");
  process.env.TRANSIT_ENTRY = entryPath;

  console.log(`[transit] Running entry point: ${entryScript}`);

  const appProc = spawn("node", ["--import", "./transit.gen.js", entryPath], {
    cwd: projectDir,
    stdio: "inherit",
    env: { ...process.env },
  });

  // 6. Forward signals to all managed processes
  const shutdown = async (signal: NodeJS.Signals) => {
    console.log(`\n[transit] Received ${signal}, shutting down...`);

    // Kill the app process
    if (appProc && !appProc.killed) {
      appProc.kill(signal);
    }

    // Stop all managed processes
    for (const proc of managed) {
      try {
        proc.process.kill(signal as NodeJS.Signals);
      } catch {
        // process may already be dead
      }
    }

    // Wait for app to exit
    await new Promise<void>((resolve) => {
      if (!appProc || appProc.killed) {
        resolve();
        return;
      }
      appProc.on("exit", () => resolve());
      // Force exit after 5 seconds
      setTimeout(() => resolve(), 5000);
    });

    console.log("[transit] All processes stopped.");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Handle app exit
  appProc.on("exit", (code) => {
    console.log(`[transit] Application exited with code ${code}`);
    // Stop managed processes
    for (const proc of managed) {
      try {
        proc.process.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
    process.exit(code ?? 0);
  });

  appProc.on("error", (err) => {
    console.error(`[transit] Entry point error: ${err.message}`);
    shutdown("SIGTERM");
  });
}
