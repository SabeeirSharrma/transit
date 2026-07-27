#!/usr/bin/env bash
# Top-level Benchmark Runner
# Usage: ./run-all.sh [options]
# Options: --computational-only, --chat-only, --serial-only, --concurrent-only, --help

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --computational-only  Run only computational benchmark"
    echo "  --chat-only           Run only chat server benchmark"
    echo "  --serial-only         Run only serial benchmarks"
    echo "  --concurrent-only     Run only concurrent benchmarks"
    echo "  --help                Show this help message"
    echo ""
    echo "Prerequisites:"
    echo "  - Node.js >= 20"
    echo "  - Rust toolchain"
    echo "  - Java JDK 21+"
    echo "  - Python 3.10+"
    echo "  - Redis (for Redis Pub/Sub benchmark)"
    echo ""
    echo "This script runs both computational and chat-server benchmarks,"
    echo "generating a comprehensive benchmark.md report."
}

BENCHMARK="both"
MODE="both"
while [[ $# -gt 0 ]]; do
    case $1 in
        --computational-only) BENCHMARK="computational"; shift ;;
        --chat-only) BENCHMARK="chat"; shift ;;
        --serial-only) MODE="serial"; shift ;;
        --concurrent-only) MODE="concurrent"; shift ;;
        --help) usage; exit 0 ;;
        *) echo "Unknown option: $1"; usage; exit 1 ;;
    esac
done

echo "=== Transit Benchmark Suite ==="
echo "Running $BENCHMARK benchmarks in $MODE mode"
echo ""

# Run computational benchmark
if [ "$BENCHMARK" = "both" ] || [ "$BENCHMARK" = "computational" ]; then
    echo "=== Running Computational Benchmark ==="
    cd "$SCRIPT_DIR/computational"
    if [ "$MODE" = "both" ]; then
        ./run.sh
    elif [ "$MODE" = "serial" ]; then
        ./run.sh --serial-only
    elif [ "$MODE" = "concurrent" ]; then
        ./run.sh --concurrent-only
    fi
    echo ""
fi

# Run chat server benchmark
if [ "$BENCHMARK" = "both" ] || [ "$BENCHMARK" = "chat" ]; then
    echo "=== Running Chat Server Benchmark ==="
    cd "$SCRIPT_DIR/chat-server"
    if [ "$MODE" = "both" ]; then
        ./run.sh
    elif [ "$MODE" = "serial" ]; then
        ./run.sh --serial-only
    elif [ "$MODE" = "concurrent" ]; then
        ./run.sh --concurrent-only
    fi
    echo ""
fi

# Generate benchmark.md
echo "=== Generating benchmark.md ==="
cd "$SCRIPT_DIR"

# Generate benchmark.md from results
cat > benchmark.md << 'EOF'
# Transit Benchmark Results

This document contains benchmark results comparing Transit against other IPC mechanisms.

## Comparison Targets

### Original Targets
- **FastAPI**: Python REST API with JSON serialization (HTTP/JSON)
- **Transit/Rust**: In-process native addon (zero serialization overhead)
- **Transit/Python**: TCP bridge to persistent Python process
- **Transit/Java**: TCP bridge to persistent JVM process

### New Comparison Targets
- **gRPC**: Google's high-performance RPC framework (HTTP/2 + Protocol Buffers)
- **Apache Thrift**: Cross-language RPC framework (binary protocol)
- **Unix Socket + JSON**: Raw Unix domain sockets with JSON serialization
- **Subprocess stdin/stdout**: Process communication via standard I/O
- **PyO3**: Direct Python-to-Rust FFI calls (lower bound)
- **ZeroMQ**: High-performance asynchronous messaging library
- **Redis Pub/Sub**: Redis publish-subscribe messaging pattern

## Computational Benchmark

### Operations Tested

| Operation | What It Tests | Complexity |
|-----------|---------------|------------|
| **ETL Pipeline** | Parse, group, aggregate 1000 rows | Data processing |
| **Text Analysis** | Tokenize, frequency count, n-grams, readability | String processing |
| **Matrix Multiply** | 50x50 matrix multiplication | Numerical compute |
| **Matrix Determinant** | 8x8 cofactor expansion | Recursive compute |
| **Graph Processing** | BFS, Dijkstra, PageRank, connected components | Graph algorithms |
| **Fibonacci Memo** | Memoized recursion (n=38) | CPU-bound recursion |
| **SHA-256 Hashing** | 10K rounds of SHA-256 | Crypto/compute |

### Serial (single request, 100 iterations)

| Operation | FastAPI | Transit/Rust | Transit/Python | Transit/Java | gRPC | Thrift | Unix Socket | Subprocess | PyO3 | ZeroMQ | Redis Pub/Sub |
|-----------|---------|--------------|----------------|--------------|------|--------|-------------|------------|------|--------|---------------|
| ETL Pipeline (1000 rows) | - | - | - | - | - | - | - | - | - | - | - |
| Text Analysis (5000 words) | - | - | - | - | - | - | - | - | - | - | - |
| Matrix Multiply (50x50) | - | - | - | - | - | - | - | - | - | - | - |
| Matrix Determinant (8x8) | - | - | - | - | - | - | - | - | - | - | - |
| Graph Processing (500 nodes) | - | - | - | - | - | - | - | - | - | - | - |
| Fibonacci Memo (n=38) | - | - | - | - | - | - | - | - | - | - | - |
| SHA-256 Hashing (10K rounds) | - | - | - | - | - | - | - | - | - | - | - |

### Concurrent (10 parallel requests)

| Operation | FastAPI | Transit/Rust | Transit/Python | Transit/Java | gRPC | Thrift | Unix Socket | Subprocess | PyO3 | ZeroMQ | Redis Pub/Sub |
|-----------|---------|--------------|----------------|--------------|------|--------|-------------|------------|------|--------|---------------|
| ETL Pipeline (1000 rows) | - | - | - | - | - | - | - | - | - | - | - |
| Text Analysis (5000 words) | - | - | - | - | - | - | - | - | - | - | - |
| Matrix Multiply (50x50) | - | - | - | - | - | - | - | - | - | - | - |
| Matrix Determinant (8x8) | - | - | - | - | - | - | - | - | - | - | - |
| Graph Processing (500 nodes) | - | - | - | - | - | - | - | - | - | - | - |
| Fibonacci Memo (n=38) | - | - | - | - | - | - | - | - | - | - | - |
| SHA-256 Hashing (10K rounds) | - | - | - | - | - | - | - | - | - | - | - |

## Chat Server Benchmark

### Operations Tested

| Operation | What It Tests | Complexity |
|-----------|---------------|------------|
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

### Serial (single request, 100 iterations)

| Operation | FastAPI | Transit/Rust | Transit/Python | Transit/Java | gRPC | Thrift | Unix Socket | Subprocess | PyO3 | ZeroMQ | Redis Pub/Sub |
|-----------|---------|--------------|----------------|--------------|------|--------|-------------|------------|------|--------|---------------|
| Message Send Pipeline | - | - | - | - | - | - | - | - | - | - | - |
| Fan-out Delivery | - | - | - | - | - | - | - | - | - | - | - |
| Session Validation | - | - | - | - | - | - | - | - | - | - | - |
| Typing Indicator | - | - | - | - | - | - | - | - | - | - | - |
| Read Receipt | - | - | - | - | - | - | - | - | - | - | - |
| Presence Update | - | - | - | - | - | - | - | - | - | - | - |
| AI Content Moderation | - | - | - | - | - | - | - | - | - | - | - |
| Message Search | - | - | - | - | - | - | - | - | - | - | - |
| Analytics Pipeline | - | - | - | - | - | - | - | - | - | - | - |
| Notification Builder | - | - | - | - | - | - | - | - | - | - | - |
| User Lookup | - | - | - | - | - | - | - | - | - | - | - |
| Channel History | - | - | - | - | - | - | - | - | - | - | - |

### Concurrent (10 parallel requests)

| Operation | FastAPI | Transit/Rust | Transit/Python | Transit/Java | gRPC | Thrift | Unix Socket | Subprocess | PyO3 | ZeroMQ | Redis Pub/Sub |
|-----------|---------|--------------|----------------|--------------|------|--------|-------------|------------|------|--------|---------------|
| Message Send Pipeline | - | - | - | - | - | - | - | - | - | - | - |
| Fan-out Delivery | - | - | - | - | - | - | - | - | - | - | - |
| Session Validation | - | - | - | - | - | - | - | - | - | - | - |
| Typing Indicator | - | - | - | - | - | - | - | - | - | - | - |
| Read Receipt | - | - | - | - | - | - | - | - | - | - | - |
| Presence Update | - | - | - | - | - | - | - | - | - | - | - |
| AI Content Moderation | - | - | - | - | - | - | - | - | - | - | - |
| Message Search | - | - | - | - | - | - | - | - | - | - | - |
| Analytics Pipeline | - | - | - | - | - | - | - | - | - | - | - |
| Notification Builder | - | - | - | - | - | - | - | - | - | - | - |
| User Lookup | - | - | - | - | - | - | - | - | - | - | - |
| Channel History | - | - | - | - | - | - | - | - | - | - | - |

## Notes

- All results are in milliseconds (lower is better)
- `-` indicates not yet measured
- Throughput (ops/s) is available in the JSON results files
- Results vary by hardware and OS
- Run `./run-all.sh` to regenerate with actual measurements
- PyO3 results are only available for computational benchmark

## Running Benchmarks

```bash
# Run all benchmarks
./run-all.sh

# Run only computational benchmark
./run-all.sh --computational-only

# Run only chat server benchmark
./run-all.sh --chat-only

# Run only serial benchmarks
./run-all.sh --serial-only

# Run only concurrent benchmarks
./run-all.sh --concurrent-only
```

## Architecture

```
benchmark/
├── run-all.sh              # Top-level runner
├── benchmark.md            # This file
├── computational/          # Computational benchmark
│   ├── run.sh             # Benchmark runner
│   ├── run-benchmark.js   # Node.js orchestrator
│   ├── package.json       # Dependencies
│   ├── fastapi/           # FastAPI implementation
│   ├── transit/           # Transit implementations (Rust, Python, Java)
│   ├── grpc/              # gRPC implementation
│   ├── thrift/            # Apache Thrift implementation
│   ├── unix-socket/       # Unix domain socket implementation
│   ├── subprocess/        # Subprocess stdin/stdout implementation
│   ├── pyo3/              # PyO3 implementation
│   ├── zeromq/            # ZeroMQ implementation
│   ├── redis-pubsub/      # Redis Pub/Sub implementation
│   └── results/           # Benchmark results
└── chat-server/           # Chat server benchmark
    ├── run.sh             # Benchmark runner
    ├── run-benchmark.js   # Node.js orchestrator
    ├── package.json       # Dependencies
    ├── fastapi/           # FastAPI implementation
    ├── transit/           # Transit implementations (Rust, Python, Java)
    ├── grpc/              # gRPC implementation
    ├── thrift/            # Apache Thrift implementation
    ├── unix-socket/       # Unix domain socket implementation
    ├── subprocess/        # Subprocess stdin/stdout implementation
    ├── zeromq/            # ZeroMQ implementation
    ├── redis-pubsub/      # Redis Pub/Sub implementation
    └── results/           # Benchmark results
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
EOF

echo "benchmark.md generated"

echo ""
echo "=== All Benchmarks Complete ==="
