# Transit

![Bundle](https://img.shields.io/bundlephobia/minzip/@sabeeirsharrma/transit)

**Languages that just talk to each other. No API. No middleman.**

Transit lets you write functions in Rust, Java, Python, C, or C++ and then call them from JavaScript as if they were normal async functions. No REST APIs, no JSON schemas, no glue code. Just write your logic in the language that fits the job, and Transit handles the rest.

For full docs, go to: <https://sabeeir.qd.je/transit>

```js
import { transit } from "transit"
import { resolve } from "node:path"

const __dirname = import.meta.dirname

// Point Transit at your codebases
const rs = transit.rust(resolve(__dirname, "./rust"))
const jv = transit.java(resolve(__dirname, "./java/src/main/java"))
const py = transit.python(resolve(__dirname, "./python"))
const c  = transit.c(resolve(__dirname, "./c"))
const cpp = transit.cpp(resolve(__dirname, "./cpp"))

// Call functions across language boundaries
const rustResult = await rs.processFile({ id: "job-001", bytes: [72, 101, 108] })
const javaResult = await jv.handleSpecialized(rustResult)
const pythonResult = await py.analyzeData(javaResult)
const cResult = await c.processChunk({ data: [1, 2, 3] })
const cppResult = await cpp.fastCompute({ n: 42 })
```

## Transit - Benchmarks

Below are the results of an automated benchmark test comparing Transit against FastAPI, gRPC, Thrift, Unix Socket, Subprocess, ZeroMQ, Redis Pub/Sub, and PyO3.
These benchmarks check **Operations performed per second**, **Speed of output** and **Correctness of output (To prevent inflated/unfair numbers)**.

**Results may vary depending on hardware and setup**
If you would like to benchmark on your own hardware, you can switch to the [Benchmark Branch](https://github.com/sabeeirsharrma/transit/tree/benchmark/)

**Performed on:**

- CPU: Ryzen 7 4800H @ 2.90GHz
- GPU0: NVIDIA GTX 1650Ti [Discrete]
- GPU1: AMD Radeon Vega Series / Radeon Vega Mobile Series [Integrated]
- RAM: 32GB DDR4 @ 3200MHz [SODIMM]

**Expected:**

- **Python benches slow due to serialization and slow processing (typical for python)**
- **Redis gives no result due to server errors/inavailability**
- **Benchmarks differ on custom scripts due to missing output correctness validation**

### Compute Benchmarks

#### Serial (single request, 100 iterations)

| Operation | FastAPI (ms) | FastAPI (ops/s) | Transit/Rust (ms) | Transit/Rust (ops/s) | Transit/Python (ms) | Transit/Python (ops/s) | Transit/Java (ms) | Transit/Java (ops/s) | gRPC (ms) | gRPC (ops/s) | Thrift (ms) | Thrift (ops/s) | Unix Socket (ms) | Unix Socket (ops/s) | Subprocess (ms) | Subprocess (ops/s) | ZeroMQ (ms) | ZeroMQ (ops/s) | Redis (ms) | Redis (ops/s) | PyO3 (ms) | PyO3 (ops/s) | Winner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ETL Pipeline (1000 rows) | 1.92 | 521.7 | 0.29 | 3390.7 | 1.86 | 537.8 | 0.34 | 2917.3 | 2.99 | 334.9 | 2.31 | 433.4 | 1.62 | 616.6 | 0.85 | 1180.5 | 1.26 | 794.5 | N/A | N/A | 0.67 | 1492.0 | **Transit/Rust** (6.5x faster) |
| Text Analysis (5000 words) | 16.15 | 61.9 | 0.70 | 1424.6 | 14.26 | 70.1 | 0.57 | 1755.6 | 13.37 | 74.8 | 28.02 | 35.7 | 15.25 | 65.6 | 11.54 | 86.6 | 11.57 | 86.5 | N/A | N/A | 2.54 | 394.4 | **Transit/Java** (28.4x faster) |
| Matrix Multiply (50×50) | 27.51 | 36.4 | 0.98 | 1020.9 | 17.63 | 56.7 | 1.02 | 980.4 | 19.12 | 52.3 | 48.96 | 20.4 | 19.04 | 52.5 | 17.05 | 58.7 | 17.42 | 57.4 | N/A | N/A | 4.69 | 213.3 | **Transit/Rust** (28.1x faster) |
| Matrix Determinant (8×8) | 22.20 | 45.0 | 0.09 | 11535.1 | 21.81 | 45.9 | 0.03 | 37828.4 | 26.97 | 37.1 | 33.04 | 30.3 | 33.06 | 30.3 | 25.48 | 39.3 | 25.65 | 39.0 | N/A | N/A | 2.00 | 500.8 | **Transit/Java** (840.0x faster) |
| Graph Processing (500 nodes) | 10.24 | 97.7 | 0.24 | 4213.6 | 6.81 | 146.8 | 0.35 | 2842.7 | 6.79 | 147.2 | 17.02 | 58.8 | 9.89 | 101.1 | 4.84 | 206.4 | 5.61 | 178.2 | N/A | N/A | 1.95 | 512.8 | **Transit/Rust** (43.1x faster) |
| Fibonacci Memo (n=38) | 1.14 | 877.3 | 0.04 | 28030.8 | 0.19 | 5278.0 | 0.01 | 67279.5 | 1.63 | 612.9 | 0.32 | 3092.3 | 0.26 | 3916.9 | 0.08 | 12140.9 | 0.19 | 5310.8 | N/A | N/A | 0.03 | 29726.5 | **Transit/Java** (76.7x faster) |
| SHA-256 Hashing (10K rounds) | 5.00 | 200.0 | 0.02 | 52708.6 | 4.28 | 233.5 | 0.01 | 76779.6 | 5.66 | 176.7 | 11.69 | 85.6 | 10.65 | 93.9 | 4.34 | 230.7 | 4.50 | 222.0 | N/A | N/A | 0.97 | 1030.2 | **Transit/Java** (383.8x faster) |

#### Concurrent (undefined parallel requests)

| Operation | FastAPI (ms) | FastAPI (ops/s) | Transit/Rust (ms) | Transit/Rust (ops/s) | Transit/Python (ms) | Transit/Python (ops/s) | Transit/Java (ms) | Transit/Java (ops/s) | gRPC (ms) | gRPC (ops/s) | Thrift (ms) | Thrift (ops/s) | Unix Socket (ms) | Unix Socket (ops/s) | Subprocess (ms) | Subprocess (ops/s) | ZeroMQ (ms) | ZeroMQ (ops/s) | Redis (ms) | Redis (ops/s) | PyO3 (ms) | PyO3 (ops/s) | Winner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ETL Pipeline (1000 rows) | 12.08 | 82.8 | 1.32 | 758.4 | 4.88 | 204.8 | 0.29 | 3462.7 | 13.85 | 72.2 | 7.82 | 127.9 | 5.58 | 179.1 | 2.07 | 482.9 | 1.47 | 680.0 | N/A | N/A | 1.81 | 551.6 | **Transit/Java** (41.8x faster) |
| Text Analysis (5000 words) | 123.25 | 8.1 | 3.39 | 294.6 | 265.14 | 3.8 | 0.54 | 1846.5 | 203.51 | 4.9 | 224.69 | 4.5 | 190.27 | 5.3 | 55.41 | 18.0 | 6.24 | 160.4 | N/A | N/A | 8.25 | 121.2 | **Transit/Java** (227.6x faster) |
| Matrix Multiply (50×50) | 224.40 | 4.5 | 5.75 | 174.1 | 233.88 | 4.3 | 0.94 | 1063.1 | 301.93 | 3.3 | 276.69 | 3.6 | 249.19 | 4.0 | 70.60 | 14.2 | 9.89 | 101.2 | N/A | N/A | 17.82 | 56.1 | **Transit/Java** (238.6x faster) |
| Matrix Determinant (8×8) | 193.16 | 5.2 | 0.49 | 2022.5 | 442.52 | 2.3 | 0.04 | 23147.6 | 494.71 | 2.0 | 519.93 | 1.9 | 411.62 | 2.4 | 139.03 | 7.2 | 8.28 | 120.8 | N/A | N/A | 9.99 | 100.1 | **Transit/Java** (4471.3x faster) |
| Graph Processing (500 nodes) | 80.25 | 12.5 | 2.16 | 463.6 | 115.21 | 8.7 | 0.37 | 2667.9 | 85.98 | 11.6 | 80.49 | 12.4 | 39.43 | 25.4 | 21.37 | 46.8 | 3.30 | 302.8 | N/A | N/A | 5.32 | 188.0 | **Transit/Java** (214.1x faster) |
| Fibonacci Memo (n=38) | 3.66 | 273.1 | 0.10 | 10400.0 | 0.86 | 1166.6 | 0.01 | 122039.9 | 4.34 | 230.3 | 1.16 | 860.5 | 0.65 | 1538.3 | 0.18 | 5469.2 | 0.09 | 11258.4 | N/A | N/A | 0.14 | 7290.8 | **Transit/Java** (446.9x faster) |
| SHA-256 Hashing (10K rounds) | 40.34 | 24.8 | 0.26 | 3862.8 | 81.12 | 12.3 | 0.02 | 50664.5 | 84.08 | 11.9 | 84.15 | 11.9 | 30.57 | 32.7 | 22.99 | 43.5 | 1.79 | 560.2 | N/A | N/A | 4.38 | 228.5 | **Transit/Java** (2043.6x faster) |

### Chat Server Benchmark

> Generated: 2026-08-01T08:19:02.997Z | Mode: Serial & Concurrent | Iterations: 100 | Warmup: 10

#### Serial (single request, 100 iterations)

| Operation | FastAPI | Transit/Rust | Transit/Python | Transit/Java | gRPC | Thrift | Unix Sock | Subprocess | ZeroMQ | Redis | Winner |
| ----------- | --------- | -------------- | ---------------- | -------------- | ------ | -------- | ----------- | ------------ | -------- | ------- | -------- |
| Message Send Pipeline (auth+mod+route+persist) | 0.77ms | 0.00ms | 0.10ms | 0.01ms | 0.15ms | 0.09ms | 0.18ms | 0.04ms | 0.08ms | N/Ams | **Transit/Rust** (235.6x faster) |
| Fan-out Delivery (50 recipients) | 0.54ms | 0.01ms | 0.30ms | 0.02ms | 0.18ms | 0.10ms | 0.26ms | 0.08ms | 0.14ms | N/Ams | **Transit/Rust** (48.1x faster) |
| Session Validation | 0.83ms | 0.00ms | 0.15ms | 0.01ms | 0.13ms | 0.08ms | 0.26ms | 0.05ms | 0.10ms | N/Ams | **Transit/Rust** (387.0x faster) |
| Typing Indicator | 1.10ms | 0.00ms | 0.19ms | 0.01ms | 0.24ms | 0.07ms | 0.17ms | 0.04ms | 0.10ms | N/Ams | **Transit/Rust** (618.4x faster) |
| Read Receipt | 0.69ms | 0.00ms | 0.20ms | 0.01ms | 0.20ms | 0.08ms | 0.22ms | 0.03ms | 0.11ms | N/Ams | **Transit/Rust** (303.1x faster) |
| Presence Update (30 contacts) | 0.91ms | 0.01ms | 0.21ms | 0.01ms | 0.13ms | 0.10ms | 0.21ms | 0.04ms | 0.10ms | N/Ams | **Transit/Java** (76.0x faster) |
| AI Content Moderation | 0.40ms | 0.01ms | 0.14ms | 0.01ms | 0.08ms | 0.06ms | 0.22ms | 0.04ms | 0.14ms | N/Ams | **Transit/Rust** (80.3x faster) |
| Message Search (1000 messages) | 5.45ms | 0.93ms | 4.37ms | 0.67ms | 1.04ms | 0.88ms | 2.49ms | 2.61ms | 2.43ms | N/Ams | **Transit/Java** (8.1x faster) |
| Analytics Pipeline (500 events) | 2.04ms | 0.43ms | 1.75ms | 0.32ms | 0.61ms | 0.48ms | 1.33ms | 1.24ms | 1.43ms | N/Ams | **Transit/Java** (6.3x faster) |
| Notification Builder (20 users) | 1.38ms | 0.01ms | 0.23ms | 0.02ms | 0.23ms | 0.07ms | 0.19ms | 0.03ms | 0.13ms | N/Ams | **Transit/Rust** (118.0x faster) |
| User Lookup | 0.77ms | 0.01ms | 0.14ms | 0.01ms | 0.19ms | 0.08ms | 0.24ms | 0.04ms | 0.11ms | N/Ams | **Transit/Rust** (139.1x faster) |
| Channel History (50 messages) | 1.44ms | 0.00ms | 0.14ms | 0.01ms | 0.23ms | 0.11ms | 0.17ms | 0.05ms | 0.09ms | N/Ams | **Transit/Rust** (943.2x faster) |

#### Concurrent (10 parallel requests)

| Operation | FastAPI | Transit/Rust | Transit/Python | Transit/Java | gRPC | Thrift | Unix Sock | Subprocess | ZeroMQ | Redis | Winner |
| ----------- | --------- | -------------- | ---------------- | -------------- | ------ | -------- | ----------- | ------------ | -------- | ------- | -------- |
| Message Send Pipeline (auth+mod+route+persist) | 3.01ms | 0.03ms | 0.90ms | 0.01ms | 0.43ms | 0.35ms | 0.87ms | 0.06ms | 0.10ms | N/Ams | **Transit/Java** (446.8x faster) |
| Fan-out Delivery (50 recipients) | 2.01ms | 0.09ms | 1.03ms | 0.04ms | 0.72ms | 0.42ms | 0.92ms | 0.10ms | 0.16ms | N/Ams | **Transit/Java** (46.3x faster) |
| Session Validation | 2.70ms | 0.04ms | 1.11ms | 0.01ms | 1.06ms | 0.40ms | 0.84ms | 0.06ms | 0.11ms | N/Ams | **Transit/Java** (209.4x faster) |
| Typing Indicator | 2.74ms | 0.03ms | 1.35ms | 0.01ms | 0.78ms | 0.35ms | 0.82ms | 0.06ms | 0.09ms | N/Ams | **Transit/Java** (201.4x faster) |
| Read Receipt | 1.56ms | 0.01ms | 0.84ms | 0.01ms | 0.41ms | 0.35ms | 0.77ms | 0.07ms | 100.16ms | N/Ams | **Transit/Rust** (139.9x faster) |
| Presence Update (30 contacts) | 5.44ms | 0.12ms | 1.47ms | 0.03ms | 1.29ms | 0.52ms | 0.84ms | 0.08ms | 0.10ms | N/Ams | **Transit/Java** (161.2x faster) |
| AI Content Moderation | 2.27ms | 0.02ms | 0.80ms | 0.01ms | 0.41ms | 0.39ms | 0.94ms | 0.08ms | 0.07ms | N/Ams | **Transit/Java** (377.9x faster) |
| Message Search (1000 messages) | 26.25ms | 5.20ms | 15.02ms | 0.66ms | 5.89ms | 4.70ms | 8.45ms | 5.42ms | 4.92ms | N/Ams | **Transit/Java** (39.7x faster) |
| Analytics Pipeline (500 events) | 12.99ms | 2.19ms | 5.90ms | 0.32ms | 3.42ms | 2.18ms | 5.11ms | 2.51ms | 2.43ms | N/Ams | **Transit/Java** (40.2x faster) |
| Notification Builder (20 users) | 6.35ms | 0.05ms | 0.57ms | 0.01ms | 0.44ms | 0.39ms | 0.91ms | 0.07ms | 0.09ms | N/Ams | **Transit/Java** (545.4x faster) |
| User Lookup | 2.02ms | 0.01ms | 0.76ms | 0.01ms | 0.38ms | 0.33ms | 0.72ms | 0.06ms | 0.06ms | N/Ams | **Transit/Java** (344.0x faster) |
| Channel History (50 messages) | 9.27ms | 0.03ms | 1.07ms | 0.01ms | 1.09ms | 0.57ms | 0.75ms | 0.06ms | 0.07ms | N/Ams | **Transit/Java** (691.9x faster) |

## Quick Start

### 1. Install

```bash
bun install -g transit-cli # You can also use npm but bun is recommended
```

Requirements:

- **Node.js** >= 20
- **Rust** toolchain (for scanner + Rust addons)
- **Java** JDK 21+ (if using Java)
- **Python** 3.10+ (if using Python)
- **C/C++** compiler (if using C/C++ — GCC, Clang, or MSVC)
- **bun** (recommended) or npm

### 2. Write functions in any supported language

**Rust** - write normal `pub fn` functions:

```rust
// rust/src/lib.rs
pub fn process_job(data: Vec<u8>) -> String {
    format!("Processed {} bytes", data.len())
}
```

**Java** - write public methods that take and return JSON strings:

```java
// java/src/main/java/com/example/App.java
public class App {
    public String processJob(String argsJson) {
        return "{\"output\":\"processed\"}";
    }
}
```

**Python** - write functions that take and return JSON strings:

```python
# python/service.py
def process_data(args_json):
    return '{"output": "processed"}'
```

**C** - write functions that take and return JSON strings:

```c
// c/src/addon.c
#include <transit_c_glue.gen.h>

const char* process_chunk(const char* args_json) {
    return "{\"output\": \"processed\"}";
}
```

**C++** - write functions that take and return JSON strings:

```cpp
// cpp/src/addon.cpp
#include <transit_cpp_glue.gen.h>

std::string fast_compute(const std::string& args_json) {
    return "{\"output\": \"processed\"}";
}
```

### 3. Call from JS

```js
import { transit } from "transit"
import { resolve } from "node:path"

const __dirname = import.meta.dirname

const rs = transit.rust(resolve(__dirname, "./rust"))
const jv = transit.java(resolve(__dirname, "./java/src/main/java"))
const py = transit.python(resolve(__dirname, "./python"))
const c  = transit.c(resolve(__dirname, "./c"))
const cpp = transit.cpp(resolve(__dirname, "./cpp"))

// Call functions - they appear as normal async methods
await rs.processJob([72, 101, 108])       // → Rust
await jv.processJob({"data": [1, 2]})     // → Java
await py.processData({"items": [10, 20]}) // → Python
await c.processChunk({"data": [1, 2, 3]}) // → C
await cpp.fastCompute({"n": 42})          // → C++
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
// c (./c): 1 functions
//   - processChunk [tier 1]
// cpp (./cpp): 1 functions
//   - fastCompute [tier 1]
```

## How It Works

Transit has three components:

1. **Scanner:** Uses tree-sitter to scan your source code and find exported functions automatically
2. **Bridges:** Transport layers that connect JS to each language:
   - **Rust/C/C++:** In-process native addon (zero overhead)
   - **Java:** Persistent TCP process on localhost
   - **Python:** Persistent TCP process on localhost
3. **Proxy:** A JS `Proxy` that makes cross-language calls look like normal function calls

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
transit.rust() / transit.java() / transit.python() / transit.c() / transit.cpp()
    │
    ▼
Proxy resolves function name against scanner manifest
    │
    ├──► Rust/C/C++: in-process native addon (.node)
    ├──► Java: TCP binary protocol → JVM resident process
    └──► Python: TCP binary protocol → Python resident process
```

## Project Structure

```
transit/
  packages/
    transit-js/                 # Public API - transit.rust(), transit.java(), transit.python(), transit.c(), transit.cpp()
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
  templates/
    c/                          # C addon templates (binding.gyp, example source)
    cpp/                        # C++ addon templates (binding.gyp, example source)
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

- [Getting Started](docs/getting-started.md) - step-by-step walkthrough for beginners
- [API Reference](docs/api-reference.md) - full API documentation
- [Architecture](docs/architecture.md) - system design deep dive
- [Binary Protocol](docs/binary-protocol.md) - wire format for JS ↔ Java/Python
- [Export Tiers](docs/export-tiers.md) - function discovery system
- [Contributing](docs/contributing.md) - development guide

## License

MIT
