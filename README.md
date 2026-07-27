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
- **PyO3**: Direct Python-to-Rust FFI calls (lower bound)
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

## Directory Structure

```
transit/
├── benchmark/
│   ├── run-all.sh                    # Top-level runner
│   ├── generate-grpc.sh              # Generate gRPC code
│   ├── computational/                # Computational benchmark
│   │   ├── run.sh                   # Standalone runner
│   │   ├── run-benchmark.js         # Node.js orchestrator
│   │   ├── package.json             # Dependencies
│   │   ├── README.md               # Detailed documentation
│   │   ├── fastapi/                 # FastAPI implementation
│   │   ├── transit/                 # Transit implementations
│   │   ├── grpc/                   # gRPC implementation
│   │   ├── thrift/                 # Apache Thrift implementation
│   │   ├── unix-socket/            # Unix domain socket implementation
│   │   ├── subprocess/             # Subprocess stdin/stdout implementation
│   │   ├── pyo3/                   # PyO3 implementation
│   │   ├── zeromq/                 # ZeroMQ implementation
│   │   ├── redis-pubsub/           # Redis Pub/Sub implementation
│   │   └── results/               # Benchmark results
│   └── chat-server/                 # Chat server benchmark
│       ├── run.sh                   # Standalone runner
│       ├── run-benchmark.js         # Node.js orchestrator
│       ├── package.json             # Dependencies
│       ├── README.md               # Detailed documentation
│       ├── fastapi/                 # FastAPI implementation
│       ├── transit/                 # Transit implementations
│       ├── grpc/                   # gRPC implementation
│       ├── thrift/                 # Apache Thrift implementation
│       ├── unix-socket/            # Unix domain socket implementation
│       ├── subprocess/             # Subprocess stdin/stdout implementation
│       ├── zeromq/                 # ZeroMQ implementation
│       ├── redis-pubsub/           # Redis Pub/Sub implementation
│       └── results/               # Benchmark results
└── README.md                        # This file
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
cd transit

# Run all benchmarks
./benchmark/run-all.sh
```

### Running Individual Benchmarks

```bash
# Run computational benchmark
cd benchmark/computational
./run.sh

# Run chat server benchmark
cd benchmark/chat-server
./run.sh

# Run only serial benchmarks
./run.sh --serial-only

# Run only concurrent benchmarks
./run.sh --concurrent-only
```

### Running Comparison Targets

Each comparison target can be run independently:

```bash
# Run gRPC benchmark
cd benchmark/computational/grpc
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python server.py &
node client.js

# Run Thrift benchmark
cd benchmark/computational/thrift
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python server.py &

# Run Unix socket benchmark
cd benchmark/computational/unix-socket
python3 -m venv .venv
.venv/bin/python server.py &
node client.js

# Run ZeroMQ benchmark
cd benchmark/computational/zeromq
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python server.py &
node client.js

# Run Redis Pub/Sub benchmark
cd benchmark/computational/redis-pubsub
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python server.py &
node client.js
```

## Output

### Results Files

Each benchmark run generates:

- **`benchmark-{timestamp}.json`** — Full machine-readable results with latency stats (min, max, mean, p50, p95, p99), throughput (ops/sec), error counts, and per-benchmark breakdowns.

- **`benchmark.log`** — Human-readable summary table with mean latency per operation and a winner breakdown.

### Generated Documentation

- **`benchmark/benchmark.md`** — Comprehensive results document comparing all IPC mechanisms with detailed tables and analysis.

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
- Review the generated `benchmark/benchmark.md` for detailed results
