/**
 * Scanner function discovery tests
 *
 * Tests that the tree-sitter scanner correctly discovers functions
 * in Rust, Python, Java, and JavaScript/TypeScript files.
 *
 * Runs as plain JS to avoid CJS/ESM issues with the native addon.
 */

const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

// ─── Scanner module loading ──────────────────────────────────────────────────

let scanner;

try {
  scanner = require("./index.js");
} catch {
  scanner = null;
}

const describeIfScanner = scanner ? describe : describe.skip;

// ─── Fixture directory ───────────────────────────────────────────────────────

const FIXTURES_DIR = path.join(__dirname, "src", "fixtures");

// ─── Tests ───────────────────────────────────────────────────────────────────

describeIfScanner("Scanner: Rust function discovery", () => {
  let entries = [];

  before(() => {
    const json = scanner.scanDirectory(path.join(FIXTURES_DIR, "rust"));
    const raw = JSON.parse(json);
    entries = raw.entries;
  });

  it("discovers public functions with #[napi]", () => {
    const names = entries.map((e) => e.function_name);
    assert.ok(names.includes("greet"), `Expected "greet" in [${names}]`);
    assert.ok(names.includes("process_async"), `Expected "process_async" in [${names}]`);
  });

  it("does not discover private functions", () => {
    const names = entries.map((e) => e.function_name);
    assert.ok(!names.includes("_helper"), `Should not find "_helper" in [${names}]`);
  });

  it("discovers pub fn without #[napi]", () => {
    const names = entries.map((e) => e.function_name);
    assert.ok(names.includes("no_napi"), `Expected "no_napi" in [${names}]`);
  });

  it("marks all as tier 1 (natively public)", () => {
    for (const entry of entries) {
      if (entry.function_name !== "no_napi") {
        assert.equal(entry.export_tier, 1, `${entry.function_name} should be tier 1`);
      }
    }
  });

  it("sets language to rust", () => {
    for (const entry of entries) {
      assert.equal(entry.language, "rust");
    }
  });
});

describeIfScanner("Scanner: Python function discovery", () => {
  let entries = [];

  before(() => {
    const json = scanner.scanDirectory(path.join(FIXTURES_DIR, "python"));
    const raw = JSON.parse(json);
    entries = raw.entries;
  });

  it("discovers top-level functions", () => {
    const names = entries.map((e) => e.function_name);
    assert.ok(names.includes("get_version"), `Expected "get_version" in [${names}]`);
  });

  it("discovers transit:function marked functions", () => {
    const names = entries.map((e) => e.function_name);
    assert.ok(names.includes("process_data"), `Expected "process_data" in [${names}]`);
  });

  it("does not discover underscore-prefixed functions", () => {
    const names = entries.map((e) => e.function_name);
    assert.ok(!names.includes("_private_helper"), `Should not find "_private_helper" in [${names}]`);
  });

  it("marks transit:function as tier 3", () => {
    const processEntry = entries.find((e) => e.function_name === "process_data");
    assert.equal(processEntry?.export_tier, 3, "process_data should be tier 3");
  });

  it("marks transit:file functions as tier 2", () => {
    const analyzeEntry = entries.find((e) => e.function_name === "analyze_text");
    assert.equal(analyzeEntry?.export_tier, 2, "analyze_text should be tier 2");
    const transformEntry = entries.find((e) => e.function_name === "transform_data");
    assert.equal(transformEntry?.export_tier, 2, "transform_data should be tier 2");
  });

  it("sets language to python", () => {
    for (const entry of entries) {
      assert.equal(entry.language, "python");
    }
  });
});

describeIfScanner("Scanner: Java function discovery", () => {
  let entries = [];

  before(() => {
    const json = scanner.scanDirectory(path.join(FIXTURES_DIR, "java"));
    const raw = JSON.parse(json);
    entries = raw.entries;
  });

  it("discovers public methods", () => {
    const names = entries.map((e) => e.function_name);
    assert.ok(names.includes("processJob"), `Expected "processJob" in [${names}]`);
    assert.ok(names.includes("getVersion"), `Expected "getVersion" in [${names}]`);
  });

  it("discovers static public methods", () => {
    const names = entries.map((e) => e.function_name);
    assert.ok(names.includes("staticMethod"), `Expected "staticMethod" in [${names}]`);
  });

  it("does not discover private methods", () => {
    const names = entries.map((e) => e.function_name);
    assert.ok(!names.includes("internalHelper"), `Should not find "internalHelper" in [${names}]`);
  });

  it("marks all as tier 1", () => {
    for (const entry of entries) {
      assert.equal(entry.export_tier, 1, `${entry.function_name} should be tier 1`);
    }
  });

  it("sets language to java", () => {
    for (const entry of entries) {
      assert.equal(entry.language, "java");
    }
  });
});

describeIfScanner("Scanner: JavaScript/TypeScript function discovery", () => {
  let entries = [];

  before(() => {
    const json = scanner.scanDirectory(path.join(FIXTURES_DIR, "js"));
    const raw = JSON.parse(json);
    entries = raw.entries;
  });

  it("discovers exported functions", () => {
    const names = entries.map((e) => e.function_name);
    assert.ok(names.includes("helper"), `Expected "helper" in [${names}]`);
  });

  it("discovers transit:function marked exported functions", () => {
    const names = entries.map((e) => e.function_name);
    assert.ok(names.includes("processFile"), `Expected "processFile" in [${names}]`);
  });

  it("does not discover non-exported functions", () => {
    const names = entries.map((e) => e.function_name);
    assert.ok(!names.includes("internal"), `Should not find "internal" in [${names}]`);
  });

  it("marks transit:function as tier 3", () => {
    const processEntry = entries.find((e) => e.function_name === "processFile");
    assert.equal(processEntry?.export_tier, 3, "processFile should be tier 3");
  });

  it("marks plain exports as tier 1", () => {
    const helperEntry = entries.find((e) => e.function_name === "helper");
    assert.equal(helperEntry?.export_tier, 1, "helper should be tier 1");
  });
});

// ─── Cache tests ─────────────────────────────────────────────────────────────

describeIfScanner("Scanner: Caching", () => {
  it("scanDirectory produces consistent results", () => {
    const CACHE_DIR = path.join(FIXTURES_DIR, ".test-cache");
    fs.mkdirSync(CACHE_DIR, { recursive: true });

    const json1 = scanner.scanDirectory(CACHE_DIR);
    const json2 = scanner.scanDirectory(CACHE_DIR);
    const result1 = JSON.parse(json1);
    const result2 = JSON.parse(json2);
    assert.deepEqual(result1.entries, result2.entries);

    fs.rmSync(CACHE_DIR, { recursive: true, force: true });
  });

  it("scanFilePath returns empty array for non-existent file", () => {
    const json = scanner.scanFilePath("/nonexistent/file.rs");
    const entries = JSON.parse(json);
    assert.deepEqual(entries, []);
  });
});
