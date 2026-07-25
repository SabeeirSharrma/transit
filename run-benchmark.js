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

const __dirname = import.meta.dirname;
const RESULTS_DIR = resolve(__dirname, "./results");
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
  const py = transit.python(resolve(__dirname, "./transit/python"));

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
    // Connect to Java via Transit TCP
    jv = transit.java(resolve(javaDir, "./src/main/java"));
  }

  console.log("✓ All Transit services ready\n");

  console.log(transit.info());

  // Run benchmarks
  const results = {
    timestamp: new Date().toISOString(),
    iterations: ITERATIONS,
    warmup: WARMUP,
    benchmarks: {},
  };

  for (const [key, benchmark] of Object.entries(BENCHMARKS)) {
    console.log(`\n━━━ ${benchmark.name} ━━━`);

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

    results.benchmarks[key] = {
      name: benchmark.name,
      fastapi: fastapiResult,
      transit: transitResults,
    };
  }

  // Concurrent benchmarks
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  CONCURRENT BENCHMARKS (${CONCURRENT} parallel requests)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  for (const [key, benchmark] of Object.entries(BENCHMARKS)) {
    console.log(`\n━━━ ${benchmark.name} (concurrent) ━━━`);

    process.stdout.write("  FastAPI (JSON)     ... ");
    const fastapiConc = await runConcurrentBenchmark(benchmark, "fastapi", { fastapi_port: 8000 }, CONCURRENT);
    console.log(`${fastapiConc.mean.toFixed(2)}ms avg, ${fastapiConc.ops_per_sec.toFixed(1)} ops/s`);

    process.stdout.write("  Transit/Rust       ... ");
    const rustConc = await runConcurrentBenchmark(benchmark, "transit", { transitClient: rs }, CONCURRENT);
    console.log(`${rustConc.mean.toFixed(2)}ms avg, ${rustConc.ops_per_sec.toFixed(1)} ops/s`);

    process.stdout.write("  Transit/Python     ... ");
    const pyConc = await runConcurrentBenchmark(benchmark, "transit", { transitClient: py }, CONCURRENT);
    console.log(`${pyConc.mean.toFixed(2)}ms avg, ${pyConc.ops_per_sec.toFixed(1)} ops/s`);

    if (jv) {
      process.stdout.write("  Transit/Java       ... ");
      const javaConc = await runConcurrentBenchmark(benchmark, "transit", { transitClient: jv }, CONCURRENT);
      console.log(`${javaConc.mean.toFixed(2)}ms avg, ${javaConc.ops_per_sec.toFixed(1)} ops/s`);
    }

    results.benchmarks[key].concurrent = {
      fastapi: fastapiConc,
      transit: {
        rust: rustConc,
        python: pyConc,
        java: jv ? await runConcurrentBenchmark(benchmark, "transit", { transitClient: jv }, CONCURRENT) : null,
      },
    };
  }

  // Save results
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const resultsPath = resolve(RESULTS_DIR, `benchmark-${Date.now()}.json`);
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n✓ Results saved to ${resultsPath}`);

  // Cleanup
  fastapiProc.kill();
  javaProc?.kill();

  // Print summary
  printSummary(results);
}

function printSummary(results) {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║                    BENCHMARK SUMMARY                        ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const headers = ["Operation", "FastAPI", "Transit/Rust", "Transit/Python", "Transit/Java"];
  const rows = [];

  for (const [key, data] of Object.entries(results.benchmarks)) {
    const row = [data.name];
    row.push(`${data.fastjson?.mean.toFixed(2)}ms`);
    row.push(`${data.transit?.rust?.mean.toFixed(2)}ms`);
    row.push(`${data.transit?.python?.mean.toFixed(2)}ms`);
    row.push(data.transit?.java ? `${data.transit?.java?.mean.toFixed(2)}ms` : "N/A");
    rows.push(row);
  }

  // Calculate column widths
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => r[i].length))
  );

  // Print table
  const sep = widths.map(w => "─".repeat(w + 2)).join("┼");
  console.log(headers.map((h, i) => h.padEnd(widths[i])).join(" │ "));
  console.log(sep);
  for (const row of rows) {
    console.log(row.map((c, i) => c.padEnd(widths[i])).join(" │ "));
  }

  // Winner summary
  console.log("\n─── Winners (lower is better) ───────────────────────────────────");
  for (const [key, data] of Object.entries(results.benchmarks)) {
    const fastapiTime = data.fastjson?.mean || Infinity;
    const rustTime = data.transit?.rust?.mean || Infinity;
    const pyTime = data.transit?.python?.mean || Infinity;
    const javaTime = data.transit?.java?.mean || Infinity;

    const fastest = Math.min(fastapiTime, rustTime, pyTime, javaTime);
    let winner = "FastAPI";
    if (fastest === rustTime) winner = "Transit/Rust";
    else if (fastest === pyTime) winner = "Transit/Python";
    else if (fastest === javaTime) winner = "Transit/Java";

    const speedup = fastest === fastapiTime
      ? `${(fastapiTime / Math.min(rustTime, pyTime, javaTime)).toFixed(1)}x faster than Transit`
      : `${(fastapiTime / fastest).toFixed(1)}x faster than FastAPI`;

    console.log(`  ${data.name}: ${winner} (${speedup})`);
  }
}

main().catch(console.error);
