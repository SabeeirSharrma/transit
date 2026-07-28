# Chat Server Benchmark Results

> Generated: 2026-07-28T17:25:11.319Z | Mode: Serial | Iterations: 100 | Warmup: 10

## Serial (single request, 100 iterations)

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

## Key Takeaways

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
