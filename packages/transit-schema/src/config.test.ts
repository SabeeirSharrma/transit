/**
 * Config validation tests
 *
 * Tests for transit.config.json loading, validation, and defaults.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  validateConfig,
  mergeWithDefaults,
  loadConfig,
  loadConfigWithDefaults,
  loadConfigRaw,
} from "./config.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createTempDir(): string {
  const dir = join(tmpdir(), `transit-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeConfig(dir: string, config: Record<string, unknown>): void {
  writeFileSync(join(dir, "transit.config.json"), JSON.stringify(config, null, 2));
}

// ─── validateConfig ──────────────────────────────────────────────────────────

describe("validateConfig", () => {
  it("accepts empty config", () => {
    const result = validateConfig({});
    assert.deepEqual(result, {});
  });

  it("accepts valid build overrides", () => {
    const result = validateConfig({
      build: {
        rust: { command: "cargo build --release", features: ["simd"] },
        python: { interpreter: ".venv/bin/python3", env: { PYTHONDONTWRITEBYTECODE: "1" } },
        java: { jvmArgs: ["-Xmx2g", "-XX:+UseZGC"] },
      },
    });
    assert.equal(result.build?.rust?.command, "cargo build --release");
    assert.deepEqual(result.build?.rust?.features, ["simd"]);
    assert.equal(result.build?.python?.interpreter, ".venv/bin/python3");
    assert.deepEqual(result.build?.python?.env, { PYTHONDONTWRITEBYTECODE: "1" });
    assert.deepEqual(result.build?.java?.jvmArgs, ["-Xmx2g", "-XX:+UseZGC"]);
  });

  it("accepts valid link overrides", () => {
    const result = validateConfig({
      links: {
        "js-rust": { transport: "native" },
        "js-java": { transport: "socket", socketPath: "/tmp/transit-java.sock" },
      },
    });
    assert.equal(result.links?.["js-rust"]?.transport, "native");
    assert.equal(result.links?.["js-java"]?.transport, "socket");
    assert.equal(result.links?.["js-java"]?.socketPath, "/tmp/transit-java.sock");
  });

  it("accepts valid export overrides", () => {
    const result = validateConfig({
      exports: [
        { file: "legacy/parser.rs", function: "parse_legacy_format" },
        { file: "utils.py", function: "helper" },
      ],
    });
    assert.equal(result.exports?.length, 2);
    assert.equal(result.exports?.[0]?.file, "legacy/parser.rs");
    assert.equal(result.exports?.[0]?.function, "parse_legacy_format");
  });

  it("accepts maxRestarts", () => {
    const result = validateConfig({ maxRestarts: 5 });
    assert.equal(result.maxRestarts, 5);
  });

  it("accepts maxRestarts of 0", () => {
    const result = validateConfig({ maxRestarts: 0 });
    assert.equal(result.maxRestarts, 0);
  });

  // ─── Rejection cases ─────────────────────────────────────────────────────

  it("rejects unknown top-level keys", () => {
    assert.throws(
      () => validateConfig({ unknown: true }),
      /unknown key "unknown"/
    );
  });

  it("rejects invalid build override type", () => {
    assert.throws(
      () => validateConfig({ build: "not-an-object" }),
      /build: expected an object/
    );
  });

  it("rejects invalid transport", () => {
    assert.throws(
      () => validateConfig({ links: { "js-rust": { transport: "http" } } }),
      /transport: expected "native" \| "socket" \| "jni"/
    );
  });

  it("rejects non-array exports", () => {
    assert.throws(
      () => validateConfig({ exports: "not-an-array" }),
      /exports: expected an array/
    );
  });

  it("rejects export without file", () => {
    assert.throws(
      () => validateConfig({ exports: [{ function: "foo" }] }),
      /exports\[0\].file: expected a string/
    );
  });

  it("rejects export without function", () => {
    assert.throws(
      () => validateConfig({ exports: [{ file: "foo.rs" }] }),
      /exports\[0\].function: expected a string/
    );
  });

  it("rejects negative maxRestarts", () => {
    assert.throws(
      () => validateConfig({ maxRestarts: -1 }),
      /maxRestarts: expected a non-negative number/
    );
  });

  it("rejects non-number maxRestarts", () => {
    assert.throws(
      () => validateConfig({ maxRestarts: "five" }),
      /maxRestarts: expected a non-negative number/
    );
  });

  it("rejects non-string build command", () => {
    assert.throws(
      () => validateConfig({ build: { rust: { command: 123 } } }),
      /build.rust.command: expected a string/
    );
  });

  it("rejects non-array build features", () => {
    assert.throws(
      () => validateConfig({ build: { rust: { features: "simd" } } }),
      /build.rust.features: expected an array/
    );
  });

  it("rejects non-string feature in array", () => {
    assert.throws(
      () => validateConfig({ build: { rust: { features: [123] } } }),
      /build.rust.features: each feature must be a string/
    );
  });

  it("rejects non-boolean fastJson", () => {
    assert.throws(
      () => validateConfig({ build: { python: { fastJson: "yes" } } }),
      /build.python.fastJson: expected a boolean/
    );
  });
});

// ─── mergeWithDefaults ───────────────────────────────────────────────────────

describe("mergeWithDefaults", () => {
  it("fills defaults for empty config", () => {
    const result = mergeWithDefaults({});
    assert.equal(result.build.rust.command, "cargo build --release");
    assert.equal(result.build.python.interpreter, "python3");
    assert.equal(result.build.java.jvmArgs?.[0], "-Xmx512m");
    assert.deepEqual(result.exports, []);
    assert.equal(result.maxRestarts, 3);
  });

  it("user config overrides defaults", () => {
    const result = mergeWithDefaults({
      build: { rust: { command: "cargo build --release --target aarch64" } },
      maxRestarts: 10,
    });
    assert.equal(result.build.rust.command, "cargo build --release --target aarch64");
    assert.equal(result.maxRestarts, 10);
    // Other defaults still present
    assert.equal(result.build.python.interpreter, "python3");
  });

  it("preserves user exports", () => {
    const result = mergeWithDefaults({
      exports: [{ file: "foo.rs", function: "bar" }],
    });
    assert.equal(result.exports.length, 1);
    assert.equal(result.exports[0].function, "bar");
  });
});

// ─── loadConfig / loadConfigWithDefaults ─────────────────────────────────────

describe("loadConfig", () => {
  let tempDir: string;

  it("returns null when no config file exists", () => {
    tempDir = createTempDir();
    try {
      const result = loadConfig(tempDir);
      assert.equal(result, null);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("loads and validates a config file", () => {
    tempDir = createTempDir();
    try {
      writeConfig(tempDir, { maxRestarts: 7 });
      const result = loadConfig(tempDir);
      assert.notEqual(result, null);
      assert.equal(result?.maxRestarts, 7);
      assert.equal(result?.build.rust.command, "cargo build --release");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("throws on invalid config file", () => {
    tempDir = createTempDir();
    try {
      writeConfig(tempDir, { invalidKey: true });
      assert.throws(() => loadConfig(tempDir), /unknown key "invalidKey"/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("loadConfigWithDefaults", () => {
  it("returns defaults when no config file exists", () => {
    const tempDir = createTempDir();
    try {
      const result = loadConfigWithDefaults(tempDir);
      assert.equal(result.build.rust.command, "cargo build --release");
      assert.equal(result.maxRestarts, 3);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

// ─── loadConfigRaw ───────────────────────────────────────────────────────────

describe("loadConfigRaw", () => {
  it("returns null when no config file exists", () => {
    const tempDir = createTempDir();
    try {
      const result = loadConfigRaw(tempDir);
      assert.equal(result, null);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("returns parsed JSON when config exists", () => {
    const tempDir = createTempDir();
    try {
      writeConfig(tempDir, { maxRestarts: 5 });
      const result = loadConfigRaw(tempDir);
      assert.notEqual(result, null);
      assert.equal(result?.maxRestarts, 5);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("throws on invalid JSON", () => {
    const tempDir = createTempDir();
    try {
      writeFileSync(join(tempDir, "transit.config.json"), "{ invalid json }");
      assert.throws(() => loadConfigRaw(tempDir), /not valid JSON/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
