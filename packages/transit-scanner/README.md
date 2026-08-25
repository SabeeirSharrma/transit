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

> Generated: 2026-08-15T09:21:26.096Z | Mode: Serial & Concurrent | Iterations: 100 | Warmup: 10

#### Correctness Validation

| Operation | Status | Backends Checked | Notes |
| ----------- | -------- | ------------------ | ------- |
| ETL Pipeline (1000 rows) | WARN | 7 | grpc: 16 diffs; thrift: 16 diffs; unix_socket: 16 diffs; subprocess: 16 diffs; zeromq: 16 diffs; pyo3: 16 diffs |
| Text Analysis (5000 words) | WARN | 7 | grpc: 20 diffs; thrift: 20 diffs; unix_socket: 20 diffs; subprocess: 20 diffs; zeromq: 20 diffs; pyo3: 20 diffs |
| Matrix Multiply (50×50) | WARN | 7 | grpc: 2500 diffs; thrift: 2500 diffs; unix_socket: 2500 diffs; subprocess: 2500 diffs; zeromq: 2500 diffs; pyo3: 2500 diffs |
| Matrix Determinant (8×8) | WARN | 7 | grpc: 1 diffs; thrift: 1 diffs; unix_socket: 1 diffs; subprocess: 1 diffs; zeromq: 1 diffs; pyo3: 1 diffs |
| Graph Processing (500 nodes) | WARN | 7 | grpc: 4 diffs; thrift: 4 diffs; unix_socket: 4 diffs; subprocess: 4 diffs; zeromq: 4 diffs; pyo3: 974 diffs |
| Fibonacci Memo (n=38) | PASS | 7 | All backends match |
| SHA-256 Hashing (10K rounds) | PASS | 7 | All backends match |

#### Serial (single request, 100 iterations)

| Operation | FastAPI (ms) | FastAPI (ops/s) | Transit/Rust (ms) | Transit/Rust (ops/s) | Transit/Python (ms) | Transit/Python (ops/s) | Transit/Java (ms) | Transit/Java (ops/s) | Transit/C (ms) | Transit/C (ops/s) | Transit/C++ (ms) | Transit/C++ (ops/s) | gRPC (ms) | gRPC (ops/s) | Thrift (ms) | Thrift (ops/s) | Unix Socket (ms) | Unix Socket (ops/s) | Subprocess (ms) | Subprocess (ops/s) | ZeroMQ (ms) | ZeroMQ (ops/s) | Redis (ms) | Redis (ops/s) | PyO3 (ms) | PyO3 (ops/s) | Winner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ETL Pipeline (1000 rows) | 3.62 | 276.0 | 0.35 | 2847.9 | 1.48 | 675.5 | 0.31 | 3214.3 | 0.19 | 5166.3 | 0.18 | 5439.4 | 3.26 | 307.1 | 2.10 | 476.3 | 0.98 | 1022.3 | 0.88 | 1134.7 | 1.47 | 681.3 | N/A | N/A | 0.88 | 1136.6 | **Transit/C++** (19.7x faster) |
| Text Analysis (5000 words) | 16.10 | 62.1 | 0.46 | 2182.6 | 15.11 | 66.2 | 0.66 | 1524.9 | 6.78 | 147.5 | 2.70 | 370.6 | 13.68 | 73.1 | 27.74 | 36.0 | 16.18 | 61.8 | 11.99 | 83.4 | 12.10 | 82.6 | N/A | N/A | 2.47 | 404.9 | **Transit/Rust** (35.1x faster) |
| Matrix Multiply (50×50) | 28.38 | 35.2 | 1.11 | 904.8 | 18.14 | 55.1 | 1.02 | 985.0 | 2.34 | 427.1 | 2.01 | 496.3 | 20.75 | 48.2 | 46.52 | 21.5 | 22.81 | 43.8 | 17.73 | 56.4 | 17.78 | 56.2 | N/A | N/A | 5.69 | 175.7 | **Transit/Java** (28.0x faster) |
| Matrix Determinant (8×8) | 23.05 | 43.4 | 0.03 | 28690.0 | 22.54 | 44.4 | 0.05 | 18906.8 | 0.43 | 2329.5 | 0.66 | 1518.2 | 29.94 | 33.4 | 39.73 | 25.2 | 33.48 | 29.9 | 26.22 | 38.1 | 26.51 | 37.7 | N/A | N/A | 2.09 | 479.4 | **Transit/Rust** (661.3x faster) |
| Graph Processing (500 nodes) | 10.96 | 91.2 | 0.17 | 5890.7 | 6.49 | 154.2 | 0.37 | 2683.9 | 0.43 | 2299.1 | 0.44 | 2253.3 | 7.36 | 135.9 | 17.04 | 58.7 | 8.79 | 113.7 | 5.65 | 177.0 | 5.28 | 189.4 | N/A | N/A | 1.81 | 551.9 | **Transit/Rust** (64.6x faster) |
| Fibonacci Memo (n=38) | 0.72 | 1389.9 | 0.04 | 23491.0 | 0.10 | 9971.1 | 0.01 | 124731.8 | 0.01 | 186745.2 | 0.01 | 163875.6 | 1.52 | 659.6 | 0.31 | 3236.7 | 0.26 | 3796.4 | 0.07 | 13422.0 | 0.10 | 9632.1 | N/A | N/A | 0.05 | 19549.7 | **Transit/C** (134.4x faster) |
| SHA-256 Hashing (10K rounds) | 5.48 | 182.6 | 0.02 | 41867.3 | 4.70 | 212.6 | 0.01 | 141353.3 | 0.83 | 1200.6 | 0.88 | 1133.3 | 6.23 | 160.4 | 8.54 | 117.0 | 7.86 | 127.2 | 4.70 | 212.9 | 4.74 | 210.9 | N/A | N/A | 1.00 | 997.6 | **Transit/Java** (774.0x faster) |

#### Concurrent (undefined parallel requests)

| Operation | FastAPI (ms) | FastAPI (ops/s) | Transit/Rust (ms) | Transit/Rust (ops/s) | Transit/Python (ms) | Transit/Python (ops/s) | Transit/Java (ms) | Transit/Java (ops/s) | Transit/C (ms) | Transit/C (ops/s) | Transit/C++ (ms) | Transit/C++ (ops/s) | gRPC (ms) | gRPC (ops/s) | Thrift (ms) | Thrift (ops/s) | Unix Socket (ms) | Unix Socket (ops/s) | Subprocess (ms) | Subprocess (ops/s) | ZeroMQ (ms) | ZeroMQ (ops/s) | Redis (ms) | Redis (ops/s) | PyO3 (ms) | PyO3 (ops/s) | Winner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ETL Pipeline (1000 rows) | 9.77 | 102.4 | 1.42 | 702.6 | 5.26 | 190.0 | 0.21 | 4830.1 | 1.17 | 851.4 | 1.10 | 906.1 | 10.39 | 96.2 | 6.96 | 143.8 | 5.06 | 197.5 | 2.46 | 406.3 | 1.30 | 772.2 | N/A | N/A | 2.00 | 500.4 | **Transit/Java** (47.2x faster) |
| Text Analysis (5000 words) | 142.11 | 7.0 | 3.71 | 269.5 | 238.16 | 4.2 | 0.48 | 2083.6 | 39.50 | 25.3 | 15.00 | 66.7 | 169.74 | 5.9 | 224.13 | 4.5 | 153.13 | 6.5 | 60.86 | 16.4 | 6.96 | 143.6 | N/A | N/A | 9.21 | 108.6 | **Transit/Java** (296.1x faster) |
| Matrix Multiply (50×50) | 240.68 | 4.2 | 6.47 | 154.6 | 233.05 | 4.3 | 1.16 | 861.5 | 12.36 | 80.9 | 11.40 | 87.7 | 285.44 | 3.5 | 307.64 | 3.3 | 275.66 | 3.6 | 73.54 | 13.6 | 11.13 | 89.9 | N/A | N/A | 19.77 | 50.6 | **Transit/Java** (207.3x faster) |
| Matrix Determinant (8×8) | 208.09 | 4.8 | 0.50 | 2001.6 | 450.87 | 2.2 | 0.07 | 15135.9 | 1.86 | 536.8 | 3.65 | 274.1 | 520.80 | 1.9 | 616.82 | 1.6 | 369.29 | 2.7 | 149.82 | 6.7 | 8.59 | 116.4 | N/A | N/A | 11.37 | 88.0 | **Transit/Java** (3149.6x faster) |
| Graph Processing (500 nodes) | 91.00 | 11.0 | 2.10 | 476.6 | 107.36 | 9.3 | 0.19 | 5331.9 | 2.90 | 344.5 | 2.48 | 403.1 | 82.69 | 12.1 | 72.06 | 13.9 | 43.41 | 23.0 | 24.24 | 41.3 | 3.05 | 327.7 | N/A | N/A | 5.82 | 171.8 | **Transit/Java** (485.2x faster) |
| Fibonacci Memo (n=38) | 2.98 | 335.8 | 0.15 | 6664.8 | 1.16 | 859.8 | 0.01 | 108312.2 | 0.03 | 29227.7 | 0.04 | 27929.5 | 3.37 | 296.4 | 1.19 | 840.5 | 0.79 | 1258.1 | 0.13 | 7601.4 | 100.21 | 10.0 | N/A | N/A | 0.27 | 3651.3 | **Transit/Java** (322.5x faster) |
| SHA-256 Hashing (10K rounds) | 43.64 | 22.9 | 0.39 | 2575.6 | 77.50 | 12.9 | 0.02 | 43158.5 | 4.24 | 235.8 | 4.75 | 210.7 | 78.93 | 12.7 | 80.96 | 12.4 | 30.93 | 32.3 | 26.63 | 37.6 | 0.26 | 3867.9 | N/A | N/A | 3.65 | 274.1 | **Transit/Java** (1883.3x faster) |

### Chat Server Benchmark

> Generated: 2026-08-15T09:37:15.500Z | Mode: Serial & Concurrent | Iterations: 100 | Warmup: 10

#### Serial (single request, 100 iterations)

| Operation | FastAPI | Transit/Rust | Transit/Python | Transit/Java | Transit/C | Transit/C++ | gRPC | Thrift | Unix Sock | Subprocess | ZeroMQ | Redis | Winner |
| ----------- | --------- | -------------- | ---------------- | -------------- | ----------- | ------------- | ------ | -------- | ----------- | ------------ | -------- | ------- | -------- |
| Message Send Pipeline (auth+mod+route+persist) | 0.84ms | 0.01ms | 0.20ms | 0.01ms | 0.01ms | 0.01ms | 1.28ms | 0.34ms | 0.22ms | 0.07ms | 0.15ms | N/Ams | **Transit/Rust** (145.6x faster) |
| Fan-out Delivery (50 recipients) | 0.60ms | 0.01ms | 0.23ms | 0.02ms | 0.01ms | 0.01ms | 0.97ms | 0.35ms | 0.29ms | 0.10ms | 0.26ms | N/Ams | **Transit/Rust** (51.5x faster) |
| Session Validation | 0.58ms | 0.00ms | 0.17ms | 0.01ms | 0.01ms | 0.01ms | 1.08ms | 0.40ms | 0.44ms | 0.07ms | 0.17ms | N/Ams | **Transit/Rust** (147.6x faster) |
| Typing Indicator | 0.94ms | 0.00ms | 0.10ms | 0.01ms | 0.01ms | 0.01ms | 1.15ms | 0.45ms | 0.27ms | 0.07ms | 0.15ms | N/Ams | **Transit/Rust** (231.6x faster) |
| Read Receipt | 0.77ms | 0.00ms | 0.14ms | 0.01ms | 0.01ms | 0.01ms | 1.18ms | 0.54ms | 0.34ms | 0.05ms | 0.15ms | N/Ams | **Transit/Rust** (203.9x faster) |
| Presence Update (30 contacts) | 0.77ms | 0.01ms | 0.20ms | 0.02ms | 0.02ms | 0.01ms | 1.37ms | 0.47ms | 0.45ms | 0.08ms | 0.13ms | N/Ams | **Transit/Rust** (52.6x faster) |
| AI Content Moderation | 0.95ms | 0.00ms | 0.18ms | 0.01ms | 0.01ms | 0.01ms | 1.34ms | 0.45ms | 0.26ms | 0.05ms | 0.14ms | N/Ams | **Transit/Rust** (263.6x faster) |
| Message Search (1000 messages) | 2.07ms | 1.12ms | 3.47ms | 1.11ms | 0.43ms | 0.41ms | 2.82ms | 4.83ms | 2.51ms | 2.54ms | 2.78ms | N/Ams | **Transit/C++** (5.0x faster) |
| Analytics Pipeline (500 events) | 2.21ms | 1.31ms | 2.26ms | 0.98ms | 0.79ms | 0.80ms | 2.59ms | 3.13ms | 2.01ms | 1.89ms | 2.07ms | N/Ams | **Transit/C** (2.8x faster) |
| Notification Builder (20 users) | 0.59ms | 0.01ms | 0.20ms | 0.01ms | 0.01ms | 0.01ms | 0.97ms | 0.45ms | 0.24ms | 0.05ms | 0.15ms | N/Ams | **Transit/Rust** (82.1x faster) |
| User Lookup | 0.74ms | 0.00ms | 0.10ms | 0.01ms | 0.01ms | 0.01ms | 0.94ms | 0.39ms | 0.25ms | 0.06ms | 0.13ms | N/Ams | **Transit/Rust** (218.8x faster) |
| Channel History (50 messages) | 0.63ms | 0.00ms | 0.14ms | 0.01ms | 0.01ms | 0.01ms | 1.00ms | 0.48ms | 0.59ms | 0.08ms | 0.26ms | N/Ams | **Transit/Rust** (209.2x faster) |

#### Concurrent (10 parallel requests)

| Operation | FastAPI | Transit/Rust | Transit/Python | Transit/Java | Transit/C | Transit/C++ | gRPC | Thrift | Unix Sock | Subprocess | ZeroMQ | Redis | Winner |
| ----------- | --------- | -------------- | ---------------- | -------------- | ----------- | ------------- | ------ | -------- | ----------- | ------------ | -------- | ------- | -------- |
| Message Send Pipeline (auth+mod+route+persist) | 1.80ms | 0.04ms | 0.75ms | 0.01ms | 0.01ms | 0.01ms | 2.80ms | 1.48ms | 0.98ms | 0.14ms | 0.13ms | N/Ams | **Transit/C** (190.9x faster) |
| Fan-out Delivery (50 recipients) | 1.45ms | 0.07ms | 0.79ms | 0.02ms | 0.01ms | 0.01ms | 2.34ms | 1.60ms | 1.00ms | 0.13ms | 0.22ms | N/Ams | **Transit/C** (119.5x faster) |
| Session Validation | 2.00ms | 0.02ms | 0.89ms | 0.01ms | 0.01ms | 0.01ms | 2.45ms | 1.31ms | 0.96ms | 0.09ms | 0.13ms | N/Ams | **Transit/C++** (290.5x faster) |
| Typing Indicator | 1.90ms | 0.03ms | 0.64ms | 0.01ms | 0.01ms | 0.01ms | 3.39ms | 1.38ms | 1.19ms | 0.09ms | 0.16ms | N/Ams | **Transit/C++** (251.7x faster) |
| Read Receipt | 2.01ms | 0.04ms | 0.56ms | 0.01ms | 0.01ms | 0.01ms | 2.08ms | 1.26ms | 1.02ms | 0.13ms | 0.13ms | N/Ams | **Transit/C++** (256.6x faster) |
| Presence Update (30 contacts) | 1.57ms | 0.06ms | 0.82ms | 0.01ms | 0.01ms | 0.01ms | 2.54ms | 1.54ms | 0.92ms | 0.13ms | 0.17ms | N/Ams | **Transit/C** (129.7x faster) |
| AI Content Moderation | 1.51ms | 0.03ms | 0.84ms | 0.01ms | 0.01ms | 0.01ms | 2.85ms | 1.24ms | 0.80ms | 0.08ms | 0.11ms | N/Ams | **Transit/C++** (214.1x faster) |
| Message Search (1000 messages) | 7.57ms | 6.93ms | 16.46ms | 0.77ms | 0.38ms | 0.41ms | 10.89ms | 24.29ms | 9.35ms | 6.59ms | 5.36ms | N/Ams | **Transit/C** (20.0x faster) |
| Analytics Pipeline (500 events) | 9.58ms | 5.54ms | 7.18ms | 1.03ms | 0.83ms | 0.79ms | 9.38ms | 15.23ms | 8.69ms | 6.56ms | 6.18ms | N/Ams | **Transit/C++** (12.1x faster) |
| Notification Builder (20 users) | 1.22ms | 0.04ms | 0.82ms | 0.01ms | 0.01ms | 0.01ms | 2.25ms | 1.25ms | 1.01ms | 0.11ms | 0.20ms | N/Ams | **Transit/C++** (118.4x faster) |
| User Lookup | 1.91ms | 0.03ms | 0.80ms | 0.01ms | 0.01ms | 0.01ms | 3.22ms | 1.23ms | 0.96ms | 0.09ms | 0.12ms | N/Ams | **Transit/Java** (202.7x faster) |
| Channel History (50 messages) | 2.29ms | 0.03ms | 0.72ms | 0.01ms | 0.01ms | 0.01ms | 2.84ms | 1.43ms | 0.99ms | 0.09ms | 0.11ms | N/Ams | **Transit/Java** (201.2x faster) |

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
