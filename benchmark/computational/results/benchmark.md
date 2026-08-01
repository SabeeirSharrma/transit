# Computational Benchmark Results

> Generated: 2026-08-01T08:20:16.844Z | Mode: Serial & Concurrent | Iterations: 100 | Warmup: 10

## Correctness Validation

| Operation | Status | Backends Checked | Notes |
|-----------|--------|------------------|-------|
| ETL Pipeline (1000 rows) | WARN | 7 | grpc: 16 diffs; thrift: 16 diffs; unix_socket: 16 diffs; subprocess: 16 diffs; zeromq: 16 diffs; pyo3: 16 diffs |
| Text Analysis (5000 words) | WARN | 7 | grpc: 18 diffs; thrift: 18 diffs; unix_socket: 18 diffs; subprocess: 18 diffs; zeromq: 18 diffs; pyo3: 18 diffs |
| Matrix Multiply (50×50) | WARN | 7 | grpc: 2500 diffs; thrift: 2500 diffs; unix_socket: 2500 diffs; subprocess: 2500 diffs; zeromq: 2500 diffs; pyo3: 2500 diffs |
| Matrix Determinant (8×8) | WARN | 7 | grpc: 1 diffs; thrift: 1 diffs; unix_socket: 1 diffs; subprocess: 1 diffs; zeromq: 1 diffs; pyo3: 1 diffs |
| Graph Processing (500 nodes) | WARN | 7 | grpc: 3 diffs; thrift: 3 diffs; unix_socket: 3 diffs; subprocess: 3 diffs; zeromq: 3 diffs; pyo3: 973 diffs |
| Fibonacci Memo (n=38) | PASS | 7 | All backends match |
| SHA-256 Hashing (10K rounds) | PASS | 7 | All backends match |

## Serial (single request, 100 iterations)

| Operation | FastAPI (ms) | FastAPI (ops/s) | Transit/Rust (ms) | Transit/Rust (ops/s) | Transit/Python (ms) | Transit/Python (ops/s) | Transit/Java (ms) | Transit/Java (ops/s) | gRPC (ms) | gRPC (ops/s) | Thrift (ms) | Thrift (ops/s) | Unix Socket (ms) | Unix Socket (ops/s) | Subprocess (ms) | Subprocess (ops/s) | ZeroMQ (ms) | ZeroMQ (ops/s) | Redis (ms) | Redis (ops/s) | PyO3 (ms) | PyO3 (ops/s) | Winner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ETL Pipeline (1000 rows) | 1.92 | 521.7 | 0.29 | 3390.7 | 1.86 | 537.8 | 0.34 | 2917.3 | 2.99 | 334.9 | 2.31 | 433.4 | 1.62 | 616.6 | 0.85 | 1180.5 | 1.26 | 794.5 | N/A | N/A | 0.67 | 1492.0 | **Transit/Rust** (6.5x faster) |
| Text Analysis (5000 words) | 16.15 | 61.9 | 0.70 | 1424.6 | 14.26 | 70.1 | 0.57 | 1755.6 | 13.37 | 74.8 | 28.02 | 35.7 | 15.25 | 65.6 | 11.54 | 86.6 | 11.57 | 86.5 | N/A | N/A | 2.54 | 394.4 | **Transit/Java** (28.4x faster) |
| Matrix Multiply (50×50) | 27.51 | 36.4 | 0.98 | 1020.9 | 17.63 | 56.7 | 1.02 | 980.4 | 19.12 | 52.3 | 48.96 | 20.4 | 19.04 | 52.5 | 17.05 | 58.7 | 17.42 | 57.4 | N/A | N/A | 4.69 | 213.3 | **Transit/Rust** (28.1x faster) |
| Matrix Determinant (8×8) | 22.20 | 45.0 | 0.09 | 11535.1 | 21.81 | 45.9 | 0.03 | 37828.4 | 26.97 | 37.1 | 33.04 | 30.3 | 33.06 | 30.3 | 25.48 | 39.3 | 25.65 | 39.0 | N/A | N/A | 2.00 | 500.8 | **Transit/Java** (840.0x faster) |
| Graph Processing (500 nodes) | 10.24 | 97.7 | 0.24 | 4213.6 | 6.81 | 146.8 | 0.35 | 2842.7 | 6.79 | 147.2 | 17.02 | 58.8 | 9.89 | 101.1 | 4.84 | 206.4 | 5.61 | 178.2 | N/A | N/A | 1.95 | 512.8 | **Transit/Rust** (43.1x faster) |
| Fibonacci Memo (n=38) | 1.14 | 877.3 | 0.04 | 28030.8 | 0.19 | 5278.0 | 0.01 | 67279.5 | 1.63 | 612.9 | 0.32 | 3092.3 | 0.26 | 3916.9 | 0.08 | 12140.9 | 0.19 | 5310.8 | N/A | N/A | 0.03 | 29726.5 | **Transit/Java** (76.7x faster) |
| SHA-256 Hashing (10K rounds) | 5.00 | 200.0 | 0.02 | 52708.6 | 4.28 | 233.5 | 0.01 | 76779.6 | 5.66 | 176.7 | 11.69 | 85.6 | 10.65 | 93.9 | 4.34 | 230.7 | 4.50 | 222.0 | N/A | N/A | 0.97 | 1030.2 | **Transit/Java** (383.8x faster) |

## Concurrent (undefined parallel requests)

| Operation | FastAPI (ms) | FastAPI (ops/s) | Transit/Rust (ms) | Transit/Rust (ops/s) | Transit/Python (ms) | Transit/Python (ops/s) | Transit/Java (ms) | Transit/Java (ops/s) | gRPC (ms) | gRPC (ops/s) | Thrift (ms) | Thrift (ops/s) | Unix Socket (ms) | Unix Socket (ops/s) | Subprocess (ms) | Subprocess (ops/s) | ZeroMQ (ms) | ZeroMQ (ops/s) | Redis (ms) | Redis (ops/s) | PyO3 (ms) | PyO3 (ops/s) | Winner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ETL Pipeline (1000 rows) | 12.08 | 82.8 | 1.32 | 758.4 | 4.88 | 204.8 | 0.29 | 3462.7 | 13.85 | 72.2 | 7.82 | 127.9 | 5.58 | 179.1 | 2.07 | 482.9 | 1.47 | 680.0 | N/A | N/A | 1.81 | 551.6 | **Transit/Java** (41.8x faster) |
| Text Analysis (5000 words) | 123.25 | 8.1 | 3.39 | 294.6 | 265.14 | 3.8 | 0.54 | 1846.5 | 203.51 | 4.9 | 224.69 | 4.5 | 190.27 | 5.3 | 55.41 | 18.0 | 6.24 | 160.4 | N/A | N/A | 8.25 | 121.2 | **Transit/Java** (227.6x faster) |
| Matrix Multiply (50×50) | 224.40 | 4.5 | 5.75 | 174.1 | 233.88 | 4.3 | 0.94 | 1063.1 | 301.93 | 3.3 | 276.69 | 3.6 | 249.19 | 4.0 | 70.60 | 14.2 | 9.89 | 101.2 | N/A | N/A | 17.82 | 56.1 | **Transit/Java** (238.6x faster) |
| Matrix Determinant (8×8) | 193.16 | 5.2 | 0.49 | 2022.5 | 442.52 | 2.3 | 0.04 | 23147.6 | 494.71 | 2.0 | 519.93 | 1.9 | 411.62 | 2.4 | 139.03 | 7.2 | 8.28 | 120.8 | N/A | N/A | 9.99 | 100.1 | **Transit/Java** (4471.3x faster) |
| Graph Processing (500 nodes) | 80.25 | 12.5 | 2.16 | 463.6 | 115.21 | 8.7 | 0.37 | 2667.9 | 85.98 | 11.6 | 80.49 | 12.4 | 39.43 | 25.4 | 21.37 | 46.8 | 3.30 | 302.8 | N/A | N/A | 5.32 | 188.0 | **Transit/Java** (214.1x faster) |
| Fibonacci Memo (n=38) | 3.66 | 273.1 | 0.10 | 10400.0 | 0.86 | 1166.6 | 0.01 | 122039.9 | 4.34 | 230.3 | 1.16 | 860.5 | 0.65 | 1538.3 | 0.18 | 5469.2 | 0.09 | 11258.4 | N/A | N/A | 0.14 | 7290.8 | **Transit/Java** (446.9x faster) |
| SHA-256 Hashing (10K rounds) | 40.34 | 24.8 | 0.26 | 3862.8 | 81.12 | 12.3 | 0.02 | 50664.5 | 84.08 | 11.9 | 84.15 | 11.9 | 30.57 | 32.7 | 22.99 | 43.5 | 1.79 | 560.2 | N/A | N/A | 4.38 | 228.5 | **Transit/Java** (2043.6x faster) |

## Key Takeaways

| Backend | Protocol | Serialization | Connection Model |
|---------|----------|---------------|------------------|
| **Transit/Rust** | In-process native addon | Zero-copy | Direct function call |
| **Transit/Python** | TCP | Binary (orjson) | Persistent bridge |
| **Transit/Java** | TCP | Binary | Persistent bridge |
| **FastAPI** | HTTP/1.1 | JSON | HTTP request/response |
| **gRPC** | HTTP/2 | Protocol Buffers | Persistent stream |
| **Thrift** | TCP | Binary | Persistent connection |
| **Unix Socket** | Unix domain socket | JSON | Persistent connection |
| **Subprocess** | stdin/stdout | JSON | Persistent process |
| **ZeroMQ** | TCP | JSON | REQ/REP socket |
| **Redis Pub/Sub** | TCP | JSON | Pub/Sub channels |
| **PyO3** | In-process via Python | Python dict | Direct FFI call |

- Transit/Rust eliminates all IPC overhead — zero serialization, zero context switches
- Transit/Python and Transit/Java use a persistent TCP bridge — no HTTP overhead
- gRPC and Thrift use binary protocols but still require IPC serialization
- ZeroMQ and Unix Socket reduce overhead vs HTTP but still serialize to JSON
- Redis Pub/Sub adds broker overhead — useful for fan-out, costly for request/response
- PyO3 measures Rust FFI overhead from Python — lower bound for cross-language calls
- Subprocess has highest overhead due to process startup and stdin/stdout pipe buffering
