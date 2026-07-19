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
  /** Health check interval in ms (default: 5000) */
  healthCheckInterval?: number;
  /** Connection timeout in ms (default: 10000) */
  connectTimeout?: number;
  /** Maximum restart attempts */
  maxRestarts?: number;
}

export class PythonProcessManager {
  private options: Required<PythonProcessOptions>;
  private process: ChildProcess | null = null;
  private socket: Socket | null = null;
  private port: number = -1;
  private pending = new Map<number, PendingCall>();
  private requestIdCounter = 0;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private restartCount = 0;
  private ready = false;
  private readyPromise: Promise<void> | null = null;
  private stopping = false;

  constructor(options: PythonProcessOptions) {
    this.options = {
      pythonDir: options.pythonDir,
      serverScript: options.serverScript ?? "",
      interpreter: options.interpreter ?? "python3",
      healthCheckInterval: options.healthCheckInterval ?? 5000,
      connectTimeout: options.connectTimeout ?? 10000,
      maxRestarts: options.maxRestarts ?? 3,
    };
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
        `Python transit_server.py not found in ${pythonDir}\n` +
        `Ensure transit_server.py is in the directory or set serverScript option`
      );
    }

    // Spawn the Python process
    this.process = spawn(interpreter, [scriptPath], {
      cwd: pythonDir,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
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

    // Read stdout for PORT=<port> line
    this.port = await this.waitForPort(this.process);

    // Connect to the Python server
    await this.connect();

    // Start health checks
    this.startHealthCheck();

    this.ready = true;
    this.restartCount = 0;
    console.error(`[transit-python] Connected to Python process on port ${this.port}`);
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
    ];

    for (const candidate of candidates) {
      const path = join(this.options.pythonDir, candidate);
      if (existsSync(path)) return path;
    }

    return null;
  }

  /**
   * Wait for the Python process to print PORT=<port> on stdout.
   */
  private waitForPort(proc: ChildProcess): Promise<number> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Python process did not print PORT= within timeout"));
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
        // Forward Python stderr for debugging
        process.stderr.write(`[transit-python] ${chunk}`);
      });
    });
  }

  /**
   * Connect to the Python server via TCP.
   */
  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = createConnection({ port: this.port, host: "127.0.0.1" }, () => {
        this.socket = socket;
        socket.setNoDelay(true);
        resolve();
      });

      socket.on("error", reject);
      socket.setTimeout(this.options.connectTimeout, () => {
        reject(new Error("Connection timeout"));
      });
    });
  }

  /**
   * Start periodic health checks.
   */
  private startHealthCheck(): void {
    this.healthTimer = setInterval(async () => {
      try {
        await this.healthCheck();
      } catch {
        console.error("[transit-python] Health check failed, restarting...");
        this.ready = false;
        this.maybeRestart();
      }
    }, this.options.healthCheckInterval);
  }

  /**
   * Send a health ping and wait for pong.
   */
  async healthCheck(): Promise<void> {
    const ping = Buffer.alloc(HEADER_SIZE);
    ping.writeUInt8(PROTOCOL_VERSION, 0);
    ping.writeUInt8(TYPE_HEALTH_PING, 1);
    ping.writeUInt32LE(0, 2); // requestId
    ping.writeUInt32LE(0, 6); // payloadLen

    const response = await this.sendRaw(ping);
    if (response.readUInt8(1) !== TYPE_HEALTH_PONG) {
      throw new Error("Expected HEALTH_PONG response");
    }
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
    this.socket?.destroy();
    this.socket = null;
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
   * Call a Python function.
   * Converts snake_case names to camelCase (Python server registers camelCase names).
   */
  async callFunction(functionName: string, argsJson: string): Promise<string> {
    if (!this.ready || !this.socket) {
      throw new Error("Python process not ready");
    }

    // Convert snake_case → camelCase to match Python server's registered names
    const pyName = functionName.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());

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
   */
  private sendRaw(message: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error("Not connected"));
        return;
      }

      const requestId = message.readUInt32LE(2);

      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Call timed out (requestId=${requestId})`));
      }, 30000);

      this.pending.set(requestId, { resolve, reject, timer });

      // Set up response listener if not already listening
      if (!this.socket.listenerCount("data")) {
        this.setupResponseHandler();
      }

      this.socket.write(message);
    });
  }

  /**
   * Set up the response handler on the socket.
   */
  private setupResponseHandler(): void {
    if (!this.socket) return;

    let buffer = Buffer.alloc(0);

    this.socket.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      // Process complete messages
      while (buffer.length >= HEADER_SIZE) {
        const payloadLen = buffer.readUInt32LE(6);
        const totalLen = HEADER_SIZE + payloadLen;

        if (buffer.length < totalLen) break; // incomplete message

        const message = buffer.subarray(0, totalLen);
        buffer = buffer.subarray(totalLen);

        const requestId = message.readUInt32LE(2);
        const pending = this.pending.get(requestId);
        if (pending) {
          this.pending.delete(requestId);
          clearTimeout(pending.timer);
          pending.resolve(message);
        }
      }
    });
  }

  /**
   * Stop the Python process and clean up.
   */
  async stop(): Promise<void> {
    this.stopping = true;
    this.ready = false;

    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }

    // Reject all pending calls
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Python process shutting down"));
    }
    this.pending.clear();

    // Close socket
    this.socket?.destroy();
    this.socket = null;

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
