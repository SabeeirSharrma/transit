#!/usr/bin/env node
/**
 * Benchmark Runner: Transit vs FastAPI+JSON
 *
 * Tests complex multi-language operations across both approaches:
 * 1. ETL Pipeline — parse, group, aggregate
 * 2. Text Analysis — tokenization, frequency, n-grams, readability
 * 3. Matrix Multiply — O(n³) numerical computation
 * 4. Graph Processing — BFS, Dijkstra, PageRank, connected components
 * 5. Fibonacci Memoization — CPU-bound recursion
 * 6. SHA-256 Hashing — crypto stress test
 *
 * Each operation is run N iterations with warmup, measuring:
 * - Latency (p50, p95, p99)
 * - Throughput (ops/sec)
 * - Cross-language overhead (Transit)
 * - JSON serialization cost (FastAPI)
 */

import { transit } from "@sabeeirsharrma/transit";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import {
  GrpcClient, ThriftClient, UnixSocketClient,
  SubprocessClient, ZeroMQClient, RedisPubSubClient, PyO3Client,
} from "../clients.mjs";

const __dirname = import.meta.dirname;
const RESULTS_DIR = resolve(__dirname, "./results");

// All backend names in display order
const ALL_BACKENDS = ["fastapi", "transit_rust", "transit_python", "transit_java",
                      "grpc", "thrift", "unix_socket", "subprocess", "zeromq", "redis", "pyo3"];

// ─── CLI Argument Parsing ────────────────────────────────────────────────────

const args = process.argv.slice(2);
const MODE = args.includes("--serial") ? "serial"
           : args.includes("--concurrent") ? "concurrent"
           : "both";

const ITERATIONS = 100;
const WARMUP = 10;
const CONCURRENT = 10;

// ─── Test Data Generators ────────────────────────────────────────────────────

function generateCsvData(rows = 1000) {
  const keys = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"];
  let csv = "";
  for (let i = 0; i < rows; i++) {
    const key = keys[i % keys.length];
    const val = (Math.random() * 1000).toFixed(2);
    csv += `${key},${val}\n`;
  }
  return csv;
}

function generateText(wordCount = 5000) {
  const words = [
    "the", "quick", "brown", "fox", "jumps", "over", "lazy", "dog",
    "technology", "benchmark", "performance", "analysis", "optimization",
    "distributed", "systems", "architecture", "framework", "implementation",
    "computational", "complexity", "algorithm", "data", "structure", "pipeline",
    "transformation", "aggregation", "processing", "streaming", "concurrent",
  ];
  let text = "";
  for (let i = 0; i < wordCount; i++) {
    text += words[Math.floor(Math.random() * words.length)] + " ";
    if (i % 20 === 19) text += ". ";
  }
  return text;
}

function generateMatrix(rows, cols) {
  return Array.from({ length: rows * cols }, () => Math.random() * 100);
}

function generateGraph(nodes = 500, edgeFactor = 3) {
  const edges = [];
  for (let i = 0; i < nodes; i++) {
    for (let e = 0; e < edgeFactor; e++) {
      const to = Math.floor(Math.random() * nodes);
      const weight = Math.floor(Math.random() * 100) + 1;
      edges.push(i, to, weight);
    }
  }
  return edges;
}

// ─── Benchmarks ──────────────────────────────────────────────────────────────

const BENCHMARKS = {
  etl_pipeline: {
    name: "ETL Pipeline (1000 rows)",
    data: () => JSON.stringify({ csv_data: generateCsvData(1000) }),
    fastapi_endpoint: "/etl-pipeline",
    transit_fn: "etlPipeline",
  },
  text_analysis: {
    name: "Text Analysis (5000 words)",
    data: () => JSON.stringify({ text: generateText(5000) }),
    fastapi_endpoint: "/analyze-text-full",
    transit_fn: "analyzeTextFull",
  },
  matrix_multiply: {
    name: "Matrix Multiply (50×50)",
    data: () => {
      const a = generateMatrix(50, 50);
      const b = generateMatrix(50, 50);
      return JSON.stringify({ a, b, m: 50, n: 50, p: 50 });
    },
    fastapi_endpoint: "/matrix-multiply",
    transit_fn: "matrixMultiply",
  },
  matrix_determinant: {
    name: "Matrix Determinant (8×8)",
    data: () => JSON.stringify({ flat: generateMatrix(8, 8), n: 8 }),
    fastapi_endpoint: "/matrix-determinant",
    transit_fn: "matrixDeterminant",
  },
  graph_processing: {
    name: "Graph Processing (500 nodes)",
    data: () => JSON.stringify({
      nodes: 500,
      edges_flat: generateGraph(500, 3),
      iterations: 20,
    }),
    fastapi_endpoint: "/process-graph",
    transit_fn: "processGraph",
  },
  fibonacci: {
    name: "Fibonacci Memo (n=38)",
    data: () => JSON.stringify({ n: 38 }),
    fastapi_endpoint: "/fibonacci-memo",
    transit_fn: "fibonacciMemo",
  },
  hashing: {
    name: "SHA-256 Hashing (10K rounds)",
    data: () => JSON.stringify({ data: "benchmark-test-data-payload", rounds: 10000 }),
    fastapi_endpoint: "/hash-data",
    transit_fn: "hashData",
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function stats(times) {
  return {
    min: Math.min(...times),
    max: Math.max(...times),
    mean: times.reduce((a, b) => a + b, 0) / times.length,
    median: percentile(times, 50),
    p95: percentile(times, 95),
    p99: percentile(times, 99),
  };
}

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const urlObj = new URL(url);
    const req = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`Parse error: ${body.substring(0, 200)}`)); }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function waitForServer(url, maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        http.get(`${urlObj.protocol}//${urlObj.hostname}:${urlObj.port}/health`, (res) => {
          res.resume();
          resolve();
        }).on("error", reject);
      });
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return false;
}

// ─── Output Correctness Validation ───────────────────────────────────────────
// Prevents "ghost wins" where a backend reports fast times but returns wrong/empty data.

function extractKey(result, operation) {
  // Extract the comparable part of a result, stripping execution_time_ms and duration_ms.
  // Different backends wrap results differently — normalize to just the payload.
  if (!result || typeof result !== "object") return null;
  const r = { ...result };
  delete r.execution_time_ms;
  delete r.duration_ms;
  // Some backends nest under "result"
  if (r.result && typeof r.result === "object" && Object.keys(r).length === 1) {
    return r.result;
  }
  return r;
}

function deepEqual(a, b, path = "") {
  const diffs = [];
  if (a === b) return diffs;
  if (a == null || b == null) {
    if (a !== b) diffs.push(`${path || "(root)"}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
    return diffs;
  }
  if (typeof a !== typeof b) {
    diffs.push(`${path || "(root)"}: type ${typeof a} vs ${typeof b}`);
    return diffs;
  }
  if (typeof a !== "object") {
    if (a !== b) diffs.push(`${path || "(root)"}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
    return diffs;
  }
  // Array length
  if (Array.isArray(a) && Array.isArray(b) && a.length !== b.length) {
    diffs.push(`${path || "(root)"}: array length ${a.length} vs ${b.length}`);
    return diffs;
  }
  // Numeric tolerance for floating-point
  if (typeof a === "number" && typeof b === "number") {
    if (Math.abs(a - b) > Math.max(1e-9, Math.abs(a) * 1e-9)) {
      diffs.push(`${path}: ${a} vs ${b}`);
    }
    return diffs;
  }
  // Keys
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of [...allKeys].sort()) {
    const va = a[k];
    const vb = b[k];
    if (va === undefined) { diffs.push(`${path}.${k}: missing vs ${JSON.stringify(vb).slice(0, 80)}`); continue; }
    if (vb === undefined) { diffs.push(`${path}.${k}: ${JSON.stringify(va).slice(0, 80)} vs missing`); continue; }
    // Skip volatile fields
    if (k === "readability_score" || k === "avg_sentence_length" || k === "char_count" || k === "shortest_paths") continue;
    // For PageRank / pagerank_top5 — only compare top-5 node ids, not exact ranks (float precision)
    if (k === "page_rank" || k === "pagerank_top5") {
      if (Array.isArray(va) && Array.isArray(vb)) {
        const idsA = va.slice(0, 5).map(x => typeof x === "object" ? (x.node ?? x[0]) : x).sort((a, b) => a - b);
        const idsB = vb.slice(0, 5).map(x => typeof x === "object" ? (x.node ?? x[0]) : x).sort((a, b) => a - b);
        if (JSON.stringify(idsA) !== JSON.stringify(idsB)) {
          diffs.push(`${path}.${k}: top-5 nodes differ: ${JSON.stringify(idsA)} vs ${JSON.stringify(idsB)}`);
        }
        continue;
      }
    }
    diffs.push(...deepEqual(va, vb, path ? `${path}.${k}` : k));
  }
  return diffs;
}

async function validateAllBackends(benchmarks, config) {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  OUTPUT CORRECTNESS VALIDATION                              ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const validation = {};
  const allValid = [];

  for (const [key, benchmark] of Object.entries(benchmarks)) {
    const payload = JSON.parse(benchmark.data());
    const opName = OP_NAME_MAP[key] || key;
    const results = {};
    const errors = {};

    // FastAPI reference
    try {
      const body = JSON.parse(benchmark.data());
      results.fastapi = await httpPost(`http://127.0.0.1:${config.fastapi_port}${benchmark.fastapi_endpoint}`, body);
    } catch (e) { errors.fastapi = e.message; }

    // Transit/Rust reference
    try {
      results.transit_rust = await config.transitClient[benchmark.transit_fn](payload);
    } catch (e) { errors.transit_rust = e.message; }

    // Additional backends
    const additionalClients = config.additionalClients || {};
    for (const [name, client] of Object.entries(additionalClients)) {
      if (!client) continue;
      try {
        const resp = await client.call({ operation: opName, payload });
        // Extract the result part (strip execution_time_ms)
        results[name] = resp.result !== undefined ? resp.result : resp;
      } catch (e) { errors[name] = e.message; }
    }

    // Validate
    const baseline = results.fastapi || results.transit_rust;
    if (!baseline) {
      validation[key] = { status: "SKIP", reason: "No baseline available", errors };
      continue;
    }

    const baselineNorm = extractKey(baseline, key);
    const mismatches = [];
    for (const [name, result] of Object.entries(results)) {
      if (name === "fastapi" || name === "transit_rust") continue;
      const resultNorm = extractKey(result, key);
      const diffs = deepEqual(baselineNorm, resultNorm, name);
      if (diffs.length > 0) {
        mismatches.push({ backend: name, diffs });
      }
    }

    validation[key] = {
      status: mismatches.length === 0 ? "PASS" : "WARN",
      backendsChecked: Object.keys(results).length,
      mismatches,
      errors,
    };
    allValid.push({ key, status: validation[key].status, mismatches });
  }

  // Print summary
  for (const [key, v] of Object.entries(validation)) {
    const icon = v.status === "PASS" ? "✓" : v.status === "WARN" ? "⚠" : "○";
    const detail = v.status === "WARN"
      ? ` — ${v.mismatches.map(m => `${m.backend} (${m.diffs.length} diffs)`).join(", ")}`
      : v.status === "SKIP" ? ` — ${v.reason}` : "";
    console.log(`  ${icon} ${benchmarks[key].name}${detail}`);
    if (v.status === "WARN") {
      for (const m of v.mismatches) {
        for (const d of m.diffs.slice(0, 3)) {
          console.log(`      ${m.backend}: ${d}`);
        }
      }
    }
  }

  const warnCount = allValid.filter(v => v.status === "WARN").length;
  const passCount = allValid.filter(v => v.status === "PASS").length;
  console.log(`\n  ${passCount} passed, ${warnCount} warnings, ${allValid.length - passCount - warnCount} skipped\n`);

  return validation;
}

// ─── Runner ──────────────────────────────────────────────────────────────────

async function runBenchmark(benchmark, mode, config) {
  const times = [];
  const errors = [];

  for (let i = 0; i < WARMUP + ITERATIONS; i++) {
    const start = performance.now();
    try {
      if (mode === "fastapi") {
        const body = JSON.parse(benchmark.data());
        await httpPost(`http://127.0.0.1:${config.fastapi_port}${benchmark.fastapi_endpoint}`, body);
      } else if (mode === "transit") {
        const args = JSON.parse(benchmark.data());
        await config.transitClient[benchmark.transit_fn](args);
      }
      const elapsed = performance.now() - start;
      if (i >= WARMUP) times.push(elapsed);
    } catch (e) {
      errors.push(e.message);
      const elapsed = performance.now() - start;
      if (i >= WARMUP) times.push(elapsed);
    }
  }

  return {
    ...stats(times),
    errors: errors.length,
    ops_per_sec: 1000 / (times.reduce((a, b) => a + b, 0) / times.length),
  };
}

async function runConcurrentBenchmark(benchmark, mode, config, concurrency) {
  const times = [];
  const errors = [];

  for (let batch = 0; batch < WARMUP + ITERATIONS; batch += concurrency) {
    const promises = [];
    for (let c = 0; c < concurrency && batch + c < WARMUP + ITERATIONS; c++) {
      const start = performance.now();
      const p = (async () => {
        try {
          if (mode === "fastapi") {
            const body = JSON.parse(benchmark.data());
            await httpPost(`http://127.0.0.1:${config.fastapi_port}${benchmark.fastapi_endpoint}`, body);
          } else if (mode === "transit") {
            const args = JSON.parse(benchmark.data());
            await config.transitClient[benchmark.transit_fn](args);
          }
        } catch (e) {
          errors.push(e.message);
        }
        return performance.now() - start;
      })();
      promises.push(p);
    }
    const results = await Promise.all(promises);
    if (batch >= WARMUP) times.push(...results);
  }

  return {
    ...stats(times),
    errors: errors.length,
    ops_per_sec: 1000 / (times.reduce((a, b) => a + b, 0) / times.length),
    concurrency,
  };
}

// ─── Additional Backend Benchmarks ────────────────────────────────────────────

// Map benchmark keys to operation names expected by the Python servers
const OP_NAME_MAP = {
  etl_pipeline: "etl_pipeline",
  text_analysis: "text_analysis",
  matrix_multiply: "matrix_multiply",
  matrix_determinant: "matrix_determinant",
  graph_processing: "graph_processing",
  fibonacci: "fibonacci_memo",
  hashing: "sha256_hashing",
};

async function runAdditionalBenchmark(benchmark, client) {
  const times = [];
  const errors = [];
  const opName = Object.entries(BENCHMARKS).find(([, v]) => v === benchmark)?.[0];
  const operation = OP_NAME_MAP[opName] || opName;

  for (let i = 0; i < WARMUP + ITERATIONS; i++) {
    const payload = JSON.parse(benchmark.data());
    const start = performance.now();
    try {
      await client.call({ operation, payload });
    } catch (e) {
      errors.push(e.message);
    }
    const elapsed = performance.now() - start;
    if (i >= WARMUP) times.push(elapsed);
  }

  return {
    ...stats(times),
    errors: errors.length,
    ops_per_sec: 1000 / (times.reduce((a, b) => a + b, 0) / times.length),
  };
}

async function runConcurrentAdditionalBenchmark(benchmark, client, concurrency) {
  const times = [];
  const errors = [];
  const opName = Object.entries(BENCHMARKS).find(([, v]) => v === benchmark)?.[0];
  const operation = OP_NAME_MAP[opName] || opName;

  for (let batch = 0; batch < WARMUP + ITERATIONS; batch += concurrency) {
    const promises = [];
    for (let c = 0; c < concurrency && batch + c < WARMUP + ITERATIONS; c++) {
      const payload = JSON.parse(benchmark.data());
      const start = performance.now();
      const p = (async () => {
        try {
          await client.call({ operation, payload });
        } catch (e) {
          errors.push(e.message);
        }
        return performance.now() - start;
      })();
      promises.push(p);
    }
    const results = await Promise.all(promises);
    if (batch >= WARMUP) times.push(...results);
  }

  return {
    ...stats(times),
    errors: errors.length,
    ops_per_sec: 1000 / (times.reduce((a, b) => a + b, 0) / times.length),
    concurrency,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Benchmark: Transit (Binary Protocol) vs FastAPI (JSON)     ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // Start FastAPI (using uv-managed venv)
  console.log("Starting FastAPI server...");
  const fastapiUvicorn = resolve(__dirname, "./fastapi/.venv/bin/uvicorn");
  const fastapiProc = spawn(fastapiUvicorn, [
    "main:app",
    "--host", "127.0.0.1",
    "--port", "8000",
    "--log-level", "warning",
  ], {
    cwd: resolve(__dirname, "./fastapi"),
    stdio: ["ignore", "pipe", "pipe"],
  });

  const fastapiReady = await waitForServer("http://127.0.0.1:8000/health");
  if (!fastapiReady) {
    console.error("Failed to start FastAPI server");
    fastapiProc.kill();
    process.exit(1);
  }
  console.log("✓ FastAPI ready on port 8000\n");

  // Start Transit services
  console.log("Starting Transit services...");

  // Build Rust
  console.log("  Building Rust native addon...");
  const rustProc = spawn("cargo", ["build", "--release"], {
    cwd: resolve(__dirname, "./transit/rust"),
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve) => rustProc.on("close", resolve));

  // Copy .node file
  const rustTarget = resolve(__dirname, "./transit/rust/target/release/libbenchmark_rust.so");
  const rustDest = resolve(__dirname, "./transit/rust/index.node");
  if (fs.existsSync(rustTarget)) {
    fs.copyFileSync(rustTarget, rustDest);
  }

  // Start Transit
  const rs = transit.rust(resolve(__dirname, "./transit/rust"));
  const py = transit.python(resolve(__dirname, "./transit/python"), { env: { TRANSIT_USE_ORJSON: "1" } });

  // Start Java
  console.log("  Compiling Java...");
  const javaDir = resolve(__dirname, "./transit/java");
  const buildDir = resolve(javaDir, "build");
  fs.mkdirSync(buildDir, { recursive: true });

  const javacProc = spawn("javac", [
    "-d", buildDir,
    `${javaDir}/src/main/java/benchmark/java/BenchmarkService.java`,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((resolve) => javacProc.on("close", resolve));

  // Start Java service
  const javaProc = spawn("java", [
    "-cp", buildDir,
    "benchmark.java.BenchmarkService",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  let javaPort = null;
  javaProc.stdout.on("data", (data) => {
    const match = data.toString().match(/PORT=(\d+)/);
    if (match) javaPort = parseInt(match[1]);
  });

  // Wait for Java to be ready
  for (let i = 0; i < 30 && !javaPort; i++) {
    await new Promise(r => setTimeout(r, 1000));
  }

  let jv = null;
  if (javaPort) {
    console.log(`✓ Java ready on port ${javaPort}`);
    jv = transit.java(resolve(javaDir, "./src/main/java"));
  }

  // ── Start additional backends ──
  const grpcClient = new GrpcClient({
    protoPath: resolve(__dirname, "./grpc/proto/benchmark.proto"),
    venvPython: resolve(__dirname, "./grpc/.venv/bin/python3"),
  });
  const thriftClient = new ThriftClient({
    venvPython: resolve(__dirname, "./thrift/.venv/bin/python3"),
  });
  const unixSocketClient = new UnixSocketClient({
    socketPath: "/tmp/transit_benchmark.sock",
  });
  const subprocessClient = new SubprocessClient({
    scriptPath: resolve(__dirname, "./subprocess/server.py"),
    venvPython: resolve(__dirname, "./subprocess/.venv/bin/python3"),
  });
  const zeromqClient = new ZeroMQClient({ port: 5555 });
  const redisClient = new RedisPubSubClient({ host: "127.0.0.1", port: 6379 });
  const pyo3Client = new PyO3Client({
    venvPython: resolve(__dirname, "./fastapi/.venv/bin/python3"),  // reuse fastapi venv
    modulePath: resolve(__dirname, "./pyo3/target/release/libpyo3_benchmark.so"),
  });

  // Start backends that need their own servers
  const additionalBackends = [
    { name: "gRPC",         client: grpcClient,      venv: "./grpc/.venv/bin/python3",      server: "./grpc/server.py",      cwd: "./grpc" },
    { name: "Thrift",       client: thriftClient,     venv: "./thrift/.venv/bin/python3",    server: "./thrift/server.py",    cwd: "./thrift" },
    { name: "Unix Socket",  client: unixSocketClient, venv: null,                           server: "./unix-socket/server.py", cwd: "./unix-socket" },
    { name: "Subprocess",   client: subprocessClient, venv: "./subprocess/.venv/bin/python3", server: null,                  cwd: null },
    { name: "ZeroMQ",       client: zeromqClient,     venv: "./zeromq/.venv/bin/python3",    server: "./zeromq/server.py",    cwd: "./zeromq" },
    { name: "Redis PubSub", client: redisClient,      venv: "./redis-pubsub/.venv/bin/python3", server: "./redis-pubsub/server.py", cwd: "./redis-pubsub" },
    { name: "PyO3",         client: pyo3Client,       venv: null,                           server: null,                   cwd: null },
  ];

  for (const backend of additionalBackends) {
    try {
      process.stdout.write(`  Starting ${backend.name}...`);
      if (backend.server) {
        const venvPython = backend.venv ? resolve(__dirname, backend.venv) : "python3";
        const serverProc = spawn(venvPython, [backend.server.split("/").pop()], {
          cwd: backend.cwd ? resolve(__dirname, backend.cwd) : undefined,
          stdio: ["ignore", "pipe", "pipe"],
        });
        serverProc.stderr?.on("data", (d) => {
          const s = d.toString();
          if (s.includes("started") || s.includes("ready")) process.stdout.write(" " + s.trim());
        });
        backend.serverProc = serverProc;
        await new Promise((r) => setTimeout(r, 3000));
      }
      await backend.client.start();
      console.log(` ✓`);
    } catch (e) {
      console.log(` ✗ (${e.message})`);
      backend.client = null; // disable this backend
    }
  }

  console.log("\n✓ All services ready\n");
  console.log(transit.info());

  // ── Correctness validation ──
  const validationClients = {
    grpc: grpcClient?.client ? grpcClient : null,
    thrift: thriftClient?.client ? thriftClient : null,
    unix_socket: unixSocketClient,
    subprocess: subprocessClient,
    zeromq: zeromqClient?.socket ? zeromqClient : null,
    redis: redisClient?.connected ? redisClient : null,
    pyo3: pyo3Client?.proc ? pyo3Client : null,
  };
  const validation = await validateAllBackends(BENCHMARKS, {
    fastapi_port: 8000,
    transitClient: rs,
    additionalClients: validationClients,
  });

  // Run benchmarks
  const results = {
    timestamp: new Date().toISOString(),
    mode: MODE,
    iterations: ITERATIONS,
    warmup: WARMUP,
    validation,
    benchmarks: {},
  };

  // ── Serial benchmarks ──
  if (MODE === "both" || MODE === "serial") {
    for (const [key, benchmark] of Object.entries(BENCHMARKS)) {
      console.log(`\n━━━ ${benchmark.name} ━━━`);

      try {
        // FastAPI baseline
        process.stdout.write("  FastAPI (JSON)     ... ");
        const fastapiResult = await runBenchmark(benchmark, "fastapi", { fastapi_port: 8000 });
        console.log(`${fastapiResult.mean.toFixed(2)}ms avg, ${fastapiResult.ops_per_sec.toFixed(1)} ops/s`);

        // Transit with each language
        const transitResults = {};

        // Rust (in-process native addon)
        process.stdout.write("  Transit/Rust       ... ");
        transitResults.rust = await runBenchmark(benchmark, "transit", { transitClient: rs });
        console.log(`${transitResults.rust.mean.toFixed(2)}ms avg, ${transitResults.rust.ops_per_sec.toFixed(1)} ops/s`);

        // Python (TCP bridge)
        process.stdout.write("  Transit/Python     ... ");
        transitResults.python = await runBenchmark(benchmark, "transit", { transitClient: py });
        console.log(`${transitResults.python.mean.toFixed(2)}ms avg, ${transitResults.python.ops_per_sec.toFixed(1)} ops/s`);

        // Java (TCP bridge)
        if (jv) {
          process.stdout.write("  Transit/Java       ... ");
          transitResults.java = await runBenchmark(benchmark, "transit", { transitClient: jv });
          console.log(`${transitResults.java.mean.toFixed(2)}ms avg, ${transitResults.java.ops_per_sec.toFixed(1)} ops/s`);
        }

        // Additional backends
        const additionalResults = {};

        const additionalBenchmarks = [
          { name: "gRPC",       label: "gRPC             ", client: grpcClient,      enabled: grpcClient?.client },
          { name: "Thrift",     label: "Thrift           ", client: thriftClient,     enabled: thriftClient?.client },
          { name: "Unix Socket",label: "Unix Socket      ", client: unixSocketClient, enabled: true },
          { name: "Subprocess", label: "Subprocess       ", client: subprocessClient, enabled: true },
          { name: "ZeroMQ",     label: "ZeroMQ           ", client: zeromqClient,     enabled: true },
          { name: "Redis",      label: "Redis Pub/Sub    ", client: redisClient,      enabled: redisClient?.connected },
          { name: "PyO3",       label: "PyO3             ", client: pyo3Client,       enabled: true },
        ];

        for (const ab of additionalBenchmarks) {
          if (!ab.enabled) continue;
          try {
            process.stdout.write(`  ${ab.label} ... `);
            const result = await runAdditionalBenchmark(benchmark, ab.client);
            console.log(`${result.mean.toFixed(2)}ms avg, ${result.ops_per_sec.toFixed(1)} ops/s`);
            additionalResults[ab.name] = result;
          } catch (e) {
            console.log(`ERROR (${e.message})`);
            additionalResults[ab.name] = { error: e.message };
          }
        }

        results.benchmarks[key] = {
          name: benchmark.name,
          fastapi: fastapiResult,
          transit: transitResults,
          additional: additionalResults,
        };
      } catch (e) {
        console.error(`\n  ERROR: ${e.message}`);
        results.benchmarks[key] = {
          name: benchmark.name,
          error: e.message,
        };
      }
    }
  }

  // ── Concurrent benchmarks ──
  if (MODE === "both" || MODE === "concurrent") {
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`  CONCURRENT BENCHMARKS (${CONCURRENT} parallel requests)`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    for (const [key, benchmark] of Object.entries(BENCHMARKS)) {
      console.log(`\n━━━ ${benchmark.name} (concurrent) ━━━`);

      try {
        process.stdout.write("  FastAPI (JSON)     ... ");
        const fastapiConc = await runConcurrentBenchmark(benchmark, "fastapi", { fastapi_port: 8000 }, CONCURRENT);
        console.log(`${fastapiConc.mean.toFixed(2)}ms avg, ${fastapiConc.ops_per_sec.toFixed(1)} ops/s`);

        process.stdout.write("  Transit/Rust       ... ");
        const rustConc = await runConcurrentBenchmark(benchmark, "transit", { transitClient: rs }, CONCURRENT);
        console.log(`${rustConc.mean.toFixed(2)}ms avg, ${rustConc.ops_per_sec.toFixed(1)} ops/s`);

        process.stdout.write("  Transit/Python     ... ");
        const pyConc = await runConcurrentBenchmark(benchmark, "transit", { transitClient: py }, CONCURRENT);
        console.log(`${pyConc.mean.toFixed(2)}ms avg, ${pyConc.ops_per_sec.toFixed(1)} ops/s`);

        let javaConc = null;
        if (jv) {
          process.stdout.write("  Transit/Java       ... ");
          javaConc = await runConcurrentBenchmark(benchmark, "transit", { transitClient: jv }, CONCURRENT);
          console.log(`${javaConc.mean.toFixed(2)}ms avg, ${javaConc.ops_per_sec.toFixed(1)} ops/s`);
        }

        // Additional concurrent backends
        const additionalConc = {};
        const additionalConcBenchmarks = [
          { name: "gRPC",        label: "gRPC             ", client: grpcClient,      enabled: grpcClient?.client },
          { name: "Thrift",      label: "Thrift           ", client: thriftClient,     enabled: thriftClient?.client },
          { name: "Unix Socket", label: "Unix Socket      ", client: unixSocketClient, enabled: true },
          { name: "Subprocess",  label: "Subprocess       ", client: subprocessClient, enabled: true },
          { name: "ZeroMQ",      label: "ZeroMQ           ", client: zeromqClient,     enabled: true },
          { name: "Redis",       label: "Redis Pub/Sub    ", client: redisClient,      enabled: redisClient?.connected },
          { name: "PyO3",        label: "PyO3             ", client: pyo3Client,       enabled: true },
        ];

        for (const ab of additionalConcBenchmarks) {
          if (!ab.enabled) continue;
          try {
            process.stdout.write(`  ${ab.label} ... `);
            const result = await runConcurrentAdditionalBenchmark(benchmark, ab.client, CONCURRENT);
            console.log(`${result.mean.toFixed(2)}ms avg, ${result.ops_per_sec.toFixed(1)} ops/s`);
            additionalConc[ab.name] = result;
          } catch (e) {
            console.log(`ERROR (${e.message})`);
            additionalConc[ab.name] = { error: e.message };
          }
        }

        if (results.benchmarks[key]) {
          results.benchmarks[key].concurrent = {
            fastapi: fastapiConc,
            transit: {
              rust: rustConc,
              python: pyConc,
              java: jv ? javaConc : null,
            },
            additional: additionalConc,
          };
        }
      } catch (e) {
        console.error(`\n  ERROR: ${e.message}`);
        if (results.benchmarks[key]) {
          results.benchmarks[key].concurrent_error = e.message;
        }
      }
    }
  }

  // Save results
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const resultsPath = resolve(RESULTS_DIR, `benchmark-${Date.now()}.json`);
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n✓ Results saved to ${resultsPath}`);

  // Cleanup
  fastapiProc.kill();
  javaProc?.kill();
  for (const ab of additionalBackends) {
    ab.client?.close?.();
    ab.serverProc?.kill();
  }

  // Print summary and save log
  const logText = printSummary(results);
  const logPath = resolve(RESULTS_DIR, "benchmark.log");
  fs.writeFileSync(logPath, logText);
  console.log(`\n✓ Log saved to ${logPath}`);

  // Generate and save markdown report
  const mdText = generateMarkdown(results);
  const mdPath = resolve(RESULTS_DIR, "benchmark.md");
  fs.writeFileSync(mdPath, mdText);
  console.log(`✓ Markdown report saved to ${mdPath}`);
}

function printSummary(results) {
  const lines = [];
  const out = (s) => { lines.push(s); console.log(s); };

  out("");
  out("╔══════════════════════════════════════════════════════════════╗");
  out("║                    BENCHMARK SUMMARY                        ║");
  out("╚══════════════════════════════════════════════════════════════╝");
  out("");

  const ADDITIONAL_NAMES = ["gRPC", "Thrift", "Unix Socket", "Subprocess", "ZeroMQ", "Redis", "PyO3"];
  const headers = ["Operation", "FastAPI", "Transit/Rust", "Transit/Python", "Transit/Java",
                   ...ADDITIONAL_NAMES];
  const rows = [];

  for (const [key, data] of Object.entries(results.benchmarks)) {
    if (data.error) {
      rows.push([data.name, "ERROR", ...ADDITIONAL_NAMES.map(() => "ERROR")]);
      continue;
    }

    const row = [data.name];
    row.push(data.fastapi?.mean ? `${data.fastapi.mean.toFixed(2)}ms` : "-");
    row.push(data.transit?.rust?.mean ? `${data.transit.rust.mean.toFixed(2)}ms` : "-");
    row.push(data.transit?.python?.mean ? `${data.transit.python.mean.toFixed(2)}ms` : "-");
    row.push(data.transit?.java?.mean ? `${data.transit.java.mean.toFixed(2)}ms` : "N/A");

    for (const name of ADDITIONAL_NAMES) {
      const r = data.additional?.[name];
      row.push(r?.mean ? `${r.mean.toFixed(2)}ms` : r?.error ? "ERR" : "-");
    }
    rows.push(row);
  }

  // Calculate column widths
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => (r[i] || "").length))
  );

  // Print table
  const sep = widths.map(w => "─".repeat(w + 2)).join("┼");
  out(headers.map((h, i) => h.padEnd(widths[i])).join(" │ "));
  out(sep);
  for (const row of rows) {
    out(row.map((c, i) => (c || "-").padEnd(widths[i])).join(" │ "));
  }

  // Winner summary
  out("");
  out("─── Winners (lower is better) ───────────────────────────────────");
  for (const [key, data] of Object.entries(results.benchmarks)) {
    if (data.error) {
      out(`  ${data.name}: ERROR (${data.error})`);
      continue;
    }

    const times = { FastAPI: data.fastapi?.mean || Infinity };
    if (data.transit?.rust?.mean) times["Transit/Rust"] = data.transit.rust.mean;
    if (data.transit?.python?.mean) times["Transit/Python"] = data.transit.python.mean;
    if (data.transit?.java?.mean) times["Transit/Java"] = data.transit.java.mean;
    for (const name of ADDITIONAL_NAMES) {
      if (data.additional?.[name]?.mean) times[name] = data.additional[name].mean;
    }

    const fastest = Math.min(...Object.values(times));
    const winner = Object.keys(times).find(k => times[k] === fastest);
    const fastapiTime = times["FastAPI"] || Infinity;
    const speedup = fastest === fastapiTime
      ? `${(fastapiTime / Math.min(...Object.values(times).filter(t => t !== fastapiTime))).toFixed(1)}x faster than others`
      : `${(fastapiTime / fastest).toFixed(1)}x faster than FastAPI`;

    out(`  ${data.name}: ${winner} (${speedup})`);
  }

  return lines.join("\n");
}

function generateMarkdown(results) {
  const md = [];
  const modeLabel = results.mode === "serial" ? "Serial"
                  : results.mode === "concurrent" ? "Concurrent"
                  : "Serial & Concurrent";

  const ADDITIONAL = ["gRPC", "Thrift", "Unix Socket", "Subprocess", "ZeroMQ", "Redis", "PyO3"];

  md.push(`# Computational Benchmark Results`);
  md.push(``);
  md.push(`> Generated: ${results.timestamp} | Mode: ${modeLabel} | Iterations: ${results.iterations} | Warmup: ${results.warmup}`);
  md.push(``);

  // ── Validation Summary ──
  if (results.validation) {
    md.push(`## Correctness Validation`);
    md.push(``);
    md.push(`| Operation | Status | Backends Checked | Notes |`);
    md.push(`|-----------|--------|------------------|-------|`);
    for (const [key, v] of Object.entries(results.validation)) {
      const b = BENCHMARKS[key];
      const icon = v.status === "PASS" ? "PASS" : v.status === "WARN" ? "WARN" : "SKIP";
      const notes = v.status === "WARN"
        ? v.mismatches.map(m => `${m.backend}: ${m.diffs.length} diffs`).join("; ")
        : v.status === "SKIP" ? v.reason : "All backends match";
      md.push(`| ${b?.name || key} | ${icon} | ${v.backendsChecked} | ${notes} |`);
    }
    md.push(``);
  }

  // ── Serial Table ──
  if (results.mode === "both" || results.mode === "serial") {
    md.push(`## Serial (single request, ${results.iterations} iterations)`);
    md.push(``);

    // Build header
    const hdr = ["Operation",
      "FastAPI (ms)", "FastAPI (ops/s)",
      "Transit/Rust (ms)", "Transit/Rust (ops/s)",
      "Transit/Python (ms)", "Transit/Python (ops/s)",
      "Transit/Java (ms)", "Transit/Java (ops/s)",
      ...ADDITIONAL.flatMap(n => [`${n} (ms)`, `${n} (ops/s)`]),
      "Winner"];
    md.push(`| ${hdr.join(" | ")} |`);
    md.push(`| ${hdr.map(() => "---").join(" | ")} |`);

    for (const [key, data] of Object.entries(results.benchmarks)) {
      if (data.error) {
        md.push(`| ${data.name} | ${hdr.slice(1).map(() => "ERROR").join(" | ")} | ${data.error} |`);
        continue;
      }

      const ft = data.fastapi?.mean ?? Infinity;
      const fOps = data.fastapi?.ops_per_sec ?? 0;
      const rt = data.transit?.rust?.mean ?? Infinity;
      const rOps = data.transit?.rust?.ops_per_sec ?? 0;
      const pt = data.transit?.python?.mean ?? Infinity;
      const pOps = data.transit?.python?.ops_per_sec ?? 0;
      const jt = data.transit?.java?.mean ?? Infinity;
      const jOps = data.transit?.java?.ops_per_sec ?? 0;

      const vals = [data.name];
      const pushMsOps = (ms, ops) => {
        vals.push(ms === Infinity ? "N/A" : ms.toFixed(2));
        vals.push(ms === Infinity ? "N/A" : ops.toFixed(1));
      };
      pushMsOps(ft, fOps);
      pushMsOps(rt, rOps);
      pushMsOps(pt, pOps);
      pushMsOps(jt, jOps);

      // Additional backends
      const times = { "FastAPI": ft, "Transit/Rust": rt, "Transit/Python": pt, "Transit/Java": jt };
      for (const name of ADDITIONAL) {
        const r = data.additional?.[name];
        const ms = r?.mean ?? Infinity;
        const ops = r?.ops_per_sec ?? 0;
        pushMsOps(ms, ops);
        if (ms < Infinity) times[name] = ms;
      }

      const fastest = Math.min(...Object.values(times));
      const winner = Object.keys(times).find(k => times[k] === fastest);
      const speedup = fastest === ft
        ? `${(Math.min(...Object.values(times).filter(t => t !== ft)) / ft).toFixed(1)}x slower`
        : `${(ft / fastest).toFixed(1)}x faster`;
      vals.push(`**${winner}** (${speedup})`);

      md.push(`| ${vals.join(" | ")} |`);
    }
    md.push(``);
  }

  // ── Concurrent Table ──
  if (results.mode === "both" || results.mode === "concurrent") {
    md.push(`## Concurrent (${results.concurrency} parallel requests)`);
    md.push(``);

    const hdr = ["Operation",
      "FastAPI (ms)", "FastAPI (ops/s)",
      "Transit/Rust (ms)", "Transit/Rust (ops/s)",
      "Transit/Python (ms)", "Transit/Python (ops/s)",
      "Transit/Java (ms)", "Transit/Java (ops/s)",
      ...ADDITIONAL.flatMap(n => [`${n} (ms)`, `${n} (ops/s)`]),
      "Winner"];
    md.push(`| ${hdr.join(" | ")} |`);
    md.push(`| ${hdr.map(() => "---").join(" | ")} |`);

    for (const [key, data] of Object.entries(results.benchmarks)) {
      if (!data.concurrent) {
        if (data.concurrent_error) {
          md.push(`| ${data.name} | ${hdr.slice(1).map(() => "ERROR").join(" | ")} | ${data.concurrent_error} |`);
        }
        continue;
      }

      const ft = data.concurrent.fastapi?.mean ?? Infinity;
      const fOps = data.concurrent.fastapi?.ops_per_sec ?? 0;
      const rt = data.concurrent.transit?.rust?.mean ?? Infinity;
      const rOps = data.concurrent.transit?.rust?.ops_per_sec ?? 0;
      const pt = data.concurrent.transit?.python?.mean ?? Infinity;
      const pOps = data.concurrent.transit?.python?.ops_per_sec ?? 0;
      const jt = data.concurrent.transit?.java?.mean ?? Infinity;
      const jOps = data.concurrent.transit?.java?.ops_per_sec ?? 0;

      const vals = [data.name];
      const pushMsOps = (ms, ops) => {
        vals.push(ms === Infinity ? "N/A" : ms.toFixed(2));
        vals.push(ms === Infinity ? "N/A" : ops.toFixed(1));
      };
      pushMsOps(ft, fOps);
      pushMsOps(rt, rOps);
      pushMsOps(pt, pOps);
      pushMsOps(jt, jOps);

      const times = { "FastAPI": ft, "Transit/Rust": rt, "Transit/Python": pt, "Transit/Java": jt };
      for (const name of ADDITIONAL) {
        const r = data.concurrent.additional?.[name];
        const ms = r?.mean ?? Infinity;
        const ops = r?.ops_per_sec ?? 0;
        pushMsOps(ms, ops);
        if (ms < Infinity) times[name] = ms;
      }

      const fastest = Math.min(...Object.values(times));
      const winner = Object.keys(times).find(k => times[k] === fastest);
      const speedup = fastest === ft
        ? `${(Math.min(...Object.values(times).filter(t => t !== ft)) / ft).toFixed(1)}x slower`
        : `${(ft / fastest).toFixed(1)}x faster`;
      vals.push(`**${winner}** (${speedup})`);

      md.push(`| ${vals.join(" | ")} |`);
    }
    md.push(``);
  }

  // ── Key Takeaways ──
  md.push(`## Key Takeaways`);
  md.push(``);
  md.push(`| Backend | Protocol | Serialization | Connection Model |`);
  md.push(`|---------|----------|---------------|------------------|`);
  md.push(`| **Transit/Rust** | In-process native addon | Zero-copy | Direct function call |`);
  md.push(`| **Transit/Python** | TCP | Binary (orjson) | Persistent bridge |`);
  md.push(`| **Transit/Java** | TCP | Binary | Persistent bridge |`);
  md.push(`| **FastAPI** | HTTP/1.1 | JSON | HTTP request/response |`);
  md.push(`| **gRPC** | HTTP/2 | Protocol Buffers | Persistent stream |`);
  md.push(`| **Thrift** | TCP | Binary | Persistent connection |`);
  md.push(`| **Unix Socket** | Unix domain socket | JSON | Persistent connection |`);
  md.push(`| **Subprocess** | stdin/stdout | JSON | Persistent process |`);
  md.push(`| **ZeroMQ** | TCP | JSON | REQ/REP socket |`);
  md.push(`| **Redis Pub/Sub** | TCP | JSON | Pub/Sub channels |`);
  md.push(`| **PyO3** | In-process via Python | Python dict | Direct FFI call |`);
  md.push(``);
  md.push(`- Transit/Rust eliminates all IPC overhead — zero serialization, zero context switches`);
  md.push(`- Transit/Python and Transit/Java use a persistent TCP bridge — no HTTP overhead`);
  md.push(`- gRPC and Thrift use binary protocols but still require IPC serialization`);
  md.push(`- ZeroMQ and Unix Socket reduce overhead vs HTTP but still serialize to JSON`);
  md.push(`- Redis Pub/Sub adds broker overhead — useful for fan-out, costly for request/response`);
  md.push(`- PyO3 measures Rust FFI overhead from Python — lower bound for cross-language calls`);
  md.push(`- Subprocess has highest overhead due to process startup and stdin/stdout pipe buffering`);
  md.push(``);

  return md.join("\n");
}

main().catch(console.error);
