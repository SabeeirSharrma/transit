# Transit

**Languages that just talk to each other. No API. No middleman.**

Transit lets you write functions in Rust, Java, or Python — then call them from JavaScript as if they were normal async functions. No REST APIs, no JSON schemas, no glue code. Just write your logic in the language that fits the job, and Transit handles the rest.

For full docs, go to: <https://sabeeir.qd.je/transit>

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

## Transit - Benchmarks

Below are the results of an automated benchmark test comparing Transit against FastAPI, gRPC, Thrift, Unix Socket, Subprocess, ZeroMQ, Redis Pub/Sub, and PyO3.

If you would like to benchmark on your own hardware, you can switch to the [Benchmark Branch](https://github.com/sabeeirsharrma/transit/tree/benchmark/)

### Compute Benchmarks

#### Serial Results (single request, 100 iterations)

| Operation | FastAPI | Transit/Rust | Transit/Java | gRPC | Thrift | ZeroMQ | Redis | PyO3 | Winner |
|---|---|---|---|---|---|---|---|---|---|
| **ETL Pipeline** | 2.06ms | 0.29ms | 0.40ms | 2.47ms | 2.37ms | 1.89ms | 2.10ms | 0.61ms | **Transit/Rust** (7.2x faster) |
| **Text Analysis** | 15.78ms | 0.71ms | 0.41ms | 14.30ms | 26.62ms | 11.86ms | 12.16ms | 2.52ms | **Transit/Java** (38.1x faster) |
| **Matrix Multiply** | 28.85ms | 1.19ms | 1.24ms | 20.18ms | 54.59ms | 18.27ms | 18.28ms | 3.80ms | **Transit/Rust** (24.2x faster) |
| **Matrix Determinant** | 22.72ms | 0.08ms | 0.11ms | 27.36ms | 37.44ms | 25.01ms | 26.19ms | 2.06ms | **Transit/Rust** (283.8x faster) |
| **Graph Processing** | 10.55ms | 0.37ms | 0.51ms | 6.53ms | 13.36ms | 6.03ms | 5.56ms | 2.17ms | **Transit/Rust** (28.4x faster) |
| **Fibonacci Memo** | 1.14ms | 0.05ms | 0.08ms | 1.00ms | 0.24ms | 0.09ms | 0.55ms | 0.09ms | **Transit/Rust** (22.7x faster) |
| **SHA-256 Hashing** | 5.20ms | 0.06ms | 0.16ms | 5.67ms | 9.19ms | 4.89ms | 5.17ms | 0.69ms | **Transit/Rust** (93.8x faster) |

#### Concurrent Results (10 parallel requests)

| Operation | FastAPI | Transit/Rust | Transit/Java | gRPC | Thrift | ZeroMQ | Redis | PyO3 | Winner |
|---|---|---|---|---|---|---|---|---|---|
| **ETL Pipeline** | 15.35ms | 1.44ms | 1.89ms | 13.16ms | 6.55ms | 1.26ms | 3.65ms | 1.08ms | **PyO3** (14.2x faster) |
| **Text Analysis** | 131.42ms | 3.61ms | 3.99ms | 177.89ms | 174.62ms | 6.38ms | 61.35ms | 9.90ms | **Transit/Rust** (36.4x faster) |
| **Matrix Multiply** | 227.63ms | 5.83ms | 7.24ms | 222.78ms | 239.70ms | 10.55ms | 80.37ms | 17.94ms | **Transit/Rust** (39.0x faster) |
| **Matrix Determinant** | 200.48ms | 0.54ms | 1.91ms | 369.21ms | 400.01ms | 8.91ms | 157.44ms | 10.77ms | **Transit/Rust** (374.5x faster) |
| **Graph Processing** | 91.94ms | 2.07ms | 3.32ms | 63.66ms | 56.09ms | 2.45ms | 30.37ms | 7.19ms | **Transit/Rust** (44.3x faster) |
| **Fibonacci Memo** | 4.30ms | 0.11ms | 1.77ms | 3.40ms | 1.50ms | 0.09ms | 1.01ms | 0.15ms | **ZeroMQ** (46.6x faster) |
| **SHA-256 Hashing** | 46.42ms | 0.26ms | 1.86ms | 54.91ms | 46.18ms | 1.71ms | 28.53ms | 4.68ms | **Transit/Rust** (180.1x faster) |

### Chat Server Benchmark


#### Chat Server Results (Serial — single request, 100 iterations)

| Operation | FastAPI | Transit/Rust | Transit/Python | Transit/Java | gRPC | Thrift | Unix Sock | Subprocess | ZeroMQ | Redis | Winner |
|-----------|---------|--------------|----------------|--------------|------|--------|-----------|------------|--------|-------|--------|
| Message Send Pipeline (auth+mod+route+persist) | 1.29ms | 0.01ms | 0.17ms | 0.26ms | 0.17ms | 0.13ms | 0.28ms | 0.05ms | 0.11ms | 0.57ms | **Transit/Rust** (117.3x faster) |
| Fan-out Delivery (50 recipients) | 0.86ms | 0.01ms | 0.20ms | 0.16ms | 0.25ms | 0.14ms | 0.32ms | 0.05ms | 0.12ms | 0.45ms | **Transit/Rust** (85.9x faster) |
| Session Validation | 0.87ms | 0.00ms | 0.15ms | 0.12ms | 0.19ms | 0.13ms | 0.20ms | 0.04ms | 0.12ms | 0.45ms | **Transit/Rust** (238.6x faster) |
| Typing Indicator | 0.92ms | 0.01ms | 0.13ms | 0.12ms | 0.16ms | 0.10ms | 0.26ms | 0.06ms | 0.10ms | 0.44ms | **Transit/Rust** (166.3x faster) |
| Read Receipt | 0.70ms | 0.00ms | 0.11ms | 0.11ms | 0.16ms | 0.09ms | 0.22ms | 0.04ms | 0.11ms | 0.48ms | **Transit/Rust** (331.0x faster) |
| Presence Update (30 contacts) | 0.85ms | 0.02ms | 0.21ms | 0.19ms | 0.13ms | 0.09ms | 0.24ms | 0.05ms | 0.13ms | 0.38ms | **Transit/Rust** (36.0x faster) |
| AI Content Moderation | 0.85ms | 0.00ms | 0.16ms | 0.14ms | 0.12ms | 0.08ms | 0.22ms | 0.04ms | 0.10ms | 0.59ms | **Transit/Rust** (173.2x faster) |
| Message Search (1000 messages) | 5.19ms | 1.01ms | 3.71ms | 0.96ms | 1.32ms | 1.21ms | 2.50ms | 2.17ms | 2.74ms | 3.27ms | **Transit/Java** (5.4x faster) |
| Analytics Pipeline (500 events) | 2.72ms | 0.47ms | 1.89ms | 0.59ms | 0.84ms | 0.56ms | 1.19ms | 1.30ms | 1.74ms | 2.11ms | **Transit/Rust** (5.8x faster) |
| Notification Builder (20 users) | 0.98ms | 0.02ms | 0.14ms | 0.18ms | 0.12ms | 0.09ms | 0.22ms | 0.06ms | 0.13ms | 0.50ms | **Transit/Rust** (42.5x faster) |
| User Lookup | 0.74ms | 0.00ms | 0.14ms | 0.12ms | 0.14ms | 0.11ms | 0.25ms | 0.04ms | 0.10ms | 0.53ms | **Transit/Rust** (313.5x faster) |
| Channel History (50 messages) | 1.86ms | 0.00ms | 0.12ms | 0.12ms | 0.09ms | 0.07ms | 0.20ms | 0.05ms | 0.11ms | 0.54ms | **Transit/Rust** (374.9x faster) |


## Quick Start

### 1. Install

```bash
bun install -g transit-cli # You also also npm but bun is recommended
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
