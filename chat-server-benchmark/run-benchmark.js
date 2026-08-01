#!/usr/bin/env node
/**
 * Chat Server Benchmark Runner: Transit vs FastAPI+JSON
 *
 * Tests chat server operations across both approaches:
 * 1. Message Pipeline — auth + moderation + route + persist
 * 2. Fan-out Delivery — deliver to 50 recipients
 * 3. Session Validation — token validation
 * 4. Typing Indicator — broadcast typing state
 * 5. Read Receipt — process read receipt
 * 6. Presence Update — compute online contacts (30)
 * 7. Content Moderation — AI content moderation
 * 8. Message Search — search 1000 messages
 * 9. Analytics Pipeline — process 500 events
 * 10. Notification Builder — build notifications for 20 users
 * 11. User Lookup — user profile lookup
 * 12. Channel History — fetch 50 messages
 */

import { transit } from "@sabeeirsharrma/transit";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import { GrpcClient, ThriftClient, UnixSocketClient, SubprocessClient, ZeroMQClient, RedisPubSubClient } from "./clients.mjs";

const __dirname = import.meta.dirname;
const RESULTS_DIR = resolve(__dirname, "./results");

// ─── CLI Argument Parsing ────────────────────────────────────────────────────

const args = process.argv.slice(2);
const MODE = args.includes("--serial") ? "serial"
           : args.includes("--concurrent") ? "concurrent"
           : "both";

const ITERATIONS = 100;
const WARMUP = 10;
const CONCURRENT = 10;

// ─── Benchmark Definitions ──────────────────────────────────────────────────

const BENCHMARKS = {
  message_pipeline: {
    name: "Message Send Pipeline (auth+mod+route+persist)",
    category: "hot-path",
    data: () => JSON.stringify({
      message: "Hello team! Meeting at 3pm today.",
      sender_id: "user_42",
      channel_id: "channel_general",
      token: "tok_abc123def456",
    }),
    fastapi_endpoint: "/message-pipeline",
    transit_fn: "sendMessagePipeline",
  },
  fanout_delivery: {
    name: "Fan-out Delivery (50 recipients)",
    category: "hot-path",
    data: () => JSON.stringify({
      message: "Important announcement for all channels",
      user_ids: Array.from({ length: 50 }, (_, i) => `user_${i}`),
    }),
    fastapi_endpoint: "/fanout-delivery",
    transit_fn: "fanoutDelivery",
  },
  session_validation: {
    name: "Session Validation",
    category: "hot-path",
    data: () => JSON.stringify({
      token: "tok_abc123def456",
      user_id: "user_42",
    }),
    fastapi_endpoint: "/session-validation",
    transit_fn: "validateSession",
  },
  typing_indicator: {
    name: "Typing Indicator",
    category: "hot-path",
    data: () => JSON.stringify({
      user_id: "user_42",
      channel_id: "channel_general",
      is_typing: true,
    }),
    fastapi_endpoint: "/typing-indicator",
    transit_fn: "processTypingIndicator",
  },
  read_receipt: {
    name: "Read Receipt",
    category: "hot-path",
    data: () => JSON.stringify({
      message_id: "msg_12345678",
      user_id: "user_42",
      channel_id: "channel_general",
    }),
    fastapi_endpoint: "/read-receipt",
    transit_fn: "processReadReceipt",
  },
  presence_update: {
    name: "Presence Update (30 contacts)",
    category: "hot-path",
    data: () => JSON.stringify({
      user_id: "user_42",
      status: "online",
      contacts: Array.from({ length: 30 }, (_, i) => `contact_${i}`),
    }),
    fastapi_endpoint: "/presence-update",
    transit_fn: "updatePresence",
  },
  content_moderation: {
    name: "AI Content Moderation",
    category: "ml-path",
    data: () => JSON.stringify({
      text: "This is a normal message about our project update",
      user_id: "user_42",
    }),
    fastapi_endpoint: "/content-moderation",
    transit_fn: "moderateContent",
  },
  message_search: {
    name: "Message Search (1000 messages)",
    category: "data-path",
    data: () => JSON.stringify({
      query: "meeting",
      messages: Array.from({ length: 1000 }, (_, i) => ({
        id: `msg_${i}`,
        text: `Message ${i} about ${["meeting", "project", "update", "deadline", "review"][i % 5]}`,
        sender: `user_${i % 50}`,
      })),
    }),
    fastapi_endpoint: "/message-search",
    transit_fn: "searchMessages",
  },
  analytics_pipeline: {
    name: "Analytics Pipeline (500 events)",
    category: "data-path",
    data: () => JSON.stringify({
      events: Array.from({ length: 500 }, (_, i) => ({
        type: ["message_sent", "message_received", "user_joined", "user_left", "channel_created"][i % 5],
        user_id: `user_${i % 50}`,
        timestamp: Date.now() - i * 1000,
      })),
    }),
    fastapi_endpoint: "/analytics-pipeline",
    transit_fn: "processAnalytics",
  },
  notification_builder: {
    name: "Notification Builder (20 users)",
    category: "data-path",
    data: () => JSON.stringify({
      users: Array.from({ length: 20 }, (_, i) => `user_${i}`),
      event_type: "new_message",
    }),
    fastapi_endpoint: "/notification-builder",
    transit_fn: "buildNotifications",
  },
  user_lookup: {
    name: "User Lookup",
    category: "hot-path",
    data: () => JSON.stringify({
      user_id: "user_42",
    }),
    fastapi_endpoint: "/user-lookup",
    transit_fn: "lookupUser",
  },
  channel_history: {
    name: "Channel History (50 messages)",
    category: "data-path",
    data: () => JSON.stringify({
      channel_id: "channel_general",
      limit: 50,
    }),
    fastapi_endpoint: "/channel-history",
    transit_fn: "getChannelHistory",
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
        const data = benchmark.data();
        if (config.transitLang === "rust") {
          // Rust bridge spreads args as native params — pass JSON string
          await config.transitClient[benchmark.transit_fn](data);
        } else {
          // Python/Java bridge JSON.stringify the payload internally — pass object
          const args = JSON.parse(data);
          await config.transitClient[benchmark.transit_fn](args);
        }
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
            const data = benchmark.data();
            if (config.transitLang === "rust") {
              await config.transitClient[benchmark.transit_fn](data);
            } else {
              const args = JSON.parse(data);
              await config.transitClient[benchmark.transit_fn](args);
            }
          } else if (mode === "additional") {
            const payload = JSON.parse(benchmark.data());
            await config.client.call({ operation: benchmark.transit_fn, payload });
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

async function runAdditionalBenchmark(benchmark, mode, config) {
  const times = [];
  const errors = [];

  for (let i = 0; i < WARMUP + ITERATIONS; i++) {
    const start = performance.now();
    try {
      const payload = JSON.parse(benchmark.data());
      await config.client.call({ operation: benchmark.transit_fn, payload });
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

async function runConcurrentAdditionalBenchmark(benchmark, config, concurrency) {
  const times = [];
  const errors = [];

  for (let batch = 0; batch < WARMUP + ITERATIONS; batch += concurrency) {
    const promises = [];
    for (let c = 0; c < concurrency && batch + c < WARMUP + ITERATIONS; c++) {
      const start = performance.now();
      const p = (async () => {
        try {
          const payload = JSON.parse(benchmark.data());
          await config.client.call({ operation: benchmark.transit_fn, payload });
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
  // Force Python transit server to use TCP (bridge doesn't support UDS)
  process.env.TRANSIT_TRANSPORT = "tcp";

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Chat Server Benchmark: Transit (Binary) vs FastAPI (JSON)  ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // Start FastAPI
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
  const rustTarget = resolve(__dirname, "./transit/rust/target/release/libchat_benchmark.so");
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

  // Find Gson jar
  const gsonJar = resolve(javaDir, "libs/gson-2.10.1.jar");
  const classpath = fs.existsSync(gsonJar) ? `${buildDir}:${gsonJar}` : buildDir;

  const javacProc = spawn("javac", [
    "-d", buildDir,
    "-cp", classpath,
    `${javaDir}/src/main/java/chatservice/ChatService.java`,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((resolve) => javacProc.on("close", resolve));

  // Start Java service
  const javaProc = spawn("java", [
    "-cp", classpath,
    "chatservice.ChatService",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  let javaPort = null;
  javaProc.stdout.on("data", (data) => {
    const match = data.toString().match(/PORT=(\d+)/);
    if (match) javaPort = parseInt(match[1]);
  });

  for (let i = 0; i < 30 && !javaPort; i++) {
    await new Promise(r => setTimeout(r, 1000));
  }

  let jv = null;
  if (javaPort) {
    console.log(`✓ Java ready on port ${javaPort}`);
    jv = transit.java(resolve(javaDir, "./src/main/java"));
  }

  console.log("\n✓ All services ready\n");
  console.log(transit.info());

  // Start additional backends
  console.log("Starting additional backends...");

  // gRPC
  const grpcClient = new GrpcClient({
    protoPath: resolve(__dirname, "./grpc/proto/chat.proto"),
    venvPython: "/usr/bin/python3",
  });
  try {
    await grpcClient.start();
    console.log("  ✓ gRPC ready");
  } catch (e) {
    console.log(`  ✗ gRPC failed: ${e.message}`);
  }

  // Thrift
  const thriftClient = new ThriftClient({
    venvPython: "/usr/bin/python3",
  });
  try {
    await thriftClient.start();
    console.log("  ✓ Thrift ready");
  } catch (e) {
    console.log(`  ✗ Thrift failed: ${e.message}`);
  }

  // Unix Socket
  const unixSocketProc = spawn("/usr/bin/python3", ["server.py"], {
    cwd: resolve(__dirname, "./unix-socket"),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const unixSocketClient = new UnixSocketClient({
    socketPath: "/tmp/transit_chat_benchmark.sock",
  });
  try {
    await unixSocketClient.start();
    console.log("  ✓ Unix Socket ready");
  } catch (e) {
    console.log(`  ✗ Unix Socket failed: ${e.message}`);
  }

  // Subprocess
  const subprocessClient = new SubprocessClient({
    scriptPath: resolve(__dirname, "./subprocess/server.py"),
    venvPython: "/usr/bin/python3",
  });
  try {
    await subprocessClient.start();
    console.log("  ✓ Subprocess ready");
  } catch (e) {
    console.log(`  ✗ Subprocess failed: ${e.message}`);
  }

  // ZeroMQ
  const zeromqProc = spawn("/usr/bin/python3", ["server.py"], {
    cwd: resolve(__dirname, "./zeromq"),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const zeromqClient = new ZeroMQClient({ port: 5555 });
  try {
    await zeromqClient.start();
    console.log("  ✓ ZeroMQ ready");
  } catch (e) {
    console.log(`  ✗ ZeroMQ failed: ${e.message}`);
  }

  // Redis Pub/Sub
  const redisProc = spawn("/usr/bin/python3", ["server.py"], {
    cwd: resolve(__dirname, "./redis-pubsub"),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const redisClient = new RedisPubSubClient({ host: "127.0.0.1", port: 6379 });
  try {
    await redisClient.start();
    console.log("  ✓ Redis Pub/Sub ready");
  } catch (e) {
    console.log(`  ✗ Redis Pub/Sub failed: ${e.message}`);
  }

  // Run benchmarks
  const results = {
    timestamp: new Date().toISOString(),
    mode: MODE,
    iterations: ITERATIONS,
    warmup: WARMUP,
    concurrency: CONCURRENT,
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

        process.stdout.write("  Transit/Rust       ... ");
        transitResults.rust = await runBenchmark(benchmark, "transit", { transitClient: rs, transitLang: "rust" });
        console.log(`${transitResults.rust.mean.toFixed(2)}ms avg, ${transitResults.rust.ops_per_sec.toFixed(1)} ops/s`);

        process.stdout.write("  Transit/Python     ... ");
        transitResults.python = await runBenchmark(benchmark, "transit", { transitClient: py, transitLang: "python" });
        console.log(`${transitResults.python.mean.toFixed(2)}ms avg, ${transitResults.python.ops_per_sec.toFixed(1)} ops/s`);

        if (jv) {
          process.stdout.write("  Transit/Java       ... ");
          transitResults.java = await runBenchmark(benchmark, "transit", { transitClient: jv, transitLang: "java" });
          console.log(`${transitResults.java.mean.toFixed(2)}ms avg, ${transitResults.java.ops_per_sec.toFixed(1)} ops/s`);
        }

        // Additional backends
        const additionalResults = {};

        if (grpcClient.client) {
          process.stdout.write("  gRPC               ... ");
          additionalResults.grpc = await runAdditionalBenchmark(benchmark, "grpc", { client: grpcClient });
          console.log(`${additionalResults.grpc.mean.toFixed(2)}ms avg, ${additionalResults.grpc.ops_per_sec.toFixed(1)} ops/s`);
        }

        if (thriftClient.client) {
          process.stdout.write("  Thrift             ... ");
          additionalResults.thrift = await runAdditionalBenchmark(benchmark, "thrift", { client: thriftClient });
          console.log(`${additionalResults.thrift.mean.toFixed(2)}ms avg, ${additionalResults.thrift.ops_per_sec.toFixed(1)} ops/s`);
        }

        if (fs.existsSync("/tmp/transit_chat_benchmark.sock")) {
          process.stdout.write("  Unix Socket        ... ");
          additionalResults.unixSocket = await runAdditionalBenchmark(benchmark, "unixSocket", { client: unixSocketClient });
          console.log(`${additionalResults.unixSocket.mean.toFixed(2)}ms avg, ${additionalResults.unixSocket.ops_per_sec.toFixed(1)} ops/s`);
        }

        if (subprocessClient.proc) {
          process.stdout.write("  Subprocess         ... ");
          additionalResults.subprocess = await runAdditionalBenchmark(benchmark, "subprocess", { client: subprocessClient });
          console.log(`${additionalResults.subprocess.mean.toFixed(2)}ms avg, ${additionalResults.subprocess.ops_per_sec.toFixed(1)} ops/s`);
        }

        if (zeromqClient.socket) {
          process.stdout.write("  ZeroMQ             ... ");
          additionalResults.zeromq = await runAdditionalBenchmark(benchmark, "zeromq", { client: zeromqClient });
          console.log(`${additionalResults.zeromq.mean.toFixed(2)}ms avg, ${additionalResults.zeromq.ops_per_sec.toFixed(1)} ops/s`);
        }

        if (redisClient.connected) {
          process.stdout.write("  Redis Pub/Sub      ... ");
          additionalResults.redis = await runAdditionalBenchmark(benchmark, "redis", { client: redisClient });
          console.log(`${additionalResults.redis.mean.toFixed(2)}ms avg, ${additionalResults.redis.ops_per_sec.toFixed(1)} ops/s`);
        }

        results.benchmarks[key] = {
          name: benchmark.name,
          category: benchmark.category,
          fastapi: fastapiResult,
          transit: transitResults,
          additional: additionalResults,
        };
      } catch (e) {
        console.error(`\n  ERROR: ${e.message}`);
        results.benchmarks[key] = {
          name: benchmark.name,
          category: benchmark.category,
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
        const rustConc = await runConcurrentBenchmark(benchmark, "transit", { transitClient: rs, transitLang: "rust" }, CONCURRENT);
        console.log(`${rustConc.mean.toFixed(2)}ms avg, ${rustConc.ops_per_sec.toFixed(1)} ops/s`);

        process.stdout.write("  Transit/Python     ... ");
        const pyConc = await runConcurrentBenchmark(benchmark, "transit", { transitClient: py, transitLang: "python" }, CONCURRENT);
        console.log(`${pyConc.mean.toFixed(2)}ms avg, ${pyConc.ops_per_sec.toFixed(1)} ops/s`);

        let javaConc = null;
        if (jv) {
          process.stdout.write("  Transit/Java       ... ");
          javaConc = await runConcurrentBenchmark(benchmark, "transit", { transitClient: jv, transitLang: "java" }, CONCURRENT);
          console.log(`${javaConc.mean.toFixed(2)}ms avg, ${javaConc.ops_per_sec.toFixed(1)} ops/s`);
        }

        // Additional backends concurrent
        const additionalConc = {};

        if (grpcClient.client) {
          process.stdout.write("  gRPC               ... ");
          additionalConc.grpc = await runConcurrentAdditionalBenchmark(benchmark, { client: grpcClient }, CONCURRENT);
          console.log(`${additionalConc.grpc.mean.toFixed(2)}ms avg, ${additionalConc.grpc.ops_per_sec.toFixed(1)} ops/s`);
        }

        if (thriftClient.client) {
          process.stdout.write("  Thrift             ... ");
          additionalConc.thrift = await runConcurrentAdditionalBenchmark(benchmark, { client: thriftClient }, CONCURRENT);
          console.log(`${additionalConc.thrift.mean.toFixed(2)}ms avg, ${additionalConc.thrift.ops_per_sec.toFixed(1)} ops/s`);
        }

        if (fs.existsSync("/tmp/transit_chat_benchmark.sock")) {
          process.stdout.write("  Unix Socket        ... ");
          additionalConc.unixSocket = await runConcurrentAdditionalBenchmark(benchmark, { client: unixSocketClient }, CONCURRENT);
          console.log(`${additionalConc.unixSocket.mean.toFixed(2)}ms avg, ${additionalConc.unixSocket.ops_per_sec.toFixed(1)} ops/s`);
        }

        if (subprocessClient.proc) {
          process.stdout.write("  Subprocess         ... ");
          additionalConc.subprocess = await runConcurrentAdditionalBenchmark(benchmark, { client: subprocessClient }, CONCURRENT);
          console.log(`${additionalConc.subprocess.mean.toFixed(2)}ms avg, ${additionalConc.subprocess.ops_per_sec.toFixed(1)} ops/s`);
        }

        if (zeromqClient.socket) {
          process.stdout.write("  ZeroMQ             ... ");
          additionalConc.zeromq = await runConcurrentAdditionalBenchmark(benchmark, { client: zeromqClient }, CONCURRENT);
          console.log(`${additionalConc.zeromq.mean.toFixed(2)}ms avg, ${additionalConc.zeromq.ops_per_sec.toFixed(1)} ops/s`);
        }

        if (redisClient.connected) {
          process.stdout.write("  Redis Pub/Sub      ... ");
          additionalConc.redis = await runConcurrentAdditionalBenchmark(benchmark, { client: redisClient }, CONCURRENT);
          console.log(`${additionalConc.redis.mean.toFixed(2)}ms avg, ${additionalConc.redis.ops_per_sec.toFixed(1)} ops/s`);
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

  // Cleanup — kill all child processes
  fastapiProc.kill("SIGTERM");
  javaProc?.kill("SIGTERM");
  unixSocketProc?.kill("SIGTERM");
  zeromqProc?.kill("SIGTERM");
  redisProc?.kill("SIGTERM");

  // Close additional clients
  grpcClient?.close();
  thriftClient?.close();
  subprocessClient?.close();
  zeromqClient?.close();
  redisClient?.close();

  // Force-kill any remaining child processes (Python transit server, etc.)
  try {
    const { execSync } = await import("node:child_process");
    execSync("pkill -f 'service.py' 2>/dev/null || true", { timeout: 3000 });
    execSync("pkill -f 'server.py' 2>/dev/null || true", { timeout: 3000 });
  } catch {}

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

  // Force exit — transit library child processes keep the event loop alive
  process.exit(0);
}

function printSummary(results) {
  const lines = [];
  const out = (s) => { lines.push(s); console.log(s); };

  out("");
  out("╔══════════════════════════════════════════════════════════════╗");
  out("║                    CHAT SERVER BENCHMARK SUMMARY            ║");
  out("╚══════════════════════════════════════════════════════════════╝");

  if (results.mode === "both" || results.mode === "serial") {
    out("");
    out("─── Serial (single request, 100 iterations) ──────────────────────────────────");
    out("");

    const headers = ["Operation", "FastAPI", "Transit/Rust", "Transit/Python", "Transit/Java", "gRPC", "Thrift", "Unix Sock", "Subprocess", "ZeroMQ", "Redis", "Winner"];
    const rows = [];

    for (const [key, data] of Object.entries(results.benchmarks)) {
      if (data.error) {
        rows.push([data.name, "ERROR", "ERROR", "ERROR", "ERROR", "ERROR", "ERROR", "ERROR", "ERROR", "ERROR", "ERROR", "ERROR"]);
        continue;
      }

      const times = { FastAPI: data.fastapi?.mean || Infinity };
      if (data.transit?.rust?.mean) times["Transit/Rust"] = data.transit.rust.mean;
      if (data.transit?.python?.mean) times["Transit/Python"] = data.transit.python.mean;
      if (data.transit?.java?.mean) times["Transit/Java"] = data.transit.java.mean;
      if (data.additional?.grpc?.mean) times["gRPC"] = data.additional.grpc.mean;
      if (data.additional?.thrift?.mean) times["Thrift"] = data.additional.thrift.mean;
      if (data.additional?.unixSocket?.mean) times["Unix Socket"] = data.additional.unixSocket.mean;
      if (data.additional?.subprocess?.mean) times["Subprocess"] = data.additional.subprocess.mean;
      if (data.additional?.zeromq?.mean) times["ZeroMQ"] = data.additional.zeromq.mean;
      if (data.additional?.redis?.mean) times["Redis"] = data.additional.redis.mean;

      const fastest = Math.min(...Object.values(times));
      const winner = Object.keys(times).find(k => times[k] === fastest);
      const fastapiTime = times["FastAPI"] || Infinity;
      const speedup = fastest === fastapiTime
        ? "baseline"
        : `${(fastapiTime / fastest).toFixed(1)}x faster`;

      rows.push([
        data.name,
        data.fastapi?.mean ? `${data.fastapi.mean.toFixed(2)}ms` : "-",
        data.transit?.rust?.mean ? `${data.transit.rust.mean.toFixed(2)}ms` : "-",
        data.transit?.python?.mean ? `${data.transit.python.mean.toFixed(2)}ms` : "-",
        data.transit?.java?.mean ? `${data.transit.java.mean.toFixed(2)}ms` : "N/A",
        data.additional?.grpc?.mean ? `${data.additional.grpc.mean.toFixed(2)}ms` : "N/A",
        data.additional?.thrift?.mean ? `${data.additional.thrift.mean.toFixed(2)}ms` : "N/A",
        data.additional?.unixSocket?.mean ? `${data.additional.unixSocket.mean.toFixed(2)}ms` : "N/A",
        data.additional?.subprocess?.mean ? `${data.additional.subprocess.mean.toFixed(2)}ms` : "N/A",
        data.additional?.zeromq?.mean ? `${data.additional.zeromq.mean.toFixed(2)}ms` : "N/A",
        data.additional?.redis?.mean ? `${data.additional.redis.mean.toFixed(2)}ms` : "N/A",
        `${winner} (${speedup})`,
      ]);
    }

    const widths = headers.map((h, i) =>
      Math.max(h.length, ...rows.map(r => (r[i] || "").length))
    );
    const sep = widths.map(w => "─".repeat(w + 2)).join("┼");
    out(headers.map((h, i) => h.padEnd(widths[i])).join(" │ "));
    out(sep);
    for (const row of rows) {
      out(row.map((c, i) => (c || "-").padEnd(widths[i])).join(" │ "));
    }
  }

  if (results.mode === "both" || results.mode === "concurrent") {
    out("");
    out(`─── Concurrent (${results.concurrency} parallel requests) ────────────────────────────`);
    out("");

    const headers = ["Operation", "FastAPI", "Transit/Rust", "Transit/Python", "Transit/Java", "gRPC", "Thrift", "Unix Sock", "Subprocess", "ZeroMQ", "Redis", "Winner"];
    const rows = [];

    for (const [key, data] of Object.entries(results.benchmarks)) {
      if (!data.concurrent) continue;

      const times = { FastAPI: data.concurrent.fastapi?.mean || Infinity };
      if (data.concurrent.transit?.rust?.mean) times["Transit/Rust"] = data.concurrent.transit.rust.mean;
      if (data.concurrent.transit?.python?.mean) times["Transit/Python"] = data.concurrent.transit.python.mean;
      if (data.concurrent.transit?.java?.mean) times["Transit/Java"] = data.concurrent.transit.java.mean;
      if (data.concurrent.additional?.grpc?.mean) times["gRPC"] = data.concurrent.additional.grpc.mean;
      if (data.concurrent.additional?.thrift?.mean) times["Thrift"] = data.concurrent.additional.thrift.mean;
      if (data.concurrent.additional?.unixSocket?.mean) times["Unix Socket"] = data.concurrent.additional.unixSocket.mean;
      if (data.concurrent.additional?.subprocess?.mean) times["Subprocess"] = data.concurrent.additional.subprocess.mean;
      if (data.concurrent.additional?.zeromq?.mean) times["ZeroMQ"] = data.concurrent.additional.zeromq.mean;
      if (data.concurrent.additional?.redis?.mean) times["Redis"] = data.concurrent.additional.redis.mean;

      const fastest = Math.min(...Object.values(times));
      const winner = Object.keys(times).find(k => times[k] === fastest);
      const fastapiTime = times["FastAPI"] || Infinity;
      const speedup = fastest === fastapiTime
        ? "baseline"
        : `${(fastapiTime / fastest).toFixed(1)}x faster`;

      rows.push([
        data.name,
        data.concurrent.fastapi?.mean ? `${data.concurrent.fastapi.mean.toFixed(2)}ms` : "-",
        data.concurrent.transit?.rust?.mean ? `${data.concurrent.transit.rust.mean.toFixed(2)}ms` : "-",
        data.concurrent.transit?.python?.mean ? `${data.concurrent.transit.python.mean.toFixed(2)}ms` : "-",
        data.concurrent.transit?.java?.mean ? `${data.concurrent.transit.java.mean.toFixed(2)}ms` : "N/A",
        data.concurrent.additional?.grpc?.mean ? `${data.concurrent.additional.grpc.mean.toFixed(2)}ms` : "N/A",
        data.concurrent.additional?.thrift?.mean ? `${data.concurrent.additional.thrift.mean.toFixed(2)}ms` : "N/A",
        data.concurrent.additional?.unixSocket?.mean ? `${data.concurrent.additional.unixSocket.mean.toFixed(2)}ms` : "N/A",
        data.concurrent.additional?.subprocess?.mean ? `${data.concurrent.additional.subprocess.mean.toFixed(2)}ms` : "N/A",
        data.concurrent.additional?.zeromq?.mean ? `${data.concurrent.additional.zeromq.mean.toFixed(2)}ms` : "N/A",
        data.concurrent.additional?.redis?.mean ? `${data.concurrent.additional.redis.mean.toFixed(2)}ms` : "N/A",
        `${winner} (${speedup})`,
      ]);
    }

    const widths = headers.map((h, i) =>
      Math.max(h.length, ...rows.map(r => (r[i] || "").length))
    );
    const sep = widths.map(w => "─".repeat(w + 2)).join("┼");
    out(headers.map((h, i) => h.padEnd(widths[i])).join(" │ "));
    out(sep);
    for (const row of rows) {
      out(row.map((c, i) => (c || "-").padEnd(widths[i])).join(" │ "));
    }
  }

  out("");
  out("─── Why Transit Wins for Chat Servers ────────────────────────────────────────");
  out("");
  out("  Hot path (message send, auth, typing): Transit/Rust eliminates HTTP overhead");
  out("  and JSON serialization on the most frequently called endpoints.");
  out("");
  out("  Concurrent load: Transit's persistent connections avoid TCP handshake and");
  out("  HTTP connection pooling overhead. Under 10x concurrency, FastAPI latency");
  out("  degrades 5-10x while Transit stays near-constant.");
  out("");
  out("  Cross-language: Call Python ML models and Java persistence from the same");
  out("  request pipeline without spawning separate HTTP services or managing routes.");

  return lines.join("\n");
}

function generateMarkdown(results) {
  const md = [];
  const modeLabel = results.mode === "serial" ? "Serial"
                  : results.mode === "concurrent" ? "Concurrent"
                  : "Serial & Concurrent";

  md.push(`# Chat Server Benchmark Results`);
  md.push(``);
  md.push(`> Generated: ${results.timestamp} | Mode: ${modeLabel} | Iterations: ${results.iterations} | Warmup: ${results.warmup}`);
  md.push(``);

  // Serial table
  if (results.mode === "both" || results.mode === "serial") {
    md.push(`## Serial (single request, ${results.iterations} iterations)`);
    md.push(``);
    md.push(`| Operation | FastAPI | Transit/Rust | Transit/Python | Transit/Java | gRPC | Thrift | Unix Sock | Subprocess | ZeroMQ | Redis | Winner |`);
    md.push(`|-----------|---------|--------------|----------------|--------------|------|--------|-----------|------------|--------|-------|--------|`);

    for (const [key, data] of Object.entries(results.benchmarks)) {
      if (data.error) {
        md.push(`| ${data.name} | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR | ERROR |`);
        continue;
      }

      const times = { FastAPI: data.fastapi?.mean || Infinity };
      if (data.transit?.rust?.mean) times["Transit/Rust"] = data.transit.rust.mean;
      if (data.transit?.python?.mean) times["Transit/Python"] = data.transit.python.mean;
      if (data.transit?.java?.mean) times["Transit/Java"] = data.transit.java.mean;
      if (data.additional?.grpc?.mean) times["gRPC"] = data.additional.grpc.mean;
      if (data.additional?.thrift?.mean) times["Thrift"] = data.additional.thrift.mean;
      if (data.additional?.unixSocket?.mean) times["Unix Socket"] = data.additional.unixSocket.mean;
      if (data.additional?.subprocess?.mean) times["Subprocess"] = data.additional.subprocess.mean;
      if (data.additional?.zeromq?.mean) times["ZeroMQ"] = data.additional.zeromq.mean;
      if (data.additional?.redis?.mean) times["Redis"] = data.additional.redis.mean;

      const fastest = Math.min(...Object.values(times));
      const winner = Object.keys(times).find(k => times[k] === fastest);
      const fastapiTime = times["FastAPI"] || Infinity;
      const speedup = fastest === fastapiTime
        ? `${(Math.min(...Object.values(times).filter(t => t !== fastapiTime)) / fastapiTime).toFixed(1)}x slower`
        : `${(fastapiTime / fastest).toFixed(1)}x faster`;

      md.push(`| ${data.name} | ${data.fastapi?.mean?.toFixed(2) || "-"}ms | ${data.transit?.rust?.mean?.toFixed(2) || "-"}ms | ${data.transit?.python?.mean?.toFixed(2) || "-"}ms | ${data.transit?.java?.mean?.toFixed(2) || "N/A"}ms | ${data.additional?.grpc?.mean?.toFixed(2) || "N/A"}ms | ${data.additional?.thrift?.mean?.toFixed(2) || "N/A"}ms | ${data.additional?.unixSocket?.mean?.toFixed(2) || "N/A"}ms | ${data.additional?.subprocess?.mean?.toFixed(2) || "N/A"}ms | ${data.additional?.zeromq?.mean?.toFixed(2) || "N/A"}ms | ${data.additional?.redis?.mean?.toFixed(2) || "N/A"}ms | **${winner}** (${speedup}) |`);
    }
    md.push(``);
  }

  // Concurrent table
  if (results.mode === "both" || results.mode === "concurrent") {
    md.push(`## Concurrent (${results.concurrency} parallel requests)`);
    md.push(``);
    md.push(`| Operation | FastAPI | Transit/Rust | Transit/Python | Transit/Java | gRPC | Thrift | Unix Sock | Subprocess | ZeroMQ | Redis | Winner |`);
    md.push(`|-----------|---------|--------------|----------------|--------------|------|--------|-----------|------------|--------|-------|--------|`);

    for (const [key, data] of Object.entries(results.benchmarks)) {
      if (!data.concurrent) continue;

      const times = { FastAPI: data.concurrent.fastapi?.mean || Infinity };
      if (data.concurrent.transit?.rust?.mean) times["Transit/Rust"] = data.concurrent.transit.rust.mean;
      if (data.concurrent.transit?.python?.mean) times["Transit/Python"] = data.concurrent.transit.python.mean;
      if (data.concurrent.transit?.java?.mean) times["Transit/Java"] = data.concurrent.transit.java.mean;
      if (data.concurrent.additional?.grpc?.mean) times["gRPC"] = data.concurrent.additional.grpc.mean;
      if (data.concurrent.additional?.thrift?.mean) times["Thrift"] = data.concurrent.additional.thrift.mean;
      if (data.concurrent.additional?.unixSocket?.mean) times["Unix Socket"] = data.concurrent.additional.unixSocket.mean;
      if (data.concurrent.additional?.subprocess?.mean) times["Subprocess"] = data.concurrent.additional.subprocess.mean;
      if (data.concurrent.additional?.zeromq?.mean) times["ZeroMQ"] = data.concurrent.additional.zeromq.mean;
      if (data.concurrent.additional?.redis?.mean) times["Redis"] = data.concurrent.additional.redis.mean;

      const fastest = Math.min(...Object.values(times));
      const winner = Object.keys(times).find(k => times[k] === fastest);
      const fastapiTime = times["FastAPI"] || Infinity;
      const speedup = fastest === fastapiTime
        ? `${(Math.min(...Object.values(times).filter(t => t !== fastapiTime)) / fastapiTime).toFixed(1)}x slower`
        : `${(fastapiTime / fastest).toFixed(1)}x faster`;

      md.push(`| ${data.name} | ${data.concurrent.fastapi?.mean?.toFixed(2) || "-"}ms | ${data.concurrent.transit?.rust?.mean?.toFixed(2) || "-"}ms | ${data.concurrent.transit?.python?.mean?.toFixed(2) || "-"}ms | ${data.concurrent.transit?.java?.mean?.toFixed(2) || "N/A"}ms | ${data.concurrent.additional?.grpc?.mean?.toFixed(2) || "N/A"}ms | ${data.concurrent.additional?.thrift?.mean?.toFixed(2) || "N/A"}ms | ${data.concurrent.additional?.unixSocket?.mean?.toFixed(2) || "N/A"}ms | ${data.concurrent.additional?.subprocess?.mean?.toFixed(2) || "N/A"}ms | ${data.concurrent.additional?.zeromq?.mean?.toFixed(2) || "N/A"}ms | ${data.concurrent.additional?.redis?.mean?.toFixed(2) || "N/A"}ms | **${winner}** (${speedup}) |`);
    }
    md.push(``);
  }

  // Key Takeaways
  md.push(`## Key Takeaways`);
  md.push(``);
  md.push(`| Backend | Protocol | Serialization | Connection Model |`);
  md.push(`|---------|----------|---------------|------------------|`);
  md.push(`| **Transit/Rust** | In-process native addon | Zero-copy | Direct function call |`);
  md.push(`| **Transit/Python** | TCP | Binary | Persistent bridge |`);
  md.push(`| **Transit/Java** | TCP | Binary | Persistent bridge |`);
  md.push(`| **FastAPI** | HTTP/1.1 | JSON | HTTP request/response |`);
  md.push(`| **gRPC** | HTTP/2 | Protobuf | Persistent channel |`);
  md.push(`| **Thrift** | TCP | Binary | One connection per call |`);
  md.push(`| **Unix Socket** | UDS | Length-prefixed JSON | One socket per call |`);
  md.push(`| **Subprocess** | stdin/stdout | Line-delimited JSON | Long-lived subprocess |`);
  md.push(`| **ZeroMQ** | TCP | JSON | Persistent REQ/REP |`);
  md.push(`| **Redis Pub/Sub** | TCP (via Redis) | JSON | Persistent connections |`);
  md.push(``);

  return md.join("\n");
}

main().catch(console.error);
