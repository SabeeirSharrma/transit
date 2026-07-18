# Transit

**Languages that just talk to each other. No API. No middleman.**

Transit lets JS call Rust and Java functions directly — no REST API, no hand-written JSON schemas, no dedicated glue server. Write your functions in the language that fits the job, call them from JS like any other async function.

```js
import { transit } from "transit"

const rs = transit.rust("./rust")
const jv = transit.java("./java")

// These are real calls across language boundaries
const rustResult = await rs.processFile(buffer)
const javaResult = await jv.specializedHandler(rustResult)
```

## How It Works

Transit combines three pieces:

1. **Scanner** — a Rust native addon (tree-sitter-powered) that discovers exported functions in your source code at startup
2. **Transport bridges** — in-process native addon for Rust (zero-copy), TCP binary protocol for Java (persistent resident process)
3. **Proxy API** — a dynamic JavaScript `Proxy` that resolves function names against the scanner manifest and dispatches through the right bridge

The developer never writes serialization code, route handlers, or API glue. Just point Transit at a directory and call the functions you find.

## Quick Start

```bash
# Install
bun install transit

# Or with npm
npm install transit
```

### 1. Register your codebases

```js
// index.js
import { transit } from "transit"
import { resolve } from "node:path"

export const rs = transit.rust(resolve(__dirname, "./rust"))
export const jv = transit.java(resolve(__dirname, "./java"))
```

### 2. Call functions across languages

```js
import { rs, jv } from "./index.js"

// JS → Rust (in-process native call, zero serialization overhead)
const processed = await rs.processGeneral({
  id: "job-001",
  bytes: [72, 101, 108, 108, 111],
  priority: 1,
})

// JS → Java (persistent resident process, binary protocol)
const specialized = await jv.processSpecialized({
  id: "job-001",
  bytes: [1, 2, 3],
})
```

### 3. List discovered functions

```js
transit.info()
// rust (./rust): 3 functions
//   - process_general [tier 1] (pub fn process_general(job: FileJob) -> ProcessResult)
//   - process_with_helper [tier 1] (pub fn process_with_helper(job: FileJob) -> ProcessResult)
//   - version [tier 1] (pub fn version() -> String)
// java (./java): 15 functions
//   - processSpecialized [tier 1] (public String processSpecialized(String argsJson))
//   - getVersion [tier 1] (public String getVersion(String argsJson))
```

## Export Tiers

Transit discovers functions using a three-tier system. No source changes required for Tier 1 — just write normal code.

| Tier | Mechanism | Example |
|------|-----------|---------|
| **1** | Natively public | `pub fn` in Rust, `public` methods in Java, `export` in JS |
| **2** | File-level marker | `// transit:file` at the top of a file |
| **3** | Function-level marker | `// transit:function` comment directly above a function |

```rust
// transit:file — all public functions in this file are exported (Tier 2)

pub fn process_general(job: FileJob) -> ProcessResult { ... }

// transit:function — this private helper is also exported (Tier 3)
fn internal_helper(data: &[u8]) -> String { ... }
```

Functions with ambiguous names (same name in multiple files) use the qualified form:

```js
await rustTransit["lib"]["processGeneral"](job)
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Your JS Code                                   │
│    rs.processGeneral(job)                       │
└──────────────┬──────────────────────────────────┘
               │ Proxy resolves name against manifest
               ▼
┌─────────────────────────────────────────────────┐
│  transit-js                                     │
│    createLanguageHandle() → Proxy               │
└──────┬───────────────────────────────┬──────────┘
       │                               │
       ▼                               ▼
┌──────────────────┐    ┌──────────────────────────┐
│ RustDevBridge    │    │ JavaDevBridge            │
│ (in-process)     │    │ (TCP binary protocol)    │
│ .node addon load │    │ JavaProcessManager       │
└──────┬───────────┘    └──────┬───────────────────┘
       │                       │
       ▼                       ▼
┌──────────────────┐    ┌──────────────────────────┐
│ Native Rust      │    │ Resident JVM process     │
│ (napi-rs .node)  │    │ TransitServer (TCP)      │
└──────────────────┘    └──────────────────────────┘
```

**JS ↔ Rust**: In-process native addon. The Rust code compiles to a `.node` file loaded directly into the Node.js process. Zero serialization, zero IPC overhead.

**JS ↔ Java**: Persistent local TCP socket with a compact binary protocol. The Java process starts once (no cold starts), listens on `127.0.0.1`, and communicates via a 10-byte header + payload format.

## Project Structure

```
transit/
  packages/
    transit-js/              # Public API — transit.rust(), transit.java()
    transit-scanner/         # Rust tree-sitter scanner (native addon)
    transit-schema/          # Shared IDL types and parser
    transit-rust-runtime/    # napi-rs bridge for in-process Rust calls
    transit-java-runtime/    # Java resident-process server (TCP)
    transit-java-runtime-js/ # Node.js client for the Java TCP bridge
  cli/
    transit-cli/             # transit dev / build / start
  examples/
    js-rust-java-demo/       # Working demo project
  docs/
    getting-started.md
    api-reference.md
    architecture.md
    binary-protocol.md
    export-tiers.md
```

## Development

```bash
# Install dependencies
bun install

# Build the scanner (Rust native addon)
cd packages/transit-scanner
cargo build --release
cp target/release/libtransit_scanner.so index.node

# Build the Java classes
cd packages/transit-java-runtime
javac -d build src/main/java/transit/java/*.java

# Build transit-js
cd packages/transit-js
./node_modules/.bin/tsc

# Run the demo
node examples/js-rust-java-demo/js/index.js
```

## Requirements

- **Node.js** >= 20
- **Rust** (for scanner and Rust runtime compilation)
- **Java** JDK 21+ (for Java runtime)
- **bun** (recommended) or npm

## Docs

- [Getting Started](docs/getting-started.md) — hands-on walkthrough
- [API Reference](docs/api-reference.md) — full API docs
- [Architecture](docs/architecture.md) — system design deep dive
- [Binary Protocol](docs/binary-protocol.md) — wire format for JS ↔ Java
- [Export Tiers](docs/export-tiers.md) — function discovery system

## Status

v0.1 — early development. JS → Rust and JS → Java are working end-to-end. Python support is planned. Codegen (build mode) and the CLI are not yet implemented.

## License

MIT
