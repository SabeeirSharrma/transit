/**
 * Backend clients for benchmark runner.
 *
 * Each client exposes:
 *   start()  – launch the server process (idempotent)
 *   call(req) – send a request and return the parsed response
 *   close()  – tear down the server / connection
 */

import { resolve } from "node:path";
import { spawn } from "node:child_process";
import net from "node:net";
import fs from "node:fs";

// ─── gRPC ────────────────────────────────────────────────────────────────────

export class GrpcClient {
  constructor({ protoPath, host = "127.0.0.1", port = 50051, venvPython, rpcMap = null }) {
    this.protoPath = protoPath;
    this.host = host;
    this.port = port;
    this.venvPython = venvPython;
    this.rpcMap = rpcMap; // { operationName: { method: "MethodName", requestType: "Type" } }
    this.serverProc = null;
    this.client = null;
    this.grpc = null;
  }

  async start() {
    // Start the Python gRPC server
    this.serverProc = spawn(this.venvPython, ["server.py"], {
      cwd: resolve(this.protoPath, ".."),
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.serverProc.stderr?.on("data", (d) => {
      if (d.toString().includes("started")) process.stdout.write(d);
    });

    // Wait for server to be ready
    await new Promise((r) => setTimeout(r, 2000));

    // Create gRPC client using dynamic proto loading
    this.grpc = await import("@grpc/grpc-js");
    const protoLoader = await import("@grpc/proto-loader");
    const packageDef = protoLoader.loadSync(this.protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const proto = this.grpc.loadPackageDefinition(packageDef);
    // Find the service dynamically (handles nested packages like `package computational;`)
    let svc = null;
    function findService(obj) {
      if (obj?.service) return obj;
      for (const val of Object.values(obj || {})) {
        // Check any non-primitive value (objects AND functions)
        if (val && typeof val === "object") {
          const found = findService(val);
          if (found) return found;
        }
        // Functions can also have .service (e.g., gRPC constructor functions)
        if (typeof val === "function" && val.service) {
          return val;
        }
      }
      return null;
    }
    svc = findService(proto);
    if (!svc) throw new Error("No service found in proto");
    // When svc is a function (constructor), use it directly as ServiceClient
    // When svc is an object with .service, the constructor is svc[key]
    const ServiceClient = typeof svc === "function"
      ? svc
      : svc[Object.keys(svc.service)[0]];
    this.client = new ServiceClient(
      `${this.host}:${this.port}`,
      this.grpc.credentials.createInsecure()
    );
  }

  call(req) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("gRPC call timed out")), 10000);
      const done = (err, resp) => {
        clearTimeout(timer);
        if (err) return reject(err);
        resolve(resp);
      };
      if (this.rpcMap && req.operation && this.rpcMap[req.operation]) {
        // Operation-specific RPC (chat-server style)
        const rpcDef = this.rpcMap[req.operation];
        const requestMsg = {};
        for (const [k, v] of Object.entries(req.payload || {})) {
          requestMsg[k] = v;
        }
        this.client[rpcDef.method](requestMsg, done);
      } else if (req.operation !== undefined) {
        // Generic Compute RPC (computational benchmark style)
        this.client.Compute(
          { operation: req.operation, payload: Buffer.from(JSON.stringify(req.payload)) },
          (err, resp) => {
            if (err) return done(err);
            try {
              done(null, { result: JSON.parse(resp.result.toString()), execution_time_ms: resp.execution_time_ms });
            } catch {
              done(null, { result: resp.result.toString(), execution_time_ms: resp.execution_time_ms });
            }
          }
        );
      } else {
        clearTimeout(timer);
        reject(new Error("GrpcClient.call expects {operation, payload}"));
      }
    });
  }

  close() {
    this.serverProc?.kill();
    this.client?.close();
  }
}

// ─── Apache Thrift (raw TCP, binary protocol) ────────────────────────────────

export class ThriftClient {
  constructor({ host = "127.0.0.1", port = 50053, venvPython, rpcMap = null }) {
    this.host = host;
    this.port = port;
    this.venvPython = venvPython;
    this.rpcMap = rpcMap;
    this.serverProc = null;
  }

  async start() {
    this.serverProc = spawn(this.venvPython, ["server.py"], {
      cwd: resolve(this.venvPython, "../.."),
      stdio: ["ignore", "pipe", "pipe"],
    });
    await new Promise((r) => setTimeout(r, 2000));
    this.client = true; // Mark as connected (Thrift uses raw TCP per call)
  }

  // ── Thrift Binary Protocol helpers ──

  _writeByte(buf, val) { buf.push(val & 0xff); }

  _writeI32(buf, val) {
    buf.push((val >>> 24) & 0xff, (val >>> 16) & 0xff, (val >>> 8) & 0xff, val & 0xff);
  }

  _writeI64(buf, val) {
    const hi = Math.floor(val / 0x100000000);
    const lo = val >>> 0;
    this._writeI32(buf, hi);
    this._writeI32(buf, lo);
  }

  _writeDouble(buf, val) {
    const ab = new ArrayBuffer(8);
    new DataView(ab).setFloat64(0, val, false);
    const bytes = new Uint8Array(ab);
    for (let i = 0; i < 8; i++) buf.push(bytes[i]);
  }

  _writeString(buf, str) {
    const bytes = Buffer.from(str, "utf-8");
    this._writeI32(buf, bytes.length);
    for (let i = 0; i < bytes.length; i++) buf.push(bytes[i]);
  }

  _writeFieldHeader(buf, type, id) {
    this._writeByte(buf, type);
    this._writeI16(buf, id);
  }

  _writeI16(buf, val) {
    buf.push((val >>> 8) & 0xff, val & 0xff);
  }

  _writeMessageBegin(buf, name, type, seqid) {
    this._writeI32(buf, (0x80 << 24) | (1 << 16) | type); // strict version + msg type CALL=1
    this._writeString(buf, name);
    this._writeI32(buf, seqid);
  }

  _writeMessageEnd(buf) { this._writeByte(buf, 0); } // STOP field

  // Read helpers
  _readByte(buf, offset) { return { val: buf[offset], offset: offset + 1 }; }

  _readI16(buf, offset) {
    return { val: (buf[offset] << 8) | buf[offset + 1], offset: offset + 2 };
  }

  _readI32(buf, offset) {
    return {
      val: (buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3],
      offset: offset + 4,
    };
  }

  _readI64(buf, offset) {
    const hi = this._readI32(buf, offset);
    const lo = this._readI32(buf, hi.offset);
    return { val: hi.val * 0x100000000 + (lo.val >>> 0), offset: lo.offset };
  }

  _readDouble(buf, offset) {
    const ab = new ArrayBuffer(8);
    const view = new Uint8Array(ab);
    for (let i = 0; i < 8; i++) view[i] = buf[offset + i];
    return { val: new DataView(ab).getFloat64(0, false), offset: offset + 8 };
  }

  _readString(buf, offset) {
    const len = this._readI32(buf, offset);
    const str = Buffer.from(buf.slice(len.offset, len.offset + len.val)).toString("utf-8");
    return { val: str, offset: len.offset + len.val };
  }

  _readMessageBegin(buf, offset) {
    const versionAndType = this._readI32(buf, offset);
    const version = (versionAndType.val >>> 24) & 0xff;
    const type = (versionAndType.val >>> 16) & 0xff;
    const name = this._readString(buf, versionAndType.offset);
    const seqid = this._readI32(buf, name.offset);
    return { name: name.val, type, seqid: seqid.val, offset: seqid.offset };
  }

  // Build a ComputeRequest struct (method=1: operation, method=2: payload)
  _buildComputeRequest(operation, payloadJson) {
    const buf = [];
    this._writeFieldHeader(buf, 11, 1); // STRING field, id=1 (operation)
    this._writeString(buf, operation);
    this._writeFieldHeader(buf, 11, 2); // STRING field, id=2 (payload as string)
    this._writeString(buf, payloadJson);
    this._writeByte(buf, 0); // STOP
    return buf;
  }

  // Parse a ComputeResponse struct (method=1: result, method=2: execution_time_ms)
  _parseComputeResponse(buf) {
    let offset = 0;
    let result = null;
    let execution_time_ms = 0;

    while (offset < buf.length) {
      const field = this._readByte(buf, offset);
      if (field.val === 0) break; // STOP
      const fieldType = field.val;
      const fieldId = this._readI16(buf, field.offset);

      if (fieldId.val === 1 && fieldType === 11) { // result: STRING
        const str = this._readString(buf, fieldId.offset);
        result = str.val;
        offset = str.offset;
      } else if (fieldId.val === 2 && fieldType === 4) { // execution_time_ms: DOUBLE
        const d = this._readDouble(buf, fieldId.offset);
        execution_time_ms = d.val;
        offset = d.offset;
      } else {
        // Skip unknown field
        offset = this._skipField(buf, fieldId.offset, fieldType);
      }
    }

    return { result, execution_time_ms };
  }

  _skipField(buf, offset, type) {
    switch (type) {
      case 1: return offset + 1; // BOOL
      case 2: return offset + 2; // I8 (byte)
      case 3: return offset + 2; // I16
      case 4: return offset + 4; // I32
      case 5: return offset + 8; // I64
      case 6: return offset + 8; // DOUBLE
      case 7: { // STRING (binary)
        const len = this._readI32(buf, offset);
        return len.offset + len.val;
      }
      default: return offset; // unknown, bail
    }
  }

  call(req) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error("Thrift call timed out"));
      }, 10000);

      const methodName = this.rpcMap && req.operation && this.rpcMap[req.operation]
        ? this.rpcMap[req.operation].method
        : "compute";

      const socket = net.createConnection({ host: this.host, port: this.port }, () => {
        const msg = [];
        this._writeMessageBegin(msg, methodName, 1, 1);

        if (this.rpcMap && req.operation && this.rpcMap[req.operation]) {
          // Chat-server style: write named fields from payload
          const payload = req.payload || {};
          let fieldId = 1;
          for (const [k, v] of Object.entries(payload)) {
            if (typeof v === "string") {
              this._writeFieldHeader(msg, 11, fieldId); // STRING
              this._writeString(msg, v);
            } else if (typeof v === "number" && Number.isInteger(v)) {
              this._writeFieldHeader(msg, 8, fieldId); // I32
              this._writeI32(msg, v);
            } else if (typeof v === "number") {
              this._writeFieldHeader(msg, 4, fieldId); // DOUBLE  (using I32 as approximation for i64)
              this._writeI32(msg, Math.floor(v));
            } else if (typeof v === "boolean") {
              this._writeFieldHeader(msg, 2, fieldId); // BOOL
              this._writeByte(msg, v ? 1 : 0);
            } else if (Array.isArray(v)) {
              // For arrays, serialize as JSON string
              this._writeFieldHeader(msg, 11, fieldId); // STRING
              this._writeString(msg, JSON.stringify(v));
            } else if (typeof v === "object" && v !== null) {
              this._writeFieldHeader(msg, 11, fieldId); // STRING
              this._writeString(msg, JSON.stringify(v));
            }
            fieldId++;
          }
        } else {
          // Computational style: compute_args { request: ComputeRequest { operation, payload } }
          // compute_args field 1: request (STRUCT type=12)
          this._writeFieldHeader(msg, 12, 1);
          // ComputeRequest struct: operation (STRING field 1) + payload (STRING field 2)
          this._writeFieldHeader(msg, 11, 1); // STRING field, id=1 (operation)
          this._writeString(msg, req.operation);
          this._writeFieldHeader(msg, 11, 2); // STRING field, id=2 (payload as string)
          this._writeString(msg, JSON.stringify(req.payload));
          this._writeByte(msg, 0); // STOP (end ComputeRequest)
        }

        this._writeMessageEnd(msg);

        const frame = Buffer.alloc(4 + msg.length);
        frame.writeUInt32BE(msg.length, 0);
        for (let i = 0; i < msg.length; i++) frame[4 + i] = msg[i];
        socket.write(frame);
      });

      let data = Buffer.alloc(0);
      socket.on("data", (chunk) => {
        data = Buffer.concat([data, chunk]);
        if (data.length < 4) return;
        const frameLen = data.readUInt32BE(0);
        if (data.length < 4 + frameLen) return;

        // Parse response: compute_result { success: ComputeResponse { result, execution_time_ms } }
        const frameBytes = [...data.slice(4, 4 + frameLen)];
        let offset = 0;
        const msgBegin = this._readMessageBegin(frameBytes, offset);
        offset = msgBegin.offset;

        // compute_result struct — read field 0 (success: STRUCT, type=12)
        let foundSuccess = false;
        while (offset < frameBytes.length) {
          const field = this._readByte(frameBytes, offset);
          if (field.val === 0) break; // STOP
          const fieldType = field.val;
          const fieldId = this._readI16(frameBytes, field.offset);
          offset = fieldId.offset;
          if (fieldId.val === 0 && fieldType === 12) {
            // success field (STRUCT type=12) — this is the ComputeResponse
            foundSuccess = true;
            // Parse ComputeResponse struct directly
            const resp = this._parseComputeResponse(frameBytes.slice(offset));
            clearTimeout(timer);
            socket.destroy();
            try {
              const parsed = JSON.parse(resp.result);
              resolve({ result: parsed, execution_time_ms: resp.execution_time_ms });
            } catch {
              resolve({ result: resp.result, execution_time_ms: resp.execution_time_ms });
            }
            return;
          }
          offset = this._skipField(frameBytes, offset, fieldType);
        }

        // No success field found
        clearTimeout(timer);
        socket.destroy();
        resolve({ result: null, execution_time_ms: 0 });
      });

      socket.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  close() { this.serverProc?.kill(); }
}

// ─── Unix Domain Socket (length-prefixed JSON) ──────────────────────────────

export class UnixSocketClient {
  constructor({ socketPath = "/tmp/transit_benchmark.sock" }) {
    this.socketPath = socketPath;
  }

  async start() {
    // Server is started externally; just wait for socket to appear
    for (let i = 0; i < 30; i++) {
      if (fs.existsSync(this.socketPath)) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`Socket ${this.socketPath} not found after 15s`);
  }

  call(req) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error("UnixSocket call timed out"));
      }, 10000);

      const socket = net.createConnection({ path: this.socketPath }, () => {
        const payload = Buffer.from(JSON.stringify(req));
        const frame = Buffer.alloc(4 + payload.length);
        frame.writeUInt32BE(payload.length, 0);
        payload.copy(frame, 4);
        socket.write(frame);
      });

      let data = Buffer.alloc(0);
      socket.on("data", (chunk) => {
        data = Buffer.concat([data, chunk]);
        if (data.length < 4) return;
        const frameLen = data.readUInt32BE(0);
        if (data.length < 4 + frameLen) return;
        const resp = JSON.parse(data.slice(4, 4 + frameLen).toString());
        clearTimeout(timer);
        socket.destroy();
        resolve(resp);
      });

      socket.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  close() {}
}

// ─── Subprocess stdin/stdout (line-delimited JSON) ───────────────────────────

export class SubprocessClient {
  constructor({ scriptPath, venvPython }) {
    this.scriptPath = scriptPath;
    this.venvPython = venvPython;
    this.proc = null;
    this.pending = new Map();
    this.counter = 0;
    this.buffer = "";
  }

  async start() {
    this.proc = spawn(this.venvPython, [this.scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.proc.stdout.on("data", (chunk) => {
      this.buffer += chunk.toString();
      const lines = this.buffer.split("\n");
      this.buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const resp = JSON.parse(line);
          const id = resp.id;
          const cb = id !== undefined ? this.pending.get(id) : undefined;
          if (cb) {
            this.pending.delete(id);
            cb(resp);
          }
        } catch {
          // ignore parse errors on partial lines
        }
      }
    });
    this.proc.stderr?.on("data", (d) => {
      // optionally log errors
    });
    // Wait for process to be ready
    await new Promise((r) => setTimeout(r, 500));
  }

  call(req) {
    return new Promise((resolve, reject) => {
      const id = this.counter++;
      this.pending.set(id, resolve);
      this.proc.stdin.write(JSON.stringify({ ...req, id }) + "\n");
      // Timeout after 30s
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error("Subprocess call timed out"));
        }
      }, 30000);
    });
  }

  close() {
    this.proc?.stdin.end();
    this.proc?.kill();
  }
}

// ─── ZeroMQ REQ/REP ──────────────────────────────────────────────────────────

export class ZeroMQClient {
  constructor({ port = 5555 }) {
    this.port = port;
    this.socket = null;
    this.ctx = null;
  }

  async start() {
    const zmq = await import("zeromq");
    this.ctx = new zmq.Context();
    this.socket = new zmq.Reply();
    // Note: The server binds, the client connects
    // Actually for benchmark, the server is already running and bound
    // We need to connect a REQ socket to it
    // But zmq.Reply is a REP socket... we need zmq.Request
    // Let me fix this
    this.ctx = new zmq.Context();
    this.socket = new zmq.Request();
    this.socket.connect(`tcp://127.0.0.1:${this.port}`);
    await new Promise((r) => setTimeout(r, 500));
  }

  async call(req) {
    const result = await Promise.race([
      (async () => {
        await this.socket.send(JSON.stringify(req));
        const [response] = await this.socket.receive();
        return JSON.parse(response.toString());
      })(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("ZeroMQ call timed out")), 5000)),
    ]);
    return result;
  }

  async close() {
    await this.socket?.close();
    this.ctx?.term();
  }
}

// ─── Redis Pub/Sub ───────────────────────────────────────────────────────────

export class RedisPubSubClient {
  constructor({ host = "127.0.0.1", port = 6379 }) {
    this.host = host;
    this.port = port;
    this.client = null;
    this.subscriber = null;
    this.pending = new Map();
    this.counter = 0;
    this.connected = false;
  }

  async start() {
    const { default: Redis } = await import("ioredis");
    this.client = new Redis({ host: this.host, port: this.port, maxRetriesPerRequest: 3, retryStrategy: () => null });
    this.subscriber = new Redis({ host: this.host, port: this.port, maxRetriesPerRequest: 3, retryStrategy: () => null });
    
    // Suppress unhandled error events — we detect failures via readyCheck
    this.client.on("error", () => {});
    this.subscriber.on("error", () => {});
    
    try {
      await this.subscriber.subscribe("benchmark.response");
    } catch (e) {
      this.client?.disconnect();
      this.subscriber?.disconnect();
      throw new Error(`Redis subscribe failed: ${e.message}`);
    }
    
    this.subscriber.on("message", (_channel, message) => {
      const resp = JSON.parse(message);
      const cb = this.pending.get(resp.id);
      if (cb) {
        this.pending.delete(resp.id);
        cb(resp);
      }
    });
    await new Promise((r) => setTimeout(r, 500));
    this.connected = true;
  }

  call(req) {
    return new Promise((resolve, reject) => {
      const id = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      this.pending.set(id, resolve);
      this.client.publish("benchmark.request", JSON.stringify({ ...req, id }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error("Redis Pub/Sub call timed out"));
        }
      }, 30000);
    });
  }

  close() {
    this.client?.disconnect();
    this.subscriber?.disconnect();
  }
}

// ─── PyO3 (subprocess calling Python wrapper that loads the compiled Rust module) ──

export class PyO3Client {
  constructor({ venvPython, modulePath }) {
    this.venvPython = venvPython;
    this.modulePath = modulePath;
    this.proc = null;
    this.pending = new Map();
    this.counter = 0;
    this.buffer = "";
  }

  async start() {
    // Write a small Python wrapper that imports the compiled pyo3 module
    const wrapperCode = `
import sys, json, importlib.util, os
spec = importlib.util.spec_from_file_location("pyo3_benchmark", "${this.modulePath}")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
print("READY")
sys.stdout.flush()
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    req_id = None
    try:
        req = json.loads(line)
        req_id = req.get("id")
        operation = req["operation"]
        payload = req["payload"]
        result = mod.compute(operation, payload)
        # result is already a dict from PyO3 — just extract fields
        out = result.get("result", result)
        resp = {"result": out, "execution_time_ms": result.get("execution_time_ms", 0)}
        if req_id is not None:
            resp["id"] = req_id
        print(json.dumps(resp))
        sys.stdout.flush()
    except Exception as e:
        resp = {"error": str(e)}
        if req_id is not None:
            resp["id"] = req_id
        print(json.dumps(resp))
        sys.stdout.flush()
`;
    const wrapperPath = "/tmp/pyo3_benchmark_wrapper.py";
    fs.writeFileSync(wrapperPath, wrapperCode);

    this.proc = spawn(this.venvPython, [wrapperPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.proc.on("exit", (code, signal) => {
      console.error(`[pyo3] Process exited (code=${code}, signal=${signal})`);
    });
    this.proc.stdout.on("data", (chunk) => {
      this.buffer += chunk.toString();
      const lines = this.buffer.split("\n");
      this.buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        if (line.trim() === "READY") {
          this._readyResolve?.();
          continue;
        }
        try {
          const resp = JSON.parse(line);
          const id = resp.id;
          const cb = id !== undefined ? this.pending.get(id) : undefined;
          if (cb) {
            this.pending.delete(id);
            cb(resp);
          }
        } catch {
          // ignore parse errors on partial lines
        }
      }
    });
    this.proc.stderr?.on("data", (d) => {
      process.stderr.write(`[pyo3] ${d}`);
    });
    // Wait for READY signal or timeout
    await new Promise((resolve, reject) => {
      this._readyResolve = resolve;
      const timeout = setTimeout(() => {
        reject(new Error("PyO3 process did not print READY within 10s — import likely failed"));
      }, 10000);
      this.proc.on("exit", (code) => {
        if (code !== 0 && code !== null) {
          clearTimeout(timeout);
          reject(new Error(`PyO3 process exited with code ${code} during startup`));
        }
      });
    });
  }

  call(req) {
    return new Promise((resolve, reject) => {
      if (!this.proc || this.proc.exitCode !== null) {
        return reject(new Error("PyO3 process is not running"));
      }
      const id = this.counter++;
      this.pending.set(id, resolve);
      this.proc.stdin.write(JSON.stringify({ ...req, id }) + "\n");
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error("PyO3 call timed out"));
        }
      }, 30000);
    });
  }

  close() {
    this.proc?.stdin.end();
    this.proc?.kill();
  }
}
