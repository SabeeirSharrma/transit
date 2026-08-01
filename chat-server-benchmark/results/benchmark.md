# Chat Server Benchmark Results

> Generated: 2026-08-01T08:19:02.997Z | Mode: Serial & Concurrent | Iterations: 100 | Warmup: 10

## Serial (single request, 100 iterations)

| Operation | FastAPI | Transit/Rust | Transit/Python | Transit/Java | gRPC | Thrift | Unix Sock | Subprocess | ZeroMQ | Redis | Winner |
|-----------|---------|--------------|----------------|--------------|------|--------|-----------|------------|--------|-------|--------|
| Message Send Pipeline (auth+mod+route+persist) | 0.77ms | 0.00ms | 0.10ms | 0.01ms | 0.15ms | 0.09ms | 0.18ms | 0.04ms | 0.08ms | N/Ams | **Transit/Rust** (235.6x faster) |
| Fan-out Delivery (50 recipients) | 0.54ms | 0.01ms | 0.30ms | 0.02ms | 0.18ms | 0.10ms | 0.26ms | 0.08ms | 0.14ms | N/Ams | **Transit/Rust** (48.1x faster) |
| Session Validation | 0.83ms | 0.00ms | 0.15ms | 0.01ms | 0.13ms | 0.08ms | 0.26ms | 0.05ms | 0.10ms | N/Ams | **Transit/Rust** (387.0x faster) |
| Typing Indicator | 1.10ms | 0.00ms | 0.19ms | 0.01ms | 0.24ms | 0.07ms | 0.17ms | 0.04ms | 0.10ms | N/Ams | **Transit/Rust** (618.4x faster) |
| Read Receipt | 0.69ms | 0.00ms | 0.20ms | 0.01ms | 0.20ms | 0.08ms | 0.22ms | 0.03ms | 0.11ms | N/Ams | **Transit/Rust** (303.1x faster) |
| Presence Update (30 contacts) | 0.91ms | 0.01ms | 0.21ms | 0.01ms | 0.13ms | 0.10ms | 0.21ms | 0.04ms | 0.10ms | N/Ams | **Transit/Java** (76.0x faster) |
| AI Content Moderation | 0.40ms | 0.01ms | 0.14ms | 0.01ms | 0.08ms | 0.06ms | 0.22ms | 0.04ms | 0.14ms | N/Ams | **Transit/Rust** (80.3x faster) |
| Message Search (1000 messages) | 5.45ms | 0.93ms | 4.37ms | 0.67ms | 1.04ms | 0.88ms | 2.49ms | 2.61ms | 2.43ms | N/Ams | **Transit/Java** (8.1x faster) |
| Analytics Pipeline (500 events) | 2.04ms | 0.43ms | 1.75ms | 0.32ms | 0.61ms | 0.48ms | 1.33ms | 1.24ms | 1.43ms | N/Ams | **Transit/Java** (6.3x faster) |
| Notification Builder (20 users) | 1.38ms | 0.01ms | 0.23ms | 0.02ms | 0.23ms | 0.07ms | 0.19ms | 0.03ms | 0.13ms | N/Ams | **Transit/Rust** (118.0x faster) |
| User Lookup | 0.77ms | 0.01ms | 0.14ms | 0.01ms | 0.19ms | 0.08ms | 0.24ms | 0.04ms | 0.11ms | N/Ams | **Transit/Rust** (139.1x faster) |
| Channel History (50 messages) | 1.44ms | 0.00ms | 0.14ms | 0.01ms | 0.23ms | 0.11ms | 0.17ms | 0.05ms | 0.09ms | N/Ams | **Transit/Rust** (943.2x faster) |

## Concurrent (10 parallel requests)

| Operation | FastAPI | Transit/Rust | Transit/Python | Transit/Java | gRPC | Thrift | Unix Sock | Subprocess | ZeroMQ | Redis | Winner |
|-----------|---------|--------------|----------------|--------------|------|--------|-----------|------------|--------|-------|--------|
| Message Send Pipeline (auth+mod+route+persist) | 3.01ms | 0.03ms | 0.90ms | 0.01ms | 0.43ms | 0.35ms | 0.87ms | 0.06ms | 0.10ms | N/Ams | **Transit/Java** (446.8x faster) |
| Fan-out Delivery (50 recipients) | 2.01ms | 0.09ms | 1.03ms | 0.04ms | 0.72ms | 0.42ms | 0.92ms | 0.10ms | 0.16ms | N/Ams | **Transit/Java** (46.3x faster) |
| Session Validation | 2.70ms | 0.04ms | 1.11ms | 0.01ms | 1.06ms | 0.40ms | 0.84ms | 0.06ms | 0.11ms | N/Ams | **Transit/Java** (209.4x faster) |
| Typing Indicator | 2.74ms | 0.03ms | 1.35ms | 0.01ms | 0.78ms | 0.35ms | 0.82ms | 0.06ms | 0.09ms | N/Ams | **Transit/Java** (201.4x faster) |
| Read Receipt | 1.56ms | 0.01ms | 0.84ms | 0.01ms | 0.41ms | 0.35ms | 0.77ms | 0.07ms | 100.16ms | N/Ams | **Transit/Rust** (139.9x faster) |
| Presence Update (30 contacts) | 5.44ms | 0.12ms | 1.47ms | 0.03ms | 1.29ms | 0.52ms | 0.84ms | 0.08ms | 0.10ms | N/Ams | **Transit/Java** (161.2x faster) |
| AI Content Moderation | 2.27ms | 0.02ms | 0.80ms | 0.01ms | 0.41ms | 0.39ms | 0.94ms | 0.08ms | 0.07ms | N/Ams | **Transit/Java** (377.9x faster) |
| Message Search (1000 messages) | 26.25ms | 5.20ms | 15.02ms | 0.66ms | 5.89ms | 4.70ms | 8.45ms | 5.42ms | 4.92ms | N/Ams | **Transit/Java** (39.7x faster) |
| Analytics Pipeline (500 events) | 12.99ms | 2.19ms | 5.90ms | 0.32ms | 3.42ms | 2.18ms | 5.11ms | 2.51ms | 2.43ms | N/Ams | **Transit/Java** (40.2x faster) |
| Notification Builder (20 users) | 6.35ms | 0.05ms | 0.57ms | 0.01ms | 0.44ms | 0.39ms | 0.91ms | 0.07ms | 0.09ms | N/Ams | **Transit/Java** (545.4x faster) |
| User Lookup | 2.02ms | 0.01ms | 0.76ms | 0.01ms | 0.38ms | 0.33ms | 0.72ms | 0.06ms | 0.06ms | N/Ams | **Transit/Java** (344.0x faster) |
| Channel History (50 messages) | 9.27ms | 0.03ms | 1.07ms | 0.01ms | 1.09ms | 0.57ms | 0.75ms | 0.06ms | 0.07ms | N/Ams | **Transit/Java** (691.9x faster) |

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
