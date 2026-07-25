# Transit vs FastAPI+JSON Benchmark

A comprehensive benchmark comparing **Transit** (binary protocol, multi-language function calls) against **FastAPI+JSON** (REST API with HTTP/JSON serialization) across complex, real-world operations.

## Why This Benchmark?

When building multi-language systems, you have two main choices:
1. **Transit**: Call functions across language boundaries as if they were local async functions, using a binary protocol
2. **FastAPI + JSON**: Standard REST API with HTTP requests and JSON serialization

This benchmark measures the real-world tradeoffs across multiple dimensions.

## Operations Tested

| Operation | What It Tests | Complexity |
|-----------|---------------|------------|
| **ETL Pipeline** | Parse, group, aggregate 1000 rows | Data processing |
| **Text Analysis** | Tokenize, frequency count, n-grams, readability | String processing |
| **Matrix Multiply** | 50×50 matrix multiplication | Numerical compute |
| **Matrix Determinant** | 8×8 cofactor expansion | Recursive compute |
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

## Setup

### Prerequisites
- Node.js >= 20
- Rust toolchain
- Java JDK 21+
- Python 3.10+
- bun (recommended) or npm

### Install
```bash
cd test-transit/benchmark
npm run setup
```

### Run
```bash
npm run benchmark
```

## Output

Results are saved to `results/benchmark-{timestamp}.json` with:
- Latency stats (min, max, mean, p50, p95, p99)
- Throughput (ops/sec)
- Error counts
- Comparison tables

## Architecture

```
benchmark/
├── run-benchmark.js          # Main orchestrator
├── fastapi/
│   ├── main.py               # FastAPI endpoints
│   └── requirements.txt
├── transit/
│   ├── rust/
│   │   ├── Cargo.toml
│   │   └── src/lib.rs        # Rust native addon
│   ├── python/
│   │   └── service.py        # Python TCP server
│   └── java/
│       └── src/main/java/    # Java TCP server
└── results/
    └── benchmark-*.json      # Raw results
```

## Key Metrics

The benchmark measures three critical factors:

1. **Raw Latency**: How fast each operation completes
   - Transit advantage: Binary protocol avoids JSON parse/stringify
   - FastAPI advantage: No inter-process communication overhead

2. **Throughput**: Operations per second under load
   - Transit: Persistent connections, no HTTP overhead
   - FastAPI: Connection pooling, async I/O

3. **Cross-Language Overcall**: Cost of calling between languages
   - Transit/Rust: Zero overhead (in-process native addon)
   - Transit/Python/Java: TCP bridge overhead
   - FastAPI: Full HTTP request/response cycle

## Expected Results

Based on similar benchmarks:

- **Transit/Rust** should win on raw compute (matrix, graph) due to native speed
- **FastAPI** should win on simple operations due to no IPC overhead
- **Transit/Python** adds ~1-2ms per call for TCP serialization
- **Concurrent** scenarios favor Transit's persistent connections

## Interpreting Results

- `mean` is the average latency per operation
- `p95`/`p99` show tail latency (important for real applications)
- `ops_per_sec` measures throughput capacity
- `errors` should be 0 for all tests (any errors indicate bugs)
