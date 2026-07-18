# Transit

**Languages that just talk to each other. No API. No middleman.**

Transit lets you write functions in Rust, Java, or Python — then call them from JavaScript as if they were normal async functions. No REST APIs, no JSON schemas, no glue code. Just write your logic in the language that fits the job, and Transit handles the rest.

```js
import { transit } from "transit"
import { resolve } from "node:path"

const __dirname = import.meta.dirname

// Point Transit at your codebases
const rs = transit.rust(resolve(__dirname, "./rust"))
const jv = transit.java(resolve(__dirname, "./java/src/main/java"))
const py = transit.python(resolve(__dirname, "./python"))

// Call functions across language boundaries
const rustResult = await rs.processFile({ id: "job-001", bytes: [72, 101, 108] })
const javaResult = await jv.handleSpecialized(rustResult)
const pythonResult = await py.analyzeData(javaResult)
```

## Quick Start

### 1. Install

```bash
bun install transit
```

Requirements:
- **Node.js** >= 20
- **Rust** toolchain (for scanner + Rust addons)
- **Java** JDK 21+ (if using Java)
- **Python** 3.10+ (if using Python)
- **bun** (recommended) or npm

### 2. Write functions in any supported language

**Rust** — write normal `pub fn` functions:
```rust
// rust/src/lib.rs
pub fn process_job(data: Vec<u8>) -> String {
    format!("Processed {} bytes", data.len())
}
```

**Java** — write public methods that take and return JSON strings:
```java
// java/src/main/java/com/example/App.java
public class App {
    public String processJob(String argsJson) {
        return "{\"output\":\"processed\"}";
    }
}
```

**Python** — write functions that take and return JSON strings:
```python
# python/service.py
def process_data(args_json):
    return '{"output": "processed"}'
```

### 3. Call from JS

```js
import { transit } from "transit"
import { resolve } from "node:path"

const __dirname = import.meta.dirname

const rs = transit.rust(resolve(__dirname, "./rust"))
const jv = transit.java(resolve(__dirname, "./java/src/main/java"))
const py = transit.python(resolve(__dirname, "./python"))

// Call functions — they appear as normal async methods
await rs.processJob([72, 101, 108])       // → Rust
await jv.processJob({"data": [1, 2]})     // → Java
await py.processData({"items": [10, 20]}) // → Python
```

### 4. See what Transit found

```js
transit.info()
// rust (./rust): 1 functions
//   - processJob [tier 1]
// java (./java/src/main/java): 1 functions
//   - processJob [tier 1]
// python (./python): 1 functions
//   - processData [tier 1]
```

## How It Works

Transit has three components:

1. **Scanner** — uses tree-sitter to scan your source code and find exported functions automatically
2. **Bridges** — transport layers that connect JS to each language:
   - **Rust**: in-process native addon (zero overhead)
   - **Java**: persistent TCP process on localhost
   - **Python**: persistent TCP process on localhost
3. **Proxy** — a JS `Proxy` that makes cross-language calls look like normal function calls

You never write serialization code or API routes. Just point Transit at a directory.

## CLI Commands

Transit includes a CLI for managing your project:

```bash
transit init          # Detect languages, write config
transit dev           # Live development with file watching
transit build         # Generate typed stubs and compile
transit start         # Run in production mode
```

See [Getting Started](docs/getting-started.md) for full CLI documentation.

## Architecture

```
Your JS code
    │
    ▼
transit.rust() / transit.java() / transit.python()
    │
    ▼
Proxy resolves function name against scanner manifest
    │
    ├──► Rust: in-process native addon (.node)
    ├──► Java: TCP binary protocol → JVM resident process
    └──► Python: TCP binary protocol → Python resident process
```

## Project Structure

```
transit/
  packages/
    transit-js/                 # Public API — transit.rust(), transit.java(), transit.python()
    transit-scanner/            # Rust tree-sitter scanner (native addon)
    transit-schema/             # Shared types and config
    transit-rust-runtime/       # napi-rs bridge for in-process Rust calls
    transit-java-runtime/       # Java resident-process server (TCP)
    transit-java-runtime-js/    # Node.js client for the Java TCP bridge
    transit-py-runtime/         # Python resident-process server (TCP)
    transit-python-runtime-js/  # Node.js client for the Python TCP bridge
    transit-codegen/            # Code generation for typed stubs
  cli/
    transit-cli/                # transit init / dev / build / start
  examples/
    js-rust-java-demo/          # Working demo project
```

## Development

```bash
# Install all dependencies
bun install

# Build the scanner (Rust native addon)
cd packages/transit-scanner
cargo build --release
cp target/release/libtransit_scanner.so index.node

# Build transit-js
cd packages/transit-js
bun run build

# Build the Java classes
cd packages/transit-java-runtime
javac -d build src/main/java/transit/java/*.java

# Run the demo
node examples/js-rust-java-demo/js/index.js
```

## Docs

- [Getting Started](docs/getting-started.md) — step-by-step walkthrough for beginners
- [API Reference](docs/api-reference.md) — full API documentation
- [Architecture](docs/architecture.md) — system design deep dive
- [Binary Protocol](docs/binary-protocol.md) — wire format for JS ↔ Java/Python
- [Export Tiers](docs/export-tiers.md) — function discovery system
- [Contributing](docs/contributing.md) — development guide

## Status

v0.1 — Working end-to-end: JS → Rust, JS → Java, and JS → Python all functional. CLI with init, dev, build, and start commands. Codegen for typed stubs.

## License

MIT
