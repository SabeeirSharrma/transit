/**
 * @sabeeirsharrma/java-runtime — Node.js bridge for Transit Java resident-process
 *
 * Manages the Java process lifecycle (start/stop/health-check) and
 * implements the binary protocol client for JS↔Java communication.
 *
 * Binary protocol (v0.1, little-endian):
 *   Header:  [version:1][type:1][request_id:4][payload_len:4]
 *   CALL_REQUEST payload:  [fn_name_len:2][fn_name:N][args_len:4][args_json:N]
 *   CALL_RESPONSE payload: [status:1][result_len:4][result_json:N]
 *   HEALTH_PING payload:   empty
 *   HEALTH_PONG payload:   empty
 */

import { spawn, ChildProcess } from "node:child_process";
import { createConnection, Socket } from "node:net";
import { resolve, join } from "node:path";
import { existsSync, readFileSync, mkdirSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { cpus } from "node:os";

// ─── Protocol constants ───────────────────────────────────────────────────────

const PROTOCOL_VERSION = 1;
const TYPE_CALL_REQUEST = 0x01;
const TYPE_CALL_RESPONSE = 0x02;
const TYPE_HEALTH_PING = 0x03;
const TYPE_HEALTH_PONG = 0x04;

const STATUS_OK = 0;
const STATUS_ERROR = 1;

const HEADER_SIZE = 10; // version(1) + type(1) + request_id(4) + payload_len(4)

// ─── Pending call tracking ────────────────────────────────────────────────────

interface PendingCall {
  resolve: (value: Buffer) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ─── JavaProcessManager ───────────────────────────────────────────────────────

export interface JavaProcessOptions {
  /** Directory containing Java source files */
  javaDir: string;
  /** Classpath for the compiled Java classes */
  classpath?: string;
  /** Main class to run (default: auto-detect) */
  mainClass?: string;
  /** JVM arguments */
  jvmArgs?: string[];
  /** Connection timeout in ms (default: 10000) */
  connectTimeout?: number;
  /** Maximum restart attempts */
  maxRestarts?: number;
}

export class JavaProcessManager {
  private options: Required<JavaProcessOptions>;
  private process: ChildProcess | null = null;
  private sockets: Socket[] = [];
  private port: number = -1;
  private pending = new Map<number, PendingCall>();
  private requestIdCounter = 0;
  private restartCount = 0;
  private ready = false;
  private readyPromise: Promise<void> | null = null;
  private stopping = false;
  private nameCache = new Map<string, string>();
  private fnNameCache = new Map<string, Buffer>();

  constructor(options: JavaProcessOptions) {
    this.options = {
      javaDir: options.javaDir,
      classpath: options.classpath ?? resolve(options.javaDir, "build"),
      mainClass: options.mainClass ?? "transit.java.TransitService",
      jvmArgs: options.jvmArgs ?? ["-Xmx512m"],
      connectTimeout: options.connectTimeout ?? 10000,
      maxRestarts: options.maxRestarts ?? 3,
    };
  }

  /**
   * Start the Java process and connect to it.
   */
  async start(): Promise<void> {
    if (this.ready) return;
    if (this.readyPromise) return this.readyPromise;

    this.readyPromise = this.doStart().catch((err) => {
      this.readyPromise = null;
      throw err;
    });
    return this.readyPromise;
  }

  private async doStart(): Promise<void> {
    this.stopping = false;
    const { classpath, mainClass, jvmArgs } = this.options;

    // Ensure Java runtime sources are available in the user's project
    await this.ensureRuntimeSources();

    // Find the main class file
    const classFile = mainClass.replace(/\./g, "/") + ".class";
    if (!existsSync(join(classpath, classFile))) {
      // List available classes to help the user
      const available = this.findAvailableClasses(classpath);
      const hint = available.length > 0
        ? `\nAvailable classes: ${available.slice(0, 10).join(", ")}${available.length > 10 ? ` (and ${available.length - 10} more)` : ""}`
        : "";
      throw new Error(
        `Java class not found: ${mainClass} (looked in ${classpath})\n` +
        `Compile with: javac -d ${classpath} src/main/java/**/*.java` +
        hint
      );
    }

    // Spawn the Java process
    const args = [...jvmArgs, "-cp", classpath, mainClass];
    this.process = spawn("java", args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    this.process.on("error", (err) => {
      console.error(`[transit-java] Process error: ${err.message}`);
      this.ready = false;
      if (!this.stopping) {
        this.maybeRestart();
      }
    });

    this.process.on("exit", (code, signal) => {
      console.error(`[transit-java] Process exited (code=${code}, signal=${signal})`);
      this.ready = false;
      if (!this.stopping) {
        this.maybeRestart();
      }
    });

    // Read stdout for PORT=<port> line
    this.port = await this.waitForPort(this.process);

    // Connect to the Java server (pool of sockets for concurrency)
    const poolSize = Math.min(cpus().length, 8);
    await this.connectPool(poolSize);

    this.ready = true;
    this.restartCount = 0;
    console.error(`[transit-java] Connected to Java process on port ${this.port}`);
  }

  /**
   * Wait for the Java process to print PORT=<port> on stdout.
   */
  private waitForPort(proc: ChildProcess): Promise<number> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Java process did not print PORT= within timeout"));
      }, this.options.connectTimeout);

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
        // Forward Java stderr for debugging
        process.stderr.write(`[transit-java] ${chunk}`);
      });

      proc.on("error", (err) => {
        clearTimeout(timeout);
        reject(new Error(`Java process error: ${err.message}`));
      });
      proc.on("exit", (code, signal) => {
        clearTimeout(timeout);
        reject(
          new Error(
            `Java process exited (code=${code}, signal=${signal}) before printing PORT=`
          )
        );
      });
    });
  }

  /**
   * Connect a pool of sockets to the Java server via TCP.
   */
  private async connectPool(size: number): Promise<void> {
    this.sockets = [];
    for (let i = 0; i < size; i++) {
      try {
        const socket = await this.createConnection();
        this.sockets.push(socket);
      } catch (err) {
        for (const s of this.sockets) s.destroy();
        this.sockets = [];
        this.process?.kill();
        this.process = null;
        throw err;
      }
    }
  }

  /**
   * Create a single connection to the Java server.
   */
  private createConnection(): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = createConnection({ port: this.port, host: "127.0.0.1" }, () => {
        socket.setNoDelay(true);
        // Enable TCP keepalive to detect dead connections at OS level
        socket.setKeepAlive(true, 5000);
        // Set up response handler for this socket
        this.setupResponseHandler(socket);
        resolve(socket);
      });

      socket.on("error", reject);
      socket.setTimeout(this.options.connectTimeout, () => {
        socket.destroy();
        reject(new Error("Connection timeout"));
      });
    });
  }

  /**
   * Restart the Java process if it crashed.
   */
  private maybeRestart(): void {
    // Reject pending calls FIRST so callers don't hang forever
    for (const [id, pending] of this.pending) {
      pending.reject(new Error("Java process died"));
    }
    this.pending.clear();

    if (this.restartCount >= this.options.maxRestarts) {
      console.error("[transit-java] Max restarts reached, giving up");
      return;
    }
    this.restartCount++;
    console.error(`[transit-java] Restarting (attempt ${this.restartCount})...`);
    this.ready = false;
    this.readyPromise = null;
    // Clean up old state
    for (const s of this.sockets) s.destroy();
    this.sockets = [];
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Java process crashed"));
    }
    this.pending.clear();
    this.process?.kill();
    this.process = null;
    // Restart after a delay
    setTimeout(() => {
      this.start().catch((err) => {
        console.error(`[transit-java] Restart failed: ${err.message}`);
      });
    }, 1000 * this.restartCount);
  }

  /**
   * Call multiple Java functions concurrently (request pipelining).
   * Fires N calls without awaiting, then collects all responses.
   */
  async callBatch(calls: Array<{ name: string; args: string }>): Promise<string[]> {
    return Promise.all(calls.map(c => this.callFunction(c.name, c.args)));
  }

  /**
   * Call a Java function.
   * Converts snake_case names to camelCase (Java server registers camelCase names).
   *
   * Returns raw string result — caller parses JSON only if needed.
   * This avoids per-call JSON.parse + try/catch overhead in the hot path.
   */
  async callFunction(functionName: string, argsJson: string): Promise<string> {
    if (!this.ready || this.sockets.length === 0) {
      throw new Error("Java process not ready");
    }

    // Convert snake_case → camelCase (cached to avoid per-call regex)
    let javaName = this.nameCache.get(functionName);
    if (javaName === undefined) {
      javaName = functionName.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
      this.nameCache.set(functionName, javaName);
    }

    // Pre-encode fn name once and cache (hot path optimization)
    let fnBytes = this.fnNameCache.get(javaName);
    if (fnBytes === undefined) {
      fnBytes = Buffer.from(javaName, "utf-8");
      this.fnNameCache.set(javaName, fnBytes);
    }
    const argsBytes = Buffer.from(argsJson, "utf-8");

    const payloadSize = 2 + fnBytes.length + 4 + argsBytes.length;
    const requestId = ++this.requestIdCounter;

    const message = Buffer.allocUnsafe(HEADER_SIZE + payloadSize);
    let offset = 0;

    // Header
    message.writeUInt8(PROTOCOL_VERSION, offset); offset += 1;
    message.writeUInt8(TYPE_CALL_REQUEST, offset); offset += 1;
    message.writeUInt32LE(requestId, offset); offset += 4;
    message.writeUInt32LE(payloadSize, offset); offset += 4;

    // Payload
    message.writeUInt16LE(fnBytes.length, offset); offset += 2;
    fnBytes.copy(message, offset); offset += fnBytes.length;
    message.writeUInt32LE(argsBytes.length, offset); offset += 4;
    argsBytes.copy(message, offset); offset += argsBytes.length;

    const response = await this.sendRaw(message);

    // Decode CALL_RESPONSE — zero-copy: read directly from response buffer
    const status = response[10]; // readUInt8 inline (avoids method call overhead)
    const resultLen = (response[11] | (response[12] << 8) |
                       (response[13] << 16) | (response[14] << 24)); // readInt32LE inline
    const result = response.subarray(15, 15 + resultLen).toString("utf-8");

    if (status === STATUS_ERROR) {
      try {
        const parsed = JSON.parse(result);
        const msg =
          parsed && typeof parsed === "object" && !Array.isArray(parsed) && typeof parsed.error === "string"
            ? parsed.error
            : undefined;
        throw new Error(msg || "Java function returned error");
      } catch (e) {
        if (e instanceof SyntaxError) {
          throw new Error(`Java function returned invalid error response: ${result.slice(0, 200)}`);
        }
        throw e;
      }
    }

    return result;
  }

  /**
   * Send a raw message and wait for a response.
   * Uses round-robin across the socket pool.
   */
  private sendRaw(message: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      if (this.sockets.length === 0) {
        reject(new Error("Not connected"));
        return;
      }

      const requestId = message.readUInt32LE(2);

      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Call timed out (requestId=${requestId})`));
      }, 30000);

      this.pending.set(requestId, { resolve, reject, timer });

      // Round-robin across socket pool
      const socket = this.sockets[this.requestIdCounter % this.sockets.length];
      socket.write(message);
    });
  }

  /**
   * Set up the response handler on a socket.
   * Uses a growing buffer with offset tracking instead of Buffer.concat()
   * to avoid per-chunk allocations.
   */
  private setupResponseHandler(socket: Socket): void {
    const INITIAL_CAPACITY = 65536; // 64KB
    let buffer = Buffer.allocUnsafe(INITIAL_CAPACITY);
    let offset = 0; // bytes of valid data in buffer

    socket.on("data", (chunk: Buffer) => {
      // Ensure capacity
      const needed = offset + chunk.length;
      if (needed > buffer.length) {
        let newSize = buffer.length;
        while (newSize < needed) newSize *= 2;
        const newBuf = Buffer.allocUnsafe(newSize);
        buffer.copy(newBuf, 0, 0, offset);
        buffer = newBuf;
      }
      chunk.copy(buffer, offset);
      offset += chunk.length;

      // Process complete messages — avoid Buffer.from copy, use subarray directly
      let consumed = 0;
      while (offset - consumed >= HEADER_SIZE) {
        const payloadLen = buffer.readUInt32LE(consumed + 6);
        const totalLen = HEADER_SIZE + payloadLen;

        if (offset - consumed < totalLen) break; // incomplete message

        const requestId = buffer.readUInt32LE(consumed + 2);
        const pending = this.pending.get(requestId);
        if (pending) {
          this.pending.delete(requestId);
          clearTimeout(pending.timer);
          // Pass subarray view directly — caller toString()s it immediately,
          // so the compact below won't corrupt it before it's consumed.
          pending.resolve(buffer.subarray(consumed, consumed + totalLen));
        }
        consumed += totalLen;
      }

      // Compact: shift unconsumed data to front
      if (consumed > 0) {
        if (consumed < offset) {
          buffer.copy(buffer, 0, consumed, offset);
        }
        offset -= consumed;
      }
    });
  }

  /**
   * Stop the Java process and clean up.
   */
  async stop(): Promise<void> {
    this.stopping = true;
    this.ready = false;

    // Reject all pending calls
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Java process shutting down"));
    }
    this.pending.clear();

    // Close all sockets
    for (const s of this.sockets) s.destroy();
    this.sockets = [];

    // Kill process
    if (this.process) {
      const proc = this.process;
      proc.kill("SIGTERM");
      // Force kill after 5 seconds
      setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch {}
      }, 5000);
      this.process = null;
    }

    this.readyPromise = null;
  }

  /**
   * Whether the Java process is ready to accept calls.
   */
  isReady(): boolean {
    return this.ready;
  }

  /**
   * Find available .class files in the classpath directory.
   * Used to provide helpful error messages when a class is not found.
   */
  private findAvailableClasses(classpath: string): string[] {
    const classes: string[] = [];
    const walk = (dir: string, prefix: string) => {
      try {
        const entries = readdirSync(dir);
        for (const entry of entries) {
          const fullPath = join(dir, entry);
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            walk(fullPath, prefix ? `${prefix}.${entry}` : entry);
          } else if (entry.endsWith(".class")) {
            const className = prefix
              ? `${prefix}.${entry.replace(".class", "")}`
              : entry.replace(".class", "");
            classes.push(className);
          }
        }
      } catch {}
    };
    walk(classpath, "");
    return classes.sort();
  }

  /**
   * Ensure Java runtime sources are available in the user's project.
   * Copies TransitServer.java, TransitService.java, BinaryProtocol.java from
   * the npm package if they don't already exist in the user's lib directory.
   */
  private async ensureRuntimeSources(): Promise<void> {
    const targetDir = join(this.options.javaDir, "lib", "transit", "java");
    const targetFiles = ["TransitServer.java", "TransitService.java", "BinaryProtocol.java"];

    // Check if runtime sources already exist
    const allExist = targetFiles.every(f => existsSync(join(targetDir, f)));
    if (allExist) return;

    // Find the npm package containing the Java runtime sources
    const runtimePackage = this.findRuntimePackage();
    if (!runtimePackage) {
      // Runtime sources not found — user must provide them manually
      // The error will surface when the class isn't found
      return;
    }

    const sourceDir = join(runtimePackage, "src", "main", "java", "transit", "java");

    // Copy each runtime file
    mkdirSync(targetDir, { recursive: true });
    for (const file of targetFiles) {
      const source = join(sourceDir, file);
      const target = join(targetDir, file);
      if (!existsSync(target) && existsSync(source)) {
        copyFileSync(source, target);
        console.error(`[transit-java] Copied ${file} to ${target}`);
      }
    }
  }

  /**
   * Find the transit-java-runtime-sources npm package.
   * Searches node_modules in the user's project directory and parent directories.
   */
  private findRuntimePackage(): string | null {
    const candidates = [
      // Monorepo: workspace package
      join(this.options.javaDir, "..", "..", "node_modules", "@sabeeirsharrma", "java-runtime-sources"),
      // Standard: installed as dependency
      join(this.options.javaDir, "node_modules", "@sabeeirsharrma", "java-runtime-sources"),
      // Walk up from javaDir
      ...this.walkUpForPackage(this.options.javaDir, "@sabeeirsharrma/java-runtime-sources"),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }
    return null;
  }

  /**
   * Walk up directory tree looking for a node_modules package.
   */
  private *walkUpForPackage(startDir: string, packageName: string): Generator<string> {
    let dir = startDir;
    for (let i = 0; i < 10; i++) {
      yield join(dir, "node_modules", packageName);
      const parent = resolve(dir, "..");
      if (parent === dir) break;
      dir = parent;
    }
  }
}

// ─── Re-export ────────────────────────────────────────────────────────────────

export { JavaProcessManager as default };
