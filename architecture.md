# Transit — Architecture

**Status:** v0.1 (design stage, companion to TRANSIT_SPEC.md)

---

## 1. Repo Layout (proposed)

Transit itself is polyglot (it has to speak the languages it bridges), so
the repo is a workspace of sub-packages rather than one language's project
layout:

```
transit/
  packages/
    transit-js/          # the `transit` npm/bun package — public API surface
    transit-scanner/      # tree-sitter-based discovery engine (Rust, compiled
                           # to a native addon consumed by transit-js)
    transit-rust-runtime/ # native addon glue (napi-rs) for in-process Rust calls
    transit-java-runtime/ # resident-process manager + socket transport for Java
    transit-py-runtime/   # (later) same pattern for Python
    transit-schema/       # shared type/IDL definitions + codegen templates
  cli/
    transit-cli/          # `transit dev`, `transit build`, `transit start`
  examples/
    js-rust-java-demo/    # reference project showing the index.js pattern
  docs/
    TRANSIT_SPEC.md
    TRANSIT_ARCHITECTURE.md
```

`transit-scanner` being written in Rust (not JS) is deliberate — directory
walking + tree-sitter parsing is exactly the kind of workload where Rust's
speed matters, and it's shipped to the JS package as a compiled native
addon, same mechanism as the Rust-runtime bridge itself. Transit uses its
own bridging pattern internally.

---

## 2. Component Responsibilities

### transit-scanner (Rust, native addon)
- Fast `.gitignore`-aware directory walk
- Tree-sitter parse of each source file, per-language grammar — strictly
  read-only, no source rewriting (an earlier design considered a
  text-transform pre-pass for keyword-based export markers; dropped in
  favor of comment markers, which need no rewriting at all)
- Detects `transit:file` (whole-file) and `transit:function` (single
  function, comment placed directly above it) markers during the same
  parse pass, plus natively-public functions per language convention
  (Tier 1 baseline)
- Merges in config-file overrides (`transit.config.json`/`.toml`)
- Maintains a file-hash cache; only re-parses changed files on subsequent
  scans
- Outputs a **manifest**: `{ language, sourceFile, functionName, signature, exportTier }[]`

### transit-js (public package)
- Exposes `transit.rust(dir)`, `transit.java(dir)`, `transit.python(dir)`, etc.
- In dev mode: wraps the manifest in a `Proxy` per language handle, resolving
  method calls dynamically and dispatching to the correct runtime bridge
- In build mode: consumes generated typed stubs instead (no Proxy, no
  runtime resolution)

### transit-rust-runtime
- Compiles the target Rust codebase's exported functions into a native
  Node addon (via napi-rs)
- Handles type marshaling between Rust types and JS/N-API types, driven by
  the shared schema

### transit-java-runtime
- Manages a resident JVM process (start/stop/health-check/auto-restart)
- Implements the binary socket protocol (local Unix socket / named pipe)
- Generates the Java-side stub class matching exported methods

### transit-schema
- Shared type definitions (the Transit IDL from TRANSIT_SPEC.md section 4)
- Codegen templates: schema → Rust struct / Java class / TS interface
- Used by build mode to generate the typed stubs referenced above

### transit-cli
- `transit dev` — starts the scanner in watch mode + dev-mode runtime
- `transit build` — runs full codegen + native compilation for all
  registered language dirs
- `transit start` — runs the build-mode artifact (production)

---

## 3. Call Flow

### Dev mode (JS → Rust example)
```
rs.processFile(buf)
  → Proxy intercepts "processFile"
  → looks up manifest entry (source: rust/lib.rs, fn: process_file)
  → dispatches to transit-rust-runtime dev bridge
  → in-process native call executes, result returned
```

### Dev mode (JS → Java example)
```
jv.specializedHandler(data)
  → Proxy intercepts "specializedHandler"
  → looks up manifest entry (source: java/Handler.java, fn: specializedHandler)
  → transit-java-runtime checks resident JVM process is alive (starts if not)
  → call serialized via binary protocol over local socket
  → JVM executes, result returned over same socket
```

### Build mode
```
transit build
  → transit-scanner produces final manifest
  → transit-schema codegen emits typed stubs (TS) + Rust/Java glue code
  → cargo build --release  → produces .node addon
  → Java sources packaged, resident-process wiring finalized
  → transit start runs the compiled artifact — no scanning, no Proxy,
    no runtime discovery, pure generated call paths
```

---

## 4. Open Implementation Questions

- [ ] Exact binary protocol for the socket transport (see TRANSIT_SPEC.md
      Section 7 — still deciding custom vs. existing format)
- [ ] Health-check/restart policy for the resident Java process — how many
      retries, backoff strategy, what happens to in-flight calls on crash
- [ ] Versioning story: what happens when the manifest changes shape (a
      function's signature changes) between dev sessions — regenerate
      silently, or surface a diff/warning to the developer?
- [ ] How build-mode stub generation handles a function that exists in dev
      manifest but fails to compile (partial build vs. hard fail)
- [ ] Python runtime bridge design (deferred — v0.1 focuses on JS/Rust/Java)
