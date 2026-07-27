/**
 * @sabeeirsharrma/python-runtime — Node.js bridge for Transit Python resident-process
 *
 * Manages the Python process lifecycle (start/stop/health-check) and
 * implements the binary protocol client for JS↔Python communication.
 *
 * Binary protocol (v0.1, little-endian) — identical to the Java bridge:
 *   Header:  [version:1][type:1][request_id:4][payload_len:4]
 *   CALL_REQUEST payload:  [fn_name_len:2][fn_name:N][args_len:4][args_json:N]
 *   CALL_RESPONSE payload: [status:1][result_len:4][result_json:N]
 *   HEALTH_PING payload:   empty
 *   HEALTH_PONG payload:   empty
 */

import { spawn, ChildProcess } from "node:child_process";
import { createConnection, Socket } from "node:net";
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
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

// ─── PythonProcessManager ─────────────────────────────────────────────────────

export interface PythonProcessOptions {
  /** Directory containing Python source files */
  pythonDir: string;
  /** Path to the transit_server.py (auto-detected if not set) */
  serverScript?: string;
  /** Python interpreter command (default: python3) */
  interpreter?: string;
  /** Connection timeout in ms (default: 10000) */
  connectTimeout?: number;
  /** Maximum restart attempts */
  maxRestarts?: number;
  /** Extra environment variables to pass to the Python process */
  env?: Record<string, string>;
}

export class PythonProcessManager {
  private options: Required<Omit<PythonProcessOptions, "env">>;
  private process: ChildProcess | null = null;
  private sockets: Socket[] = [];
  private port: number = -1;
  private socketPath: string | null = null;
  private pending = new Map<number, PendingCall>();
  private requestIdCounter = 0;
  private restartCount = 0;
  private ready = false;
  private readyPromise: Promise<void> | null = null;
  private stopping = false;
  private nameCache = new Map<string, string>();

  private extraEnv: Record<string, string>;

  constructor(options: PythonProcessOptions) {
    this.options = {
      pythonDir: options.pythonDir,
      serverScript: options.serverScript ?? "",
      interpreter: options.interpreter ?? "python3",
      connectTimeout: options.connectTimeout ?? 10000,
      maxRestarts: options.maxRestarts ?? 3,
    };
    this.extraEnv = options.env ?? {};
  }

  /**
   * Start the Python process and connect to it.
   */
  async start(): Promise<void> {
    if (this.ready) return;
    if (this.readyPromise) return this.readyPromise;

    this.readyPromise = this.doStart();
    return this.readyPromise;
  }

  private async doStart(): Promise<void> {
    this.stopping = false;
    const { interpreter, pythonDir } = this.options;

    // Find the server script
    const scriptPath = this.findServerScript();
    if (!scriptPath) {
      throw new Error(
        `Python entry point not found in ${pythonDir}\n` +
        `Looked for: transit_service.py, service.py, main.py, app.py, server.py, filters.py\n` +
        `To use a custom entry point, set serverScript option:\n` +
        `  transit.python("./py", { serverScript: "my_entry.py" })\n` +
        `Or ensure one of the above files exists in ${pythonDir}`
      );
    }

    // Spawn the Python process
    this.process = spawn(interpreter, [scriptPath], {
      cwd: pythonDir,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...this.extraEnv },
    });

    this.process.on("error", (err) => {
      console.error(`[transit-python] Process error: ${err.message}`);
      this.ready = false;
      this.maybeRestart();
    });

    this.process.on("exit", (code, signal) => {
      console.error(`[transit-python] Process exited (code=${code}, signal=${signal})`);
      this.ready = false;
      if (!this.stopping) {
        this.maybeRestart();
      }
    });

    // Read stdout for PORT=<port> or SOCKET=<path> line
    const transport = await this.waitForTransport(this.process);
    if (transport.type === "socket") {
      this.socketPath = transport.path;
    } else {
      this.port = transport.port;
    }

    // Connect to the Python server (pool of sockets for concurrency)
    const poolSize = Math.min(cpus().length, 8);
    await this.connectPool(poolSize);

    this.ready = true;
    this.restartCount = 0;
    const addr = this.socketPath
      ? `UDS ${this.socketPath}`
      : `TCP port ${this.port}`;
    console.error(`[transit-python] Connected to Python process on ${addr}`);
  }

  /**
   * Find the transit_server.py script.
   */
  private findServerScript(): string | null {
    // If explicitly set, use that
    if (this.options.serverScript) {
      const script = resolve(this.options.pythonDir, this.options.serverScript);
      return existsSync(script) ? script : null;
    }

    // Auto-detect: look for service files that have function registrations
    // Skip transit_server.py (that's the library module, not the entry point)
    const candidates = [
      "transit_service.py",
      "service.py",
      "main.py",
      "app.py",
      "server.py",
      "filters.py",
    ];

    for (const candidate of candidates) {
      const path = join(this.options.pythonDir, candidate);
      if (existsSync(path)) return path;
    }

    return null;
  }

  /**
   * Wait for the Python process to print PORT=<port> or SOCKET=<path> on stdout.
   */
  private waitForTransport(
    proc: ChildProcess
  ): Promise<{ type: "socket"; path: string } | { type: "tcp"; port: number }> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            "Python process did not print PORT= or SOCKET= within timeout"
          )
        );
      }, this.options.connectTimeout);

      let buffer = "";
      proc.stdout!.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const socketMatch = buffer.match(/SOCKET=(.+)/);
        if (socketMatch) {
          clearTimeout(timeout);
          resolve({ type: "socket", path: socketMatch[1].trim() });
          return;
        }
        const portMatch = buffer.match(/PORT=(\d+)/);
        if (portMatch) {
          clearTimeout(timeout);
          resolve({ type: "tcp", port: parseInt(portMatch[1], 10) });
        }
      });

      proc.stderr!.on("data", (chunk: Buffer) => {
        // Forward Python stderr for debugging
        process.stderr.write(`[transit-python] ${chunk}`);
      });
    });
  }

  /**
   * Connect a pool of sockets to the Python server via UDS or TCP.
   */
  private async connectPool(size: number): Promise<void> {
    this.sockets = [];
    for (let i = 0; i < size; i++) {
      const socket = await this.createConnection();
      this.sockets.push(socket);
    }
  }

  /**
   * Create a single connection to the Python server.
   */
  private createConnection(): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const connectOpts = this.socketPath
        ? { path: this.socketPath }
        : { port: this.port, host: "127.0.0.1" };

      const socket = createConnection(connectOpts, () => {
        // TCP_NODELAY only applies to TCP sockets
        if (!this.socketPath) {
          socket.setNoDelay(true);
        }
        // Enable TCP keepalive to detect dead connections at OS level
        socket.setKeepAlive(true, 5000);
        // Set up response handler for this socket
        this.setupResponseHandler(socket);
        resolve(socket);
      });

      socket.on("error", reject);
      socket.setTimeout(this.options.connectTimeout, () => {
        reject(new Error("Connection timeout"));
      });
    });
  }

  /**
   * Restart the Python process if it crashed.
   */
  private maybeRestart(): void {
    if (this.restartCount >= this.options.maxRestarts) {
      console.error("[transit-python] Max restarts reached, giving up");
      return;
    }
    this.restartCount++;
    console.error(`[transit-python] Restarting (attempt ${this.restartCount})...`);
    this.ready = false;
    this.readyPromise = null;
    // Clean up old state
    for (const s of this.sockets) s.destroy();
    this.sockets = [];
    this.process?.kill();
    this.process = null;
    // Restart after a delay
    setTimeout(() => {
      this.start().catch((err) => {
        console.error(`[transit-python] Restart failed: ${err.message}`);
      });
    }, 1000 * this.restartCount);
  }

  /**
   * Call multiple Python functions concurrently (request pipelining).
   * Fires N calls without awaiting, then collects all responses.
   */
  async callBatch(calls: Array<{ name: string; args: string }>): Promise<string[]> {
    return Promise.all(calls.map(c => this.callFunction(c.name, c.args)));
  }

  /**
   * Call a Python function.
   * Converts snake_case names to camelCase (Python server registers camelCase names).
   */
  async callFunction(functionName: string, argsJson: string): Promise<string> {
    if (!this.ready || this.sockets.length === 0) {
      throw new Error("Python process not ready");
    }

    // Convert snake_case → camelCase (cached to avoid per-call regex)
    let pyName = this.nameCache.get(functionName);
    if (pyName === undefined) {
      pyName = functionName.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
      this.nameCache.set(functionName, pyName);
    }

    // Encode CALL_REQUEST
    const fnBytes = Buffer.from(pyName, "utf-8");
    const argsBytes = Buffer.from(argsJson, "utf-8");

    const payloadSize = 2 + fnBytes.length + 4 + argsBytes.length;
    const requestId = ++this.requestIdCounter;

    const message = Buffer.alloc(HEADER_SIZE + payloadSize);
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

    // Decode CALL_RESPONSE
    const status = response.readUInt8(10);
    const resultLen = response.readInt32LE(11);
    const result = response.subarray(15, 15 + resultLen).toString("utf-8");

    if (status === STATUS_ERROR) {
      const parsed = JSON.parse(result);
      throw new Error(parsed.error || "Python function returned error");
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

      // Process complete messages
      let consumed = 0;
      while (offset - consumed >= HEADER_SIZE) {
        const payloadLen = buffer.readUInt32LE(consumed + 6);
        const totalLen = HEADER_SIZE + payloadLen;

        if (offset - consumed < totalLen) break; // incomplete message

        const message = Buffer.from(buffer.subarray(consumed, consumed + totalLen));
        consumed += totalLen;

        const requestId = message.readUInt32LE(2);
        const pending = this.pending.get(requestId);
        if (pending) {
          this.pending.delete(requestId);
          clearTimeout(pending.timer);
          pending.resolve(message);
        }
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
   * Stop the Python process and clean up.
   */
  async stop(): Promise<void> {
    this.stopping = true;
    this.ready = false;

    // Reject all pending calls
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Python process shutting down"));
    }
    this.pending.clear();

    // Close all sockets
    for (const s of this.sockets) s.destroy();
    this.sockets = [];

    // Kill process
    if (this.process) {
      this.process.kill("SIGTERM");
      // Force kill after 5 seconds
      setTimeout(() => {
        this.process?.kill("SIGKILL");
      }, 5000);
      this.process = null;
    }

    this.readyPromise = null;
  }

  /**
   * Whether the Python process is ready to accept calls.
   */
  isReady(): boolean {
    return this.ready;
  }
}

// ─── Re-export ────────────────────────────────────────────────────────────────

export { PythonProcessManager as default };
