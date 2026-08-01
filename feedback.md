# Transit Showcase Demo — Feedback

**Date:** 2026-07-31
**Context:** Building a self-contained demo at `demo/` that calls Rust, Python, and Java from a single `index.js`.

---

## Issue 1: Java Thread Pool Deadlock

**Severity:** Critical — Java calls hang indefinitely
**Component:** `transit-java-runtime` / `TransitServer.java`

### Symptom

After the Node.js client connects 8 sockets to the Java server, all function calls hang. No error, no timeout — just silence.

### Root Cause

`TransitServer.java` creates a single `FixedThreadPool(min(cores, 8))` and submits **both** `handleClient` tasks (one per socket connection) **and** `handleCall` tasks (one per request) to the same pool.

With 8 socket connections and a pool of 8 threads:
1. All 8 threads are occupied by `handleClient` (blocked on `readExact()`)
2. When a request arrives, `handleClient` submits `handleCall` to the same pool
3. No threads are available → `handleCall` queues forever
4. `handleClient` loops back to `readExact()` → **deadlock**

### Fix

Use `Executors.newCachedThreadPool()` instead of `FixedThreadPool`. This lets the pool grow dynamically so `handleCall` tasks are never starved.

**Patched file:** `demo/java/lib/transit/java/TransitServer.java`

```java
// BEFORE (deadlock-prone):
private final ExecutorService executor = Executors.newFixedThreadPool(
    Math.min(Runtime.getRuntime().availableProcessors(), 8)
);

// AFTER:
private final ExecutorService executor = Executors.newCachedThreadPool();
```

### Recommendation

Fix this in the published `transit-java-runtime`. The `FixedThreadPool` with size matching the Node.js connection pool size (`min(cpus, 8)`) is an inherent deadlock trap.

---

## Issue 2: Java Runtime Not Included in npm Package

**Severity:** High — Java users must manually download source files from the monorepo
**Component:** `@sabeeirsharrma/java-runtime`

### Symptom

After `bun install @sabeeirsharrma/transit`, the Java runtime package contains only TypeScript/JS bridge code — no `.java` source files. Users must manually download `TransitServer.java`, `BinaryProtocol.java`, and `TransitService.java` from the GitHub monorepo and compile them.

### What Users Have to Do

```bash
# Download Java runtime sources manually
mkdir -p java/lib/transit/java
curl -sO "https://raw.githubusercontent.com/sabeeirsharrma/transit/main/packages/transit-java-runtime/src/main/java/transit/java/BinaryProtocol.java" --output-dir java/lib/transit/java/
curl -sO "https://raw.githubusercontent.com/sabeeirsharrma/transit/main/packages/transit-java-runtime/src/main/java/transit/java/TransitServer.java" --output-dir java/lib/transit/java/
curl -sO "https://raw.githubusercontent.com/sabeeirsharrma/transit/main/packages/transit-java-runtime/src/main/java/transit/java/TransitService.java" --output-dir java/lib/transit/java/

# Compile Java runtime
mkdir -p java/build
javac -d java/build java/lib/transit/java/*.java

# Compile user code against the runtime
javac -cp java/build -d java/build java/src/main/java/com/demo/*.java
```

### Recommendation

Include the compiled `.class` files (or the `.java` sources) in the npm package under a `java/` or `lib/` directory. Users should only need to compile their own code, not the framework.

---

## Issue 3: Python `transit_server.py` Not Included in npm Package

**Severity:** High — Python users must manually copy the server file
**Component:** `@sabeeirsharrma/python-runtime`

### Symptom

After `bun install @sabeeirsharrma/transit`, there is no `transit_server.py` anywhere in `node_modules`. Users must know to copy it from the monorepo:

```bash
cp node_modules/@sabeeirsharrma/transit/packages/transit-py-runtime/transit_server.py python/
```

But this path doesn't exist in the published package either — the `packages/` directory isn't published.

### What I Did

I fetched the full `transit_server.py` source from GitHub and bundled it directly in the demo's `python/` directory. This is a 250+ line file that users shouldn't have to hunt for.

### Recommendation

Either:
1. Include `transit_server.py` in the `@sabeeirsharrma/python-runtime` package
2. Or have `transit.python()` automatically copy/proxy it to the user's Python directory on first call

---

## Issue 4: Transit Wraps Args in Arrays

**Severity:** Medium — breaks naive JSON parsers in user code
**Component:** `transit-java-runtime` / `transit-py-runtime` (protocol layer)

### Symptom

When calling `jv.processRecord({ id: "test", value: 42 })` from JS, the Java function receives:

```json
[{"id":"test","value":42}]
```

Not:

```json
{"id":"test","value":42}
```

Similarly, `jv.computeStats({ values: [1, 2, 3] })` sends:

```json
[{"values":[1,2,3]}]
```

### Impact

Any Java/Python function that does naive JSON parsing (e.g., `json.loads(args)` and immediately accessing keys) will fail silently — getting `null` for all fields and defaulting to fallback values.

In my demo, this caused `processRecord` to return `"id":"unknown"` and `"value":0.0` for every record until I added array-unwrapping logic.

### Recommendation

Document this behavior prominently in the API reference. The current docs show:

```python
def process_data(args_json):
    args = json.loads(args_json)
    items = args.get("items", [])
```

This code would break. It should be:

```python
def process_data(args_json):
    args = json.loads(args_json)
    # Transit wraps args as [{...}], extract the first object
    if isinstance(args, list) and len(args) > 0:
        args = args[0]
    items = args.get("items", [])
```

Or better: have the Transit server unwrap automatically before dispatching to user functions.

---

## Issue 5: Java `classpath` and `mainClass` Must Be Configured Manually

**Severity:** Medium — confusing for new users
**Component:** `transit-java-runtime` / `JavaProcessManager`

### Symptom

Calling `transit.java(dir)` without options fails with:

```
Java class not found: transit.java.TransitService (looked in ./java/src/main/java)
```

Users must know to pass:

```js
const jv = transit.java(resolve(__dirname, "./java/src/main/java"), {
  classpath: resolve(__dirname, "./java/build"),
  mainClass: "com.demo.App",
});
```

The default `mainClass` is `transit.java.TransitService`, which only exists if users compiled the Transit runtime sources. The `classpath` defaults to `<javaDir>/build`, which may not exist.

### Recommendation

Either:
1. Auto-detect the main class by scanning for `public static void main` in compiled `.class` files
2. Or default to scanning for any class with a `main` method in the classpath
3. Or provide a better error message that lists available classes

---

## Issue 6: Java/Python Return JSON Strings, Not Objects

**Severity:** Medium — unexpected API behavior
**Component:** Transit protocol layer

### Symptom

In JavaScript:

```js
const result = await jv.processRecord({ id: "test", value: 42 });
console.log(typeof result); // "string"
console.log(result);        // '{"id":"test","processed_value":46.75,...}'
```

Users expect `result` to be a parsed object. Instead, they get a JSON string that must be manually parsed with `JSON.parse()`.

This is inconsistent with how most JS APIs work and is not documented in the getting-started guide.

### Recommendation

Have the Transit JS bridge auto-parse JSON string results into objects. Or at minimum, document this clearly in the API reference with a helper function:

```js
function parseResult(raw) {
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}
```

---

## Issue 7: `napi-build` Version Mismatch in Getting Started Guide

**Severity:** Low — causes build failure for new users
**Component:** docs / getting-started.md

### Symptom

The getting-started guide shows:

```toml
[dependencies]
napi = { version = "3", features = ["serde-json"] }
napi-derive = "3"

[build-dependencies]
napi-build = "3"
```

But `napi-build` v3 does not exist on crates.io. The latest is v2.4.0. Running `cargo build` fails:

```
error: failed to select a version for the requirement `napi-build = "^3"`
```

### Fix

The Transit repo's own example (`examples/js-rust-java-demo/rust/Cargo.toml`) correctly uses:

```toml
[dependencies]
napi = { version = "3", features = ["async"] }
napi-derive = "3"

[build-dependencies]
napi-build = "2"
```

### Recommendation

Update `docs/getting-started.md` to use `napi-build = "2"`.

---

## Issue 8: Scanner Detects TransitServer.start as Exported Function

**Severity:** Low — cosmetic, clutters function list
**Component:** `transit-scanner`

### Symptom

`transit.info()` shows:

```
python (./python): 7 functions
  - register_function [tier 1]
  - start_server [tier 1]
  - TransitServer.start [tier 1]    ← class method, not user function
  - TransitServer.stop [tier 1]     ← class method, not user function
  - analyze_text [tier 1]
  - transform_data [tier 1]
  - format_report [tier 1]
```

`TransitServer.start` and `TransitServer.stop` are internal class methods from the Transit Python runtime, not user-defined functions. The scanner should exclude methods from classes that aren't the user's entry point.

### Recommendation

Filter out methods from classes imported from `transit_server` or other runtime modules.

---

## Summary of Recommended Priorities

| # | Issue | Severity | Effort |
|---|-------|----------|--------|
| 1 | Java thread pool deadlock | Critical | Low (one-line change) |
| 2 | Java runtime not in npm package | High | Medium |
| 3 | Python transit_server.py not in npm package | High | Medium |
| 4 | Transit wraps args in arrays | Medium | Low (document or auto-unwrap) |
| 5 | Java classpath/mainClass manual config | Medium | Medium (auto-detect) |
| 6 | JSON string results not auto-parsed | Medium | Low (bridge change) |
| 7 | napi-build version in docs | Low | Trivial |
| 8 | Scanner detects runtime class methods | Low | Low |
