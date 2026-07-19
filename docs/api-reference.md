# API Reference

## `transit` (default export)

The main entry point. A singleton `Transit` instance.

```js
import { transit } from "transit"
```

### `transit.rust(dir): FunctionProxy`

Scans a Rust source directory and returns a language handle.

```js
const rs = transit.rust("./rust")
```

**Parameters:**
- `dir` (string) — path to the directory containing Rust source files

**Returns:** A `FunctionProxy` — a `Proxy`-based handle whose properties map to discovered functions.

**Behavior:**
- Scans the directory with the tree-sitter scanner (Rust grammar)
- Detects `pub fn` declarations as Tier 1 exports
- Detects `// transit:file` and `// transit:function` markers
- Loads the compiled native addon (`.node` or `.so`) from the directory
- Caches the handle — calling `transit.rust(dir)` again with the same path returns the same handle

**Transport:** In-process native addon (via napi-rs). Zero serialization overhead.

### `transit.java(dir): FunctionProxy`

Scans a Java source directory and returns a language handle.

```js
const jv = transit.java("./java/src/main/java")
```

**Parameters:**
- `dir` (string) — path to the directory containing Java source files

**Returns:** A `FunctionProxy` — same interface as Rust.

**Behavior:**
- Scans for `public` methods (text-based detection)
- Auto-discovers the compiled classpath by walking up parent directories looking for `build/`, `out/`, or `target/` containing `TransitService.class`
- On first function call, spawns a resident JVM process and connects via TCP
- The Java process stays alive across calls (no cold starts)

**Transport:** TCP binary protocol on `127.0.0.1` (ephemeral port).

### `transit.python(dir): FunctionProxy`

Scans a Python source directory and returns a language handle.

```js
const py = transit.python("./python")
```

**Parameters:**
- `dir` (string) — path to the directory containing Python source files

**Returns:** A `FunctionProxy` — same interface as Rust/Java.

**Behavior:**
- Scans for top-level `def` functions and `class` methods (tree-sitter Python grammar)
- Detects `# transit:file` and `# transit:function` markers (Tiers 2/3)
- Filters out private methods (`_` prefix)
- Class methods are qualified as `ClassName.method_name`
- On first function call, spawns a resident Python process and connects via TCP
- The Python process stays alive across calls (no cold starts)

**Transport:** TCP binary protocol on `127.0.0.1` (ephemeral port), same protocol as Java.

### `transit.info(): void`

Prints all discovered functions for every registered language handle.

### `scanFileSync(filePath): ManifestEntry[]`

Scan a single file and return its manifest entries. Useful for incremental updates in file watchers.

```js
import { scanFileSync } from "transit"
const entries = scanFileSync("./src/lib.rs")
```

### `invalidateFileCache(root, filePath): void`

Remove a specific file from the scan cache (e.g., when a file is deleted).

### `clearScanCache(root): void`

Clear the entire scan cache for a directory. Forces a full re-scan on next `scanDirectory` call.

```js
transit.info()
// rust (./rust): 3 functions
//   - process_general [tier 1] (pub fn process_general(job: FileJob) -> ProcessResult)
// java (./java): 2 functions
//   - processSpecialized [tier 1] (public String processSpecialized(String argsJson))
```

### `transit.config`

The resolved configuration object (always complete with defaults). Read-only.

```js
console.log(transit.config.build.rust.command)  // "cargo build --release"
console.log(transit.config.build.java.jvmArgs)  // ["-Xmx512m"]
console.log(transit.config.maxRestarts)          // 3
```

### `transit.configDir`

The directory the config was loaded from (usually `process.cwd()`).

### `transit.reloadConfig(dir?): void`

Reload config from disk. Call this if `transit.config.json` changes during development.

```js
transit.reloadConfig()        // reload from same dir
transit.reloadConfig("/app")  // reload from a different dir
```

---

## Config Functions (from `@sabeeirsharrma/schema`)

These are also re-exported from the `transit` package for convenience.

### `loadConfig(dir): Required<TransitConfig> | null`

Load, validate, and normalize `transit.config.json` from a directory. Returns `null` if no config file exists.

```js
import { loadConfig } from "transit"
const config = loadConfig("/my/project")
```

### `loadConfigWithDefaults(dir): Required<TransitConfig>`

Same as `loadConfig()` but returns full defaults when no config file exists (never returns null).

### `validateConfig(raw): TransitConfig`

Validate a raw JSON object against the Transit schema. Throws `ConfigError` with a specific message on invalid input.

```js
import { validateConfig } from "transit"
try {
  const config = validateConfig({ build: { rust: { command: 123 } } })
} catch (err) {
  console.error(err.message)
  // "transit.config.json → build.rust.command: expected a string, got number"
}
```

### `mergeWithDefaults(config): Required<TransitConfig>`

Fill in Transit defaults for missing fields. Does not overwrite explicitly set values.

---

## `FunctionProxy`

The object returned by `transit.rust()`, `transit.java()`, etc. It's a JavaScript `Proxy` that dynamically resolves property access to function calls.

### Calling functions

```js
// Flat namespace — works when function names are unique across files
const result = await rs.processGeneral(job)
const result = await jv.processSpecialized(data)
```

### Qualified calls (file disambiguation)

When two files export functions with the same name:

```js
// Use bracket notation with the filename (without extension)
await rs["lib"]["processGeneral"](job)
await rs["utils"]["processGeneral"](job)
```

### Inspection properties

These are available on any `FunctionProxy`:

| Property | Type | Description |
|----------|------|-------------|
| `_manifest` | `Manifest` | The full scanner manifest |
| `_bridge` | `RuntimeBridge` | The underlying transport bridge |
| `_lang` | `string` | The language name (`"rust"`, `"java"`, etc.) |
| `_functions()` | `() => ManifestEntry[]` | Returns all discovered function entries |

### Error handling

If a function is not found, the proxy throws:

```
Function "nonexistent" not found in rust. Available: process_general, version
```

---

## Types

### `TransitError`

Unified error type for all cross-language calls. Extends `Error`.

```typescript
class TransitError extends Error {
  readonly language: string;    // "rust" | "java" | "python"
  readonly functionName: string;
  readonly cause: string;       // original error message
  readonly raw: unknown;        // original error object
}
```

**Example:**
```js
try {
  await rs.processJob(data)
} catch (err) {
  if (err instanceof TransitError) {
    console.error(`Error in ${err.language}: ${err.cause}`)
  }
}
```

### `ManifestEntry`

```typescript
interface ManifestEntry {
  language: string        // "rust" | "java" | "javascript" | "python"
  sourceFile: string      // full path to the source file
  functionName: string    // function name as declared in source
  signature: string       // function signature (without body)
  exportTier: 1 | 2 | 3   // export tier
}
```

### `Manifest`

```typescript
interface Manifest {
  entries: ManifestEntry[]
  generatedAt: number     // timestamp (ms since epoch)
}
```

---

## Naming conventions

The scanner normalizes names between languages:

- **snake_case** (Rust): `process_general` is registered under both `process_general` and `processGeneral`
- **camelCase** (Java): `processSpecialized` is registered as `processSpecialized`
- **JS/TS**: function names are used as-is

All registrations are case-insensitive for the first letter and support both snake_case and camelCase lookup.

---

## Lifecycle

### Rust bridge

1. `transit.rust(dir)` scans the directory and creates a handle
2. First function call triggers addon loading (`index.node` or `target/release/*.so`)
3. Subsequent calls go directly to the loaded addon
4. No cleanup needed — the addon lives in-process

### Java bridge

1. `transit.java(dir)` scans the directory and creates a handle
2. First function call spawns the JVM process
3. The process prints `PORT=<port>` to stdout on startup
4. The bridge connects via TCP and starts health checks
5. Subsequent calls go through the TCP connection
6. If the process crashes, it auto-restarts (up to 3 times)
7. Call `jv._bridge.stop()` to shut down the Java process

### Python bridge

1. `transit.python(dir)` scans the directory and creates a handle
2. First function call spawns the Python process
3. The process prints `PORT=<port>` to stdout on startup
4. The bridge connects via TCP and starts health checks
5. Subsequent calls go through the TCP connection
6. If the process crashes, it auto-restarts (up to 3 times)
7. Call `py._bridge.stop()` to shut down the Python process
