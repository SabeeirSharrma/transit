/**
 * Bridge arg unwrapping and name conversion tests
 *
 * Tests for the Proxy-based language handles, arg normalization,
 * and snake_case/camelCase conversion logic.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ─── Name conversion tests ───────────────────────────────────────────────────

describe("Name conversion: snake_case ↔ camelCase", () => {
  // These mirror the conversion logic in createLanguageHandle and the bridges

  function toCamelCase(name: string): string {
    return name.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
  }

  function toSnakeCase(name: string): string {
    return name.replace(/([A-Z])/g, (_: string, c: string) => "_" + c.toLowerCase());
  }

  it("converts snake_case to camelCase", () => {
    assert.equal(toCamelCase("process_data"), "processData");
    assert.equal(toCamelCase("get_version"), "getVersion");
    assert.equal(toCamelCase("a_simple_function"), "aSimpleFunction");
    assert.equal(toCamelCase("already"), "already");
  });

  it("converts camelCase to snake_case", () => {
    assert.equal(toSnakeCase("processData"), "process_data");
    assert.equal(toSnakeCase("getVersion"), "get_version");
    assert.equal(toSnakeCase("aSimpleFunction"), "a_simple_function");
  });

  it("roundtrips correctly for snake_case inputs", () => {
    const names = ["process_data", "get_version", "a_simple_function", "already"];
    for (const name of names) {
      const camel = toCamelCase(name);
      const snake = toSnakeCase(camel);
      assert.equal(snake, name, `Roundtrip failed for "${name}": ${name} → ${camel} → ${snake}`);
    }
  });

  it("handles edge cases", () => {
    assert.equal(toCamelCase(""), "");
    assert.equal(toCamelCase("_private"), "Private");
    assert.equal(toCamelCase("__double"), "_Double"); // leading _ preserved
    assert.equal(toCamelCase("ALLCAPS"), "ALLCAPS");
    assert.equal(toCamelCase("with_number_123"), "withNumber_123");
  });
});

// ─── Arg unwrapping tests ────────────────────────────────────────────────────

describe("Arg unwrapping: single-element array normalization", () => {
  // This mirrors the logic in JavaDevBridge.call() and PythonDevBridge.call()

  function unwrapArgs(args: unknown[]): unknown {
    return args.length === 1 ? args[0] : args;
  }

  it("unwraps single object arg", () => {
    const input = [{ id: "test", value: 42 }];
    const result = unwrapArgs(input);
    assert.deepEqual(result, { id: "test", value: 42 });
  });

  it("unwraps single array arg", () => {
    const input = [[1, 2, 3]];
    const result = unwrapArgs(input);
    assert.deepEqual(result, [1, 2, 3]);
  });

  it("unwraps single string arg", () => {
    const input = ["hello"];
    const result = unwrapArgs(input);
    assert.equal(result, "hello");
  });

  it("preserves multiple args as array", () => {
    const input = ["hello", 42, { key: "value" }];
    const result = unwrapArgs(input);
    assert.deepEqual(result, ["hello", 42, { key: "value" }]);
  });

  it("preserves empty args", () => {
    const input: unknown[] = [];
    const result = unwrapArgs(input);
    assert.deepEqual(result, []);
  });

  it("unwraps single null arg", () => {
    const input = [null];
    const result = unwrapArgs(input);
    assert.equal(result, null);
  });

  it("unwraps single undefined arg", () => {
    const input = [undefined];
    const result = unwrapArgs(input);
    assert.equal(result, undefined);
  });
});

// ─── JSON auto-parse tests ───────────────────────────────────────────────────

describe("JSON auto-parse: return value normalization", () => {
  // This mirrors the logic in JavaProcessManager.callFunction() and PythonProcessManager.callFunction()

  function autoParseJson(result: string): unknown {
    try {
      return JSON.parse(result);
    } catch {
      return result;
    }
  }

  it("parses JSON object", () => {
    const result = autoParseJson('{"id": "test", "value": 42}');
    assert.deepEqual(result, { id: "test", value: 42 });
  });

  it("parses JSON array", () => {
    const result = autoParseJson("[1, 2, 3]");
    assert.deepEqual(result, [1, 2, 3]);
  });

  it("parses JSON string", () => {
    const result = autoParseJson('"hello"');
    assert.equal(result, "hello");
  });

  it("parses JSON number", () => {
    const result = autoParseJson("42");
    assert.equal(result, 42);
  });

  it("parses JSON boolean", () => {
    assert.equal(autoParseJson("true"), true);
    assert.equal(autoParseJson("false"), false);
  });

  it("parses JSON null", () => {
    assert.equal(autoParseJson("null"), null);
  });

  it("returns raw string for non-JSON", () => {
    const result = autoParseJson("not json at all");
    assert.equal(result, "not json at all");
  });

  it("returns raw string for malformed JSON", () => {
    const result = autoParseJson("{invalid}");
    assert.equal(result, "{invalid}");
  });
});

// ─── TransitError tests ──────────────────────────────────────────────────────

describe("TransitError", () => {
  // Import TransitError from the built module
  // These tests verify the error class structure

  it("has correct shape", async () => {
    const { TransitError } = await import("@sabeeirsharrma/transit");
    const err = new TransitError({
      language: "java",
      functionName: "processData",
      detail: "Function not found",
      raw: new Error("original"),
    });

    assert.equal(err.name, "TransitError");
    assert.equal(err.language, "java");
    assert.equal(err.functionName, "processData");
    assert.equal(err.detail, "Function not found");
    assert.equal(err.raw instanceof Error ? err.raw.message : err.raw, "original");
    assert.ok(err.message.includes("java"));
    assert.ok(err.message.includes("processData"));
    assert.ok(err.message.includes("Function not found"));
  });

  it("does not shadow Error.cause", async () => {
    const { TransitError } = await import("@sabeeirsharrma/transit");
    const err = new TransitError({
      language: "rust",
      functionName: "add",
      detail: "overflow",
    });

    // Error.cause should be undefined (not a string)
    assert.equal(err.cause, undefined);
    // The detail should be accessible via .detail
    assert.equal(err.detail, "overflow");
  });
});
