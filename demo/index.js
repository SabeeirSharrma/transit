/**
 * Transit Showcase — JS → Rust → Python → Java
 *
 * Demonstrates calling functions across three languages from JavaScript,
 * chaining results from one language into the next, all with a clean
 * async/await API that feels like calling local functions.
 *
 * Usage:  node index.js
 */

import { transit } from "@sabeeirsharrma/transit";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Register language bridges ────────────────────────────────────────────────

const rs = transit.rust(resolve(__dirname, "./rust"));
const py = transit.python(resolve(__dirname, "./python"));
const jv = transit.java(resolve(__dirname, "./java/src/main/java"), {
  classpath: resolve(__dirname, "./java/build"),
  mainClass: "com.demo.App",
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function divider(title) {
  console.log(`\n${"─".repeat(55)}`);
  console.log(`  ${title}`);
  console.log(`${"─".repeat(55)}`);
}

function hr() {
  console.log(`${"─".repeat(55)}`);
}

/** Parse result from Java/Python — they return JSON strings, not objects. */
function parseResult(raw) {
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

// ── Demo 1: Simple calls per language ────────────────────────────────────────

async function demoSimpleCalls() {
  divider("DEMO 1 — Simple cross-language calls");

  // Rust: greet and compute fibonacci
  const greeting = await rs.greet("Transit");
  console.log(`  🦀  rs.greet("Transit")       → ${greeting}`);

  const fib10 = await rs.fibonacci(10);
  console.log(`  🦀  rs.fibonacci(10)          → ${fib10}`);

  const fib20 = await rs.fibonacci(20);
  console.log(`  🦀  rs.fibonacci(20)          → ${fib20}`);

  // Python: analyze some text
  const analysis = await py.analyzeText({
    text: "Transit lets languages talk to each other without APIs or glue code",
  });
  console.log(`  🐍  py.analyzeText(...)        → ${JSON.stringify(analysis)}`);

  // Java: generate an ID
  const idResult = await jv.generateId({ prefix: "demo" });
  console.log(`  ☕  jv.generateId({prefix})   → ${JSON.stringify(idResult)}`);
}

// ── Demo 2: Compute-heavy Rust (matrix multiply) ────────────────────────────

async function demoRustCompute() {
  divider("DEMO 2 — Rust matrix multiply (100×100)");

  const size = 100;
  const a = Array.from({ length: size * size }, () => Math.random());
  const b = Array.from({ length: size * size }, () => Math.random());

  const t0 = performance.now();
  const result = await rs.matrixMultiply(a, b, size);
  const elapsed = (performance.now() - t0).toFixed(2);

  console.log(`  🦀  Matrix multiply ${size}×${size}`);
  console.log(`      Result length: ${result.length} (expected ${size * size})`);
  console.log(`      Time: ${elapsed}ms`);
}

// ── Demo 3: Python data pipeline ─────────────────────────────────────────────

async function demoPythonPipeline() {
  divider("DEMO 3 — Python data transformation pipeline");

  const rawNumbers = [14, 2, 88, 37, 5, 61, 93, 11, 42, 76];
  console.log(`  📊  Input: [${rawNumbers.join(", ")}]`);

  const transformed = parseResult(await py.transformData({ numbers: rawNumbers }));
  console.log(`  🐍  Normalized:  [${transformed.normalized.join(", ")}]`);
  console.log(`  🐍  Mean:        ${transformed.stats.mean}`);
  console.log(`  🐍  Std Dev:     ${transformed.stats.std_dev}`);
  console.log(`  🐍  Range:       ${transformed.stats.min} → ${transformed.stats.max}`);
}

// ── Demo 4: Java batch processing ────────────────────────────────────────────

async function demoJavaBatch() {
  divider("DEMO 4 — Java batch processing (10 records)");

  const records = Array.from({ length: 10 }, (_, i) => ({
    id: `rec-${String(i + 1).padStart(3, "0")}`,
    value: Math.round(Math.random() * 1000) / 10,
  }));

  console.log(`  📦  Processing ${records.length} records...`);

  const results = await Promise.all(
    records.map((r) => jv.processRecord(r).then(parseResult))
  );

  console.log(`  ☕  Processed ${results.length} records`);
  for (const r of results) {
    console.log(`      ${r.id}: ${r.original_value} → ${r.processed_value} [${r.status}]`);
  }

  // Compute stats from the processed values
  const values = results.map((r) => r.processed_value);
  const stats = parseResult(await jv.computeStats({ values }));
  console.log(`  ☕  Batch stats: mean=${stats.mean}, min=${stats.min}, max=${stats.max}`);
}

// ── Demo 5: Cross-language chain (Rust → Python → Java) ─────────────────────

async function demoCrossLanguageChain() {
  divider("DEMO 5 — Cross-language chain: Rust → Python → Java → JS");

  // Step 1: Rust computes primes
  const t0 = performance.now();
  const primeCount = await rs.countPrimes(1_000_000);
  const rustTime = (performance.now() - t0).toFixed(2);
  console.log(`  🦀  Step 1: rs.countPrimes(1_000_000) → ${primeCount.toLocaleString()} primes (${rustTime}ms)`);

  // Step 2: Python transforms the result into a report-ready structure
  const reportData = parseResult(await py.transformData({
    numbers: [primeCount, parseFloat(rustTime), primeCount / 1000],
  }));
  console.log(`  🐍  Step 2: py.transformData(...) → mean=${reportData.stats.mean}`);

  // Step 3: Java processes and enriches each stat
  const enriched = parseResult(await jv.processRecord({
    id: "chain-demo",
    value: reportData.stats.mean,
  }));
  console.log(`  ☕  Step 3: jv.processRecord(...) → processed_value=${enriched.processed_value}`);

  // Step 4: Python formats the final report
  const report = parseResult(await py.formatReport({
    title: "Cross-Language Pipeline Result",
    sections: [
      { heading: "Rust Compute", body: `Found ${primeCount.toLocaleString()} primes in ${rustTime}ms` },
      { heading: "Python Transform", body: `Normalized value: ${reportData.normalized[0]}` },
      { heading: "Java Enrichment", body: `Final processed value: ${enriched.processed_value}` },
    ],
  }));
  console.log(`\n${report.report}`);
}

// ── Show discovered functions ────────────────────────────────────────────────

function demoInfo() {
  divider("DISCOVERED FUNCTIONS");
  transit.info();
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🚀  Transit Showcase — Languages that just talk to each other\n");
  console.log("   This demo calls Rust, Python, and JavaScript from a single");
  console.log("   Node.js process. No APIs, no JSON schemas, no glue code.\n");

  try {
    await demoSimpleCalls();
    await demoRustCompute();
    await demoPythonPipeline();
    await demoJavaBatch();
    await demoCrossLanguageChain();
    demoInfo();

    hr();
    console.log("\n✅  All demos completed successfully!\n");
  } catch (err) {
    console.error("\n❌  Error:", err instanceof Error ? err.message : String(err));
    console.error(err.stack);
    process.exit(1);
  }
}

main();
