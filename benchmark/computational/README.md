# Transit vs FastAPI+JSON Benchmark

A comprehensive benchmark comparing **Transit** (binary protocol, multi-language function calls) against **FastAPI+JSON** (REST API with HTTP/JSON serialization) and other IPC mechanisms across complex, real-world operations.

## Why This Benchmark?

When building multi-language systems, you have several choices:

1. **Transit**: Call functions across language boundaries as if they were local async functions, using a binary protocol
2. **FastAPI + JSON**: Standard REST API with HTTP requests and JSON serialization
3. **gRPC**: Google's high-performance RPC framework (HTTP/2 + Protocol Buffers)
4. **Apache Thrift**: Cross-language RPC framework (binary protocol)
5. **Unix Socket + JSON**: Raw Unix domain sockets with JSON serialization
6. **Subprocess stdin/stdout**: Process communication via standard I/O
7. **PyO3**: Direct Python-to-Rust FFI calls (lower bound)
8. **ZeroMQ**: High-performance asynchronous messaging library
9. **Redis Pub/Sub**: Redis publish-subscribe messaging pattern

This benchmark measures the real-world tradeoffs across multiple dimensions.

## Operations Tested

| Operation | What It Tests | Complexity |
|-----------|---------------|------------|
| **ETL Pipeline** | Parse, group, aggregate 1000 rows | Data processing |
| **Text Analysis** | Tokenize, frequency count, n-grams, readability | String processing |
| **Matrix Multiply** | 50x50 matrix multiplication | Numerical compute |
| **Matrix Determinant** | 8x8 cofactor expansion | Recursive compute |
| **Graph Processing** | BFS, Dijkstra, PageRank, connected components | Graph algorithms |
| **Fibonacci Memo** | Memoized recursion (n=38) | CPU-bound recursion |
| **SHA-256 Hashing** | 10K rounds of SHA-256 | Crypto/compute |

Each operation runs:

- **Serial**: 100 iterations with 10 warmup
- **Concurrent**: 10 parallel requests

## Languages Tested

- **Transit/Rust**: In-process native addon (zero serialization overhead)
- **Transit/Python**: TCP bridge to persistent Python process
- **Transit/Java**: TCP bridge to persistent JVM process
- **FastAPI**: Python REST API with JSON serialization
- **gRPC**: Google's high-performance RPC framework
- **Apache Thrift**: Cross-language RPC framework
- **Unix Socket + JSON**: Raw Unix domain sockets with JSON serialization
- **Subprocess stdin/stdout**: Process communication via standard I/O
- **PyO3**: Direct Python-to-Rust FFI calls
- **ZeroMQ**: High-performance asynchronous messaging library
- **Redis Pub/Sub**: Redis publish-subscribe messaging pattern

## Setup

### Prerequisites

- Node.js >= 20
- Rust toolchain
- Java JDK 21+
- Python 3.10+
- npm
- Redis (for Redis Pub/Sub benchmark)

### Install

```bash
cd benchmark/computational
npm install
npm run setup
```

### Run

```bash
npm run benchmark
```

## Output

Results are saved to two files in `results/`:

- **`benchmark-{timestamp}.json`** — full machine-readable results with latency stats (min, max, mean, p50, p95, p99), throughput (ops/sec), error counts, and per-benchmark breakdowns for both serial and concurrent runs.

- **`benchmark.log`** — human-readable summary table with mean latency per operation and a winner breakdown. This file is overwritten on each run.

## Architecture

```
computational/
├── run-benchmark.js          # Main orchestrator
├── package.json
├── README.md
├── run.sh                    # Standalone runner script
├── fastapi/
│   ├── main.py               # FastAPI endpoints
│   └── requirements.txt
├── transit/
│   ├── rust/
│   │   ├── Cargo.toml
│   │   ├── build.rs
│   │   └── src/lib.rs        # Rust native addon
│   ├── python/
│   │   └── service.py        # Python TCP server
│   └── java/
│       └── src/main/java/    # Java TCP server
├── grpc/
│   ├── proto/benchmark.proto # gRPC protocol definition
│   ├── server.py             # gRPC server
│   ├── client.js             # gRPC client
│   └── requirements.txt
├── thrift/
│   ├── benchmark.thrift      # Thrift IDL
│   ├── server.py             # Thrift server
│   └── requirements.txt
├── unix-socket/
│   ├── server.py             # Unix socket server
│   ├── client.js             # Unix socket client
│   └── requirements.txt
├── subprocess/
│   ├── server.py             # Subprocess server
│   ├── client.js             # Subprocess client
│   └── requirements.txt
├── pyo3/
│   ├── Cargo.toml            # Rust native module
│   └── src/lib.rs            # PyO3 implementation
├── zeromq/
│   ├── server.py             # ZeroMQ server
│   ├── client.js             # ZeroMQ client
│   └── requirements.txt
├── redis-pubsub/
│   ├── server.py             # Redis Pub/Sub server
│   ├── client.js             # Redis Pub/Sub client
│   └── requirements.txt
└── results/
    ├── benchmark-*.json      # Raw results (per run)
    └── benchmark.log         # Latest human-readable summary
```

## Key Metrics

The benchmark measures three critical factors:

1. **Raw Latency**: How fast each operation completes
   - Transit advantage: Binary protocol avoids JSON parse/stringify
   - FastAPI advantage: No inter-process communication overhead

2. **Throughput**: Operations per second under load
   - Transit: Persistent connections, no HTTP overhead
   - FastAPI: Connection pooling, async I/O

3. **Cross-Language Overhead**: Cost of calling between languages
   - Transit/Rust: Zero overhead (in-process native addon)
   - Transit/Python/Java: TCP bridge overhead
   - FastAPI: Full HTTP request/response cycle
   - gRPC/Thrift: Binary protocol overhead
   - Unix Socket/ZeroMQ: Raw socket overhead
   - Redis Pub/Sub: Network overhead

## Interpreting Results

- `mean` is the average latency per operation
- `p95`/`p99` show tail latency (important for real applications)
- `ops_per_sec` measures throughput capacity
- `errors` should be 0 for all tests (any errors indicate bugs)

## Running Individual Comparison Targets

Each comparison target can be run independently:

```bash
# Run gRPC benchmark
cd grpc
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python server.py &
node client.js

# Run Thrift benchmark
cd thrift
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python server.py &

# Run Unix socket benchmark
cd unix-socket
python3 -m venv .venv
.venv/bin/python server.py &
node client.js

# Run ZeroMQ benchmark
cd zeromq
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python server.py &
node client.js

# Run Redis Pub/Sub benchmark
cd redis-pubsub
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python server.py &
node client.js
```
