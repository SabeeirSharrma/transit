# Chat Server Benchmark: Transit vs FastAPI+JSON

A realistic benchmark simulating real-world chat server workloads to answer: **"Why is Transit better for my chat server?"**

## The Problem

A typical chat server handles a mix of operations on every request:

```
User sends message
  → Validate session token        (hot path, every request)
  → Run AI content moderation     (cold path, Python ML model)
  → Route to 50 recipients        (hot path, fan-out)
  → Persist to storage            (cold path, Java persistence)
  → Send notifications            (cold path, background)
```

With **FastAPI + JSON**, each of these is a separate HTTP call between microservices. With **Transit**, they're direct function calls across language boundaries — no HTTP, no JSON serialization, no connection management.

## Scenarios Tested

### Hot Path (every request)

| Scenario | What It Simulates | Why It Matters |
|----------|-------------------|----------------|
| **Message Send Pipeline** | Auth → moderate → route → persist | The full request lifecycle — every message goes through this |
| **Fan-out Delivery** | Broadcast to 50 users | Group chat: one message must reach all members |
| **Session Validation** | Token check | Called on literally every API request |
| **Typing Indicator** | Debounced typing status | Highest-frequency message type in chat |
| **Read Receipt** | Update unread count | Every time a user views a channel |

### Warm Path (frequent)

| Scenario | What It Simulates | Why It Matters |
|----------|-------------------|----------------|
| **Presence Update** | Status change + notify contacts | Users go online/offline constantly |

### Cold Path (per-request or background)

| Scenario | What It Simulates | Why It Matters |
|----------|-------------------|----------------|
| **AI Content Moderation** | Toxicity/spam detection | Python ML model called per message |
| **Message Search** | Full-text search with ranking | Users search their history |
| **Analytics Pipeline** | Aggregate usage events | Dashboard data, background processing |
| **Notification Builder** | Personalized push payloads | Build per-user notification content |
| **User Lookup** | Fetch user from store | Java persistence layer |
| **Channel History** | Fetch recent messages | Scroll/load more messages |

## Architecture

```
chat-server-benchmark/
├── run-benchmark.js              # Orchestrator
├── package.json
├── README.md
├── fastapi/
│   ├── main.py                   # FastAPI equivalents (all Python)
│   ├── requirements.txt
│   └── .venv/                    # Python venv
├── transit/
│   ├── rust/
│   │   ├── Cargo.toml
│   │   ├── build.rs
│   │   └── src/lib.rs            # Hot path: routing, auth, presence (native)
│   ├── python/
│   │   └── service.py            # Cold path: ML, search, analytics
│   └── java/
│       └── src/main/java/        # Cold path: persistence, sessions, user store
└── results/
    ├── benchmark-*.json          # Full results (per run)
    └── benchmark.log             # Human-readable summary (latest run)
```

### Why This Split?

Real chat servers use the right language for the job:
- **Rust** for hot-path routing (needs to be fast, called on every message)
- **Python** for AI/ML content moderation (TensorFlow, PyTorch are Python-native)
- **Java** for persistence (mature database drivers, JVM stability)

Transit lets you call all three from a single request pipeline without HTTP between them.

## Setup

### Prerequisites
- Node.js >= 20
- Rust toolchain
- Java JDK 21+
- Python 3.10+

### Install & Build
```bash
cd chat-server-benchmark
npm install
npm run setup
```

### Run
```bash
npm run benchmark
```

## Output

Two files are saved to `results/`:

- **`benchmark-{timestamp}.json`** — machine-readable results with full stats
- **`benchmark.log`** — human-readable summary table with winner analysis

## Why Transit Wins for Chat Servers

### 1. Hot Path Elimination

In a FastAPI architecture, every message send requires:
```
JS → HTTP POST → FastAPI → HTTP POST → Rust service → HTTP response
                                 → HTTP POST → Python ML → HTTP response
                                 → HTTP POST → Java DB → HTTP response
```

That's **4 HTTP round trips** with JSON serialization at every hop. With Transit:
```
JS → transit.rs.routeMessage(...)
   → transit.py.moderateContent(...)
   → transit.java.persistMessage(...)
```

**Zero HTTP overhead. Zero JSON serialization. Direct function calls.**

### 2. Concurrent Load Scaling

FastAPI handles concurrency through async I/O and connection pooling. But under load:
- HTTP connection pools saturate
- JSON serialization becomes a bottleneck (CPU-bound)
- Each request creates/destroys HTTP objects

Transit's persistent connections and binary protocol mean:
- No connection establishment per request
- No JSON parse/stringify overhead
- In-process Rust calls have zero serialization cost

### 3. Cross-Language Without Microservices

The traditional approach requires separate services:
```
chat-gateway (JS) → auth-service (Python) → message-router (Rust) → persistence (Java)
```

Each service needs: its own process, its own HTTP server, its own route definitions, its own health checks, its own deployment. Transit collapses this into one process calling into three languages.

### 4. Tail Latency (p95/p99)

Chat users notice slow messages. Under load, FastAPI's p95 latency degrades faster because:
- HTTP connection排队 (queuing)
- JSON serialization under GC pressure
- Thread pool exhaustion

Transit's in-process Rust calls maintain consistent tail latency because there's no queuing — it's a direct function call.

## Interpreting Results

- **mean** — average latency per operation
- **p95** — 95th percentile (what 95% of requests see)
- **p99** — 99th percentile (tail latency, worst-case user experience)
- **ops/sec** — throughput capacity
- **errors** — should be 0 (any errors indicate bugs)

## Key Metrics to Watch

| Metric | What It Tells You |
|--------|-------------------|
| Message Pipeline mean | End-to-end message delivery speed |
| Fan-out p95 | Worst-case group chat experience |
| Session Validation ops/sec | Maximum request throughput |
| Content Moderation mean | ML inference overhead |
| Concurrent scaling ratio | How well the system handles load |
