# Transit Benchmark Suite

A comprehensive benchmark comparing **Transit** (binary protocol, multi-language function calls) against other IPC mechanisms across complex, real-world operations.

## Overview

This benchmark suite measures the performance of different inter-process communication (IPC) mechanisms for multi-language systems. It compares:

- **FastAPI**: Python REST API with HTTP/JSON serialization
- **Transit/Rust**: In-process native addon (zero serialization overhead)
- **Transit/Python**: TCP bridge to persistent Python process
- **Transit/Java**: TCP bridge to persistent JVM process
- **gRPC**: Google's high-performance RPC framework (HTTP/2 + Protocol Buffers)
- **Apache Thrift**: Cross-language RPC framework (binary protocol)
- **Unix Socket + JSON**: Raw Unix domain sockets with JSON serialization
- **Subprocess stdin/stdout**: Process communication via standard I/O
- **PyO3**: Direct Python-to-Rust FFI calls (lower bound; computational only)
- **ZeroMQ**: High-performance asynchronous messaging library
- **Redis Pub/Sub**: Redis publish-subscribe messaging pattern

## Benchmark Categories

### Computational Benchmark

Tests CPU-intensive operations across language boundaries:

| Operation | What It Tests | Complexity |
|-----------|---------------|------------|
| **ETL Pipeline** | Parse, group, aggregate 1000 rows | Data processing |
| **Text Analysis** | Tokenize, frequency count, n-grams, readability | String processing |
| **Matrix Multiply** | 50x50 matrix multiplication | Numerical compute |
| **Matrix Determinant** | 8x8 cofactor expansion | Recursive compute |
| **Graph Processing** | BFS, Dijkstra, PageRank, connected components | Graph algorithms |
| **Fibonacci Memo** | Memoized recursion (n=38) | CPU-bound recursion |
| **SHA-256 Hashing** | 10K rounds of SHA-256 | Crypto/compute |

## Results (Serial — single request, 100 iterations)

> Hardware: Arch Linux, AMD Ryzen — July 2026

| Operation | FastAPI | Transit/Rust | Transit/Java | Transit/Python | gRPC | Thrift | Unix Socket | Subprocess | ZeroMQ | Redis Pub/Sub | PyO3 | Winner |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **ETL Pipeline** | 2.06ms | 0.29ms | 0.40ms | 1.13ms | 2.47ms | 2.37ms | 1.40ms | 1.62ms | 1.89ms | 2.10ms | 0.61ms | **Transit/Rust** (7.2x) |
| **Text Analysis** | 15.78ms | 0.71ms | 0.41ms | 15.24ms | 14.30ms | 26.62ms | 16.84ms | 11.91ms | 11.86ms | 12.16ms | 2.52ms | **Transit/Java** (38.1x) |
| **Matrix Multiply** | 28.85ms | 1.19ms | 1.24ms | 18.39ms | 20.18ms | 54.59ms | 20.73ms | 18.22ms | 18.27ms | 18.28ms | 3.80ms | **Transit/Rust** (24.2x) |
| **Matrix Determinant** | 22.72ms | 0.08ms | 0.11ms | 22.10ms | 27.36ms | 37.44ms | 32.84ms | 26.10ms | 25.01ms | 26.19ms | 2.06ms | **Transit/Rust** (283.8x) |
| **Graph Processing** | 10.55ms | 0.37ms | 0.51ms | 6.95ms | 6.53ms | 13.36ms | 11.51ms | 5.04ms | 6.03ms | 5.56ms | 2.17ms | **Transit/Rust** (28.4x) |
| **Fibonacci Memo** | 1.14ms | 0.05ms | 0.08ms | 0.19ms | 1.00ms | 0.24ms | 0.19ms | 0.06ms | 0.09ms | 0.55ms | 0.09ms | **Transit/Rust** (22.7x) |
| **SHA-256 Hashing** | 5.20ms | 0.06ms | 0.16ms | 4.75ms | 5.67ms | 9.19ms | 9.82ms | 4.66ms | 4.89ms | 5.17ms | 0.69ms | **Transit/Rust** (93.8x) |

## Results (Concurrent — 10 parallel requests)

| Operation | FastAPI | Transit/Rust | Transit/Java | Transit/Python | gRPC | Thrift | Unix Socket | Subprocess | ZeroMQ | Redis Pub/Sub | PyO3 | Winner |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **ETL Pipeline** | 15.35ms | 1.44ms | 1.89ms | 6.15ms | 13.16ms | 6.55ms | 4.45ms | 1.95ms | 1.26ms | 3.65ms | 1.08ms | **PyO3** (14.2x) |
| **Text Analysis** | 131.42ms | 3.61ms | 3.99ms | 235.37ms | 177.89ms | 174.62ms | 168.55ms | 64.48ms | 6.38ms | 61.35ms | 9.90ms | **Transit/Rust** (36.4x) |
| **Matrix Multiply** | 227.63ms | 5.83ms | 7.24ms | 236.01ms | 222.78ms | 239.70ms | 214.76ms | 77.20ms | 10.55ms | 80.37ms | 17.94ms | **Transit/Rust** (39.0x) |
| **Matrix Determinant** | 200.48ms | 0.54ms | 1.91ms | 381.61ms | 369.21ms | 400.01ms | 339.41ms | 142.29ms | 8.91ms | 157.44ms | 10.77ms | **Transit/Rust** (374.5x) |
| **Graph Processing** | 91.94ms | 2.07ms | 3.32ms | 108.39ms | 63.66ms | 56.09ms | 42.31ms | 28.29ms | 2.45ms | 30.37ms | 7.19ms | **Transit/Rust** (44.3x) |
| **Fibonacci Memo** | 4.30ms | 0.11ms | 1.77ms | 0.71ms | 3.40ms | 1.50ms | 0.71ms | 0.10ms | 0.09ms | 1.01ms | 0.15ms | **ZeroMQ** (46.6x) |
| **SHA-256 Hashing** | 46.42ms | 0.26ms | 1.86ms | 65.39ms | 54.91ms | 46.18ms | 27.70ms | 28.49ms | 1.71ms | 28.53ms | 4.68ms | **Transit/Rust** (180.1x) |

### Chat Server Benchmark

Simulates real-world chat server workloads:

| Operation | What It Tests | Why It Matters |
|-----------|---------------|----------------|
| **Message Send Pipeline** | Auth → moderate → route → persist | Full request lifecycle |
| **Fan-out Delivery** | Broadcast to 50 users | Group chat routing |
| **Session Validation** | Token check | Authentication |
| **Typing Indicator** | Debounced typing status | High-frequency updates |
| **Read Receipt** | Update unread count | Read tracking |
| **Presence Update** | Status change + notify contacts | Online/offline status |
| **AI Content Moderation** | Toxicity/spam detection | ML inference |
| **Message Search** | Full-text search with ranking | Search/retrieval |
| **Analytics Pipeline** | Aggregate usage events | Data processing |
| **Notification Builder** | Personalized push payloads | Notification generation |
| **User Lookup** | Fetch user from store | Database lookup |
| **Channel History** | Fetch recent messages | Message retrieval |

## Chat Server Results (Serial — single request, 100 iterations)

| Operation | FastAPI | Transit/Rust | Transit/Python | Transit/Java | Winner |
|-----------|---------|--------------|----------------|--------------|--------|
| **Message Send Pipeline** | 0.91ms | 0.00ms | 0.22ms | 0.31ms | **Transit/Rust** (237.3x) |
| **Fan-out Delivery** | 1.23ms | 0.02ms | 0.29ms | 0.12ms | **Transit/Rust** (54.4x) |
| **Session Validation** | 0.75ms | 0.00ms | 0.19ms | 0.14ms | **Transit/Rust** (215.6x) |
| **Typing Indicator** | 0.83ms | 0.00ms | 0.12ms | 0.14ms | **Transit/Rust** (456.5x) |
| **Read Receipt** | 0.76ms | 0.00ms | 0.15ms | 0.13ms | **Transit/Rust** (367.0x) |
| **Presence Update** | 0.74ms | 0.01ms | 0.17ms | 0.11ms | **Transit/Rust** (57.7x) |
| **Content Moderation** | 0.82ms | 0.00ms | 0.13ms | 0.10ms | **Transit/Rust** (360.6x) |
| **Message Search** | 5.53ms | 1.04ms | 2.88ms | 1.12ms | **Transit/Rust** (5.3x) |
| **Analytics Pipeline** | 2.74ms | 0.47ms | 1.63ms | 0.59ms | **Transit/Rust** (5.8x) |
| **Notification Builder** | 1.17ms | 0.01ms | 0.12ms | 0.22ms | **Transit/Rust** (220.6x) |
| **User Lookup** | 0.67ms | 0.00ms | 0.08ms | 0.16ms | **Transit/Rust** (375.2x) |
| **Channel History** | 1.74ms | 0.00ms | 0.16ms | 0.22ms | **Transit/Rust** (470.3x) |

## Directory Structure

```
benchmark/
├── run-all.sh                    # Top-level runner
├── generate-grpc.sh              # Generate gRPC code
├── computational/                # Computational benchmark
│   ├── run.sh                   # Standalone runner
│   ├── run-benchmark.js         # Node.js orchestrator
│   ├── analyze-results.py       # Results analysis script
│   ├── package.json             # Dependencies
│   ├── README.md               # Detailed documentation
│   ├── fastapi/                 # FastAPI implementation
│   ├── transit/                 # Transit implementations
│   │   ├── rust/               # Rust native addon
│   │   ├── python/             # Python TCP server
│   │   └── java/               # Java TCP server
│   ├── grpc/                   # gRPC implementation
│   ├── thrift/                 # Apache Thrift implementation
│   ├── unix-socket/            # Unix domain socket implementation
│   ├── subprocess/             # Subprocess stdin/stdout implementation
│   ├── pyo3/                   # PyO3 implementation
│   ├── zeromq/                 # ZeroMQ implementation
│   ├── redis-pubsub/           # Redis Pub/Sub implementation
│   └── results/               # Benchmark results
├── chat-server/                 # Chat server benchmark
│   ├── run.sh                   # Standalone runner
│   ├── run-benchmark.js         # Node.js orchestrator
│   ├── package.json             # Dependencies
│   ├── README.md               # Detailed documentation
│   ├── fastapi/                 # FastAPI implementation
│   ├── transit/                 # Transit implementations
│   │   ├── rust/               # Rust native addon
│   │   ├── python/             # Python TCP server
│   │   └── java/               # Java TCP server
│   ├── grpc/                   # gRPC implementation
│   ├── thrift/                 # Apache Thrift implementation
│   ├── unix-socket/            # Unix domain socket implementation
│   ├── subprocess/             # Subprocess stdin/stdout implementation
│   ├── zeromq/                 # ZeroMQ implementation
│   ├── redis-pubsub/           # Redis Pub/Sub implementation
│   └── results/               # Benchmark results
└── README.md                    # This file
```

## Quick Start

### Prerequisites

- Node.js >= 20
- Rust toolchain
- Java JDK 21+
- Python 3.10+
- Redis (for Redis Pub/Sub benchmark)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd <repository-directory>

# Run all benchmarks
./benchmark/run-all.sh
```

### Running Individual Benchmarks

```bash
# Run computational benchmark
cd benchmark/computational
npm install
npm run setup
npm run benchmark

# Run chat server benchmark
cd benchmark/chat-server
npm install
npm run setup
npm run benchmark
```

### Run Mode Flags

Each `run.sh` script supports mode flags:

```bash
# Run only serial benchmarks (100 iterations)
./run.sh --serial-only

# Run only concurrent benchmarks (10 parallel requests)
./run.sh --concurrent-only
```

### Top-Level Runner Options

```bash
./benchmark/run-all.sh --computational-only   # Run only computational
./benchmark/run-all.sh --chat-only            # Run only chat server
./benchmark/run-all.sh --serial-only          # Run serial tests only
./benchmark/run-all.sh --concurrent-only      # Run concurrent tests only
```

## Output

### Results Files

Each benchmark run generates:

- **`results/benchmark-{timestamp}.json`** — Full machine-readable results with latency stats (min, max, mean, p50, p95, p99), throughput (ops/sec), error counts, and per-benchmark breakdowns.

- **`results/benchmark.log`** — Human-readable summary table with mean latency per operation and a winner breakdown.

### Analysis Script

The computational benchmark includes `analyze-results.py` for deeper analysis of result files.

## Key Metrics

The benchmark measures three critical factors:

### 1. Raw Latency

How fast each operation completes:

- **Transit advantage**: Binary protocol avoids JSON parse/stringify
- **FastAPI advantage**: No inter-process communication overhead

### 2. Throughput

Operations per second under load:

- **Transit**: Persistent connections, no HTTP overhead
- **FastAPI**: Connection pooling, async I/O

### 3. Cross-Language Overhead

Cost of calling between languages:

- **Transit/Rust**: Zero overhead (in-process native addon)
- **Transit/Python/Java**: TCP bridge overhead
- **FastAPI**: Full HTTP request/response cycle
- **gRPC/Thrift**: Binary protocol overhead
- **Unix Socket/ZeroMQ**: Raw socket overhead
- **Redis Pub/Sub**: Network overhead

## Interpreting Results

- **mean** — Average latency per operation
- **p95** — 95th percentile (what 95% of requests see)
- **p99** — 99th percentile (tail latency, worst-case user experience)
- **ops/sec** — Throughput capacity
- **errors** — Should be 0 (any errors indicate bugs)

## Key Metrics to Watch

### Computational Benchmark

| Metric | What It Tells You |
|--------|-------------------|
| Matrix Multiply mean | CPU-bound computation speed |
| Graph Processing p95 | Algorithmic complexity handling |
| Fibonacci Memo ops/sec | Recursive computation throughput |

### Chat Server Benchmark

| Metric | What It Tells You |
|--------|-------------------|
| Message Pipeline mean | End-to-end message delivery speed |
| Fan-out p95 | Worst-case group chat experience |
| Session Validation ops/sec | Maximum request throughput |
| Content Moderation mean | ML inference overhead |
| Concurrent scaling ratio | How well the system handles load |

## Architecture

### Transit vs Traditional IPC

#### Traditional Approach (FastAPI + JSON)
```
JS → HTTP POST → FastAPI → HTTP POST → Rust service → HTTP response
                                 → HTTP POST → Python ML → HTTP response
                                 → HTTP POST → Java DB → HTTP response
```

**4 HTTP round trips** with JSON serialization at every hop.

#### Transit Approach
```
JS → transit.rs.routeMessage(...)
   → transit.py.moderateContent(...)
   → transit.java.persistMessage(...)
```

**Zero HTTP overhead. Zero JSON serialization. Direct function calls.**

### Why Transit Wins

1. **Hot Path Elimination**: Direct function calls across language boundaries
2. **Concurrent Load Scaling**: Persistent connections and binary protocol
3. **Cross-Language Without Microservices**: One process calling into three languages
4. **Tail Latency (p95/p99)**: Consistent performance under load

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

See the LICENSE file for details.

## Support

For issues and questions:
- Open an issue on GitHub
- Check the documentation in each benchmark directory
- Review the generated benchmark results for detailed analysis
