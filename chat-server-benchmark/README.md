# Chat Server Benchmark

A comprehensive benchmark comparing **Transit** (binary RPC) against **FastAPI** (JSON/HTTP) and traditional IPC backends for chat server operations.

## Backends Tested

| Backend | Protocol | Serialization | Connection Model |
|---------|----------|---------------|------------------|
| **Transit/Rust** | In-process native addon | Zero-copy | Direct function call |
| **Transit/Python** | TCP | Binary | Persistent bridge |
| **Transit/Java** | TCP | Binary | Persistent bridge |
| **FastAPI** | HTTP/1.1 | JSON | HTTP request/response |
| **gRPC** | HTTP/2 | Protobuf | Persistent channel |
| **Thrift** | TCP | Binary | One connection per call |
| **Unix Socket** | UDS | Length-prefixed JSON | One socket per call |
| **Subprocess** | stdin/stdout | Line-delimited JSON | Long-lived subprocess |
| **ZeroMQ** | TCP | JSON | Persistent REQ/REP |
| **Redis Pub/Sub** | TCP (via Redis) | JSON | Persistent connections |

## Chat Operations Benchmarked

1. **Message Send Pipeline** — auth + moderation + route + persist
2. **Fan-out Delivery** — deliver to 50 recipients
3. **Session Validation** — token validation
4. **Typing Indicator** — broadcast typing state
5. **Read Receipt** — process read receipt
6. **Presence Update** — compute online contacts (30)
7. **AI Content Moderation** — content moderation
8. **Message Search** — search 1000 messages
9. **Analytics Pipeline** — process 500 events
10. **Notification Builder** — build notifications for 20 users
11. **User Lookup** — user profile lookup
12. **Channel History** — fetch 50 messages

## Results

### Serial (single request, 100 iterations)

| Operation | FastAPI | Transit/Rust | Transit/Python | Transit/Java | gRPC | Thrift | Unix Sock | Subprocess | ZeroMQ | Redis | Winner |
|-----------|---------|--------------|----------------|--------------|------|--------|-----------|------------|--------|-------|--------|
| Message Send Pipeline | 1.29ms | 0.01ms | 0.17ms | 0.26ms | 0.17ms | 0.13ms | 0.28ms | 0.05ms | 0.11ms | 0.57ms | **Transit/Rust** (117.3x) |
| Fan-out Delivery | 0.86ms | 0.01ms | 0.20ms | 0.16ms | 0.25ms | 0.14ms | 0.32ms | 0.05ms | 0.12ms | 0.45ms | **Transit/Rust** (85.9x) |
| Session Validation | 0.87ms | 0.00ms | 0.15ms | 0.12ms | 0.19ms | 0.13ms | 0.20ms | 0.04ms | 0.12ms | 0.45ms | **Transit/Rust** (238.6x) |
| Typing Indicator | 0.92ms | 0.01ms | 0.13ms | 0.12ms | 0.16ms | 0.10ms | 0.26ms | 0.06ms | 0.10ms | 0.44ms | **Transit/Rust** (166.3x) |
| Read Receipt | 0.70ms | 0.00ms | 0.11ms | 0.11ms | 0.16ms | 0.09ms | 0.22ms | 0.04ms | 0.11ms | 0.48ms | **Transit/Rust** (331.0x) |
| Presence Update | 0.85ms | 0.02ms | 0.21ms | 0.19ms | 0.13ms | 0.09ms | 0.24ms | 0.05ms | 0.13ms | 0.38ms | **Transit/Rust** (36.0x) |
| AI Content Moderation | 0.85ms | 0.00ms | 0.16ms | 0.14ms | 0.12ms | 0.08ms | 0.22ms | 0.04ms | 0.10ms | 0.59ms | **Transit/Rust** (173.2x) |
| Message Search | 5.19ms | 1.01ms | 3.71ms | 0.96ms | 1.32ms | 1.21ms | 2.50ms | 2.17ms | 2.74ms | 3.27ms | **Transit/Java** (5.4x) |
| Analytics Pipeline | 2.72ms | 0.47ms | 1.89ms | 0.59ms | 0.84ms | 0.56ms | 1.19ms | 1.30ms | 1.74ms | 2.11ms | **Transit/Rust** (5.8x) |
| Notification Builder | 0.98ms | 0.02ms | 0.14ms | 0.18ms | 0.12ms | 0.09ms | 0.22ms | 0.06ms | 0.13ms | 0.50ms | **Transit/Rust** (42.5x) |
| User Lookup | 0.74ms | 0.00ms | 0.14ms | 0.12ms | 0.14ms | 0.11ms | 0.25ms | 0.04ms | 0.10ms | 0.53ms | **Transit/Rust** (313.5x) |
| Channel History | 1.86ms | 0.00ms | 0.12ms | 0.12ms | 0.09ms | 0.07ms | 0.20ms | 0.05ms | 0.11ms | 0.54ms | **Transit/Rust** (374.9x) |

### Key Findings

- **Transit/Rust wins 11 of 12 operations** — up to 375x faster than FastAPI on hot-path operations
- **Subprocess is surprisingly competitive** — for simple operations, stdin/stdout IPC outperforms many network-based protocols
- **Transit/Java excels at data-heavy operations** — the Message Search benchmark shows Java's strong string processing
- **gRPC and Thrift** provide solid performance with industry-standard protocols, typically 5-10x faster than FastAPI
- **Redis Pub/Sub** adds overhead from the Redis intermediary, making it the slowest backend for most operations

## Setup

### Prerequisites

- Node.js 18+
- Python 3.10+
- Java JDK 11+
- Rust toolchain (for Transit/Rust)
- Redis (for Redis Pub/Sub backend)

### Install Dependencies

```bash
# Node.js dependencies
npm install

# Python packages (system-wide or in venvs)
pip install grpcio grpcio-tools thrift pyzmq redis

# Build Rust native addon
cd transit/rust && cargo build --release

# Compile Java service
cd transit/java && mkdir -p build && javac -d build -cp libs/gson-2.10.1.jar src/main/java/chatservice/ChatService.java
```

### Run Benchmark

```bash
# Serial only (single request at a time)
node run-benchmark.js --serial

# Concurrent only (10 parallel requests)
node run-benchmark.js --concurrent

# Both serial and concurrent
node run-benchmark.js
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Benchmark Runner                          │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ FastAPI  │  │ Transit  │  │   gRPC   │  │  Thrift  │   │
│  │ (HTTP)   │  │ (Binary) │  │(Protobuf)│  │ (Binary) │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       │              │              │              │          │
│  ┌────┴─────┐  ┌────┴─────┐  ┌────┴─────┐  ┌────┴─────┐   │
│  │  Uvicorn │  │Rust/Py/  │  │  Python  │  │  Python  │   │
│  │  Server  │  │Java Impl │  │  Server  │  │  Server  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Unix    │  │Subprocess│  │  ZeroMQ  │  │  Redis   │   │
│  │  Socket  │  │(stdin/out)│  │ (REQ/REP)│  │ Pub/Sub  │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       │              │              │              │          │
│  ┌────┴─────┐  ┌────┴─────┐  ┌────┴─────┐  ┌────┴─────┐   │
│  │  Python  │  │  Python  │  │  Python  │  │  Python  │   │
│  │  Server  │  │  Server  │  │  Server  │  │  Server  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Why Transit Wins for Chat Servers

### Hot Path Operations
Transit/Rust eliminates HTTP overhead and JSON serialization on the most frequently called endpoints (message send, auth, typing indicators). For operations that complete in microseconds, the HTTP stack becomes the bottleneck.

### Concurrent Load
Transit's persistent connections avoid TCP handshake and HTTP connection pooling overhead. Under concurrent load, FastAPI latency degrades significantly while Transit stays near-constant.

### Cross-Language Calling
Call Python ML models, Java persistence layers, and Rust compute from the same request pipeline without spawning separate HTTP services or managing routes.

### Zero-Copy Serialization
Transit uses native types directly — no JSON encoding/decoding, no protobuf compilation, no binary framing. The data flows directly from function to caller.

## License

MIT
