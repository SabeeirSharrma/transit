# Chat Server Benchmark Results

> Generated: 2026-08-15T09:37:15.500Z | Mode: Serial & Concurrent | Iterations: 100 | Warmup: 10

## Serial (single request, 100 iterations)

| Operation | FastAPI | Transit/Rust | Transit/Python | Transit/Java | Transit/C | Transit/C++ | gRPC | Thrift | Unix Sock | Subprocess | ZeroMQ | Redis | Winner |
|-----------|---------|--------------|----------------|--------------|-----------|-------------|------|--------|-----------|------------|--------|-------|--------|
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

## Concurrent (10 parallel requests)

| Operation | FastAPI | Transit/Rust | Transit/Python | Transit/Java | Transit/C | Transit/C++ | gRPC | Thrift | Unix Sock | Subprocess | ZeroMQ | Redis | Winner |
|-----------|---------|--------------|----------------|--------------|-----------|-------------|------|--------|-----------|------------|--------|-------|--------|
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

## Key Takeaways

| Backend | Protocol | Serialization | Connection Model |
|---------|----------|---------------|------------------|
| **Transit/Rust** | In-process native addon | Zero-copy | Direct function call |
| **Transit/Python** | TCP | Binary | Persistent bridge |
| **Transit/Java** | TCP | Binary | Persistent bridge |
| **Transit/C** | In-process native addon | Zero-copy | Direct function call |
| **Transit/C++** | In-process native addon | Zero-copy | Direct function call |
| **FastAPI** | HTTP/1.1 | JSON | HTTP request/response |
| **gRPC** | HTTP/2 | Protobuf | Persistent channel |
| **Thrift** | TCP | Binary | One connection per call |
| **Unix Socket** | UDS | Length-prefixed JSON | One socket per call |
| **Subprocess** | stdin/stdout | Line-delimited JSON | Long-lived subprocess |
| **ZeroMQ** | TCP | JSON | Persistent REQ/REP |
| **Redis Pub/Sub** | TCP (via Redis) | JSON | Persistent connections |
