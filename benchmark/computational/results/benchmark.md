# Computational Benchmark Results

> Generated: 2026-07-28T16:26:28.905Z | Mode: Serial & Concurrent | Iterations: 100 | Warmup: 10

## Correctness Validation

| Operation | Status | Backends Checked | Notes |
|-----------|--------|------------------|-------|
| ETL Pipeline (1000 rows) | WARN | 8 | grpc: 16 diffs; thrift: 16 diffs; unix_socket: 16 diffs; subprocess: 16 diffs; zeromq: 16 diffs; redis: 16 diffs; pyo3: 16 diffs |
| Text Analysis (5000 words) | WARN | 8 | grpc: 17 diffs; thrift: 17 diffs; unix_socket: 17 diffs; subprocess: 17 diffs; zeromq: 17 diffs; redis: 17 diffs; pyo3: 17 diffs |
| Matrix Multiply (50×50) | WARN | 8 | grpc: 2500 diffs; thrift: 2500 diffs; unix_socket: 2500 diffs; subprocess: 2500 diffs; zeromq: 2500 diffs; redis: 2500 diffs; pyo3: 2500 diffs |
| Matrix Determinant (8×8) | WARN | 8 | grpc: 1 diffs; thrift: 1 diffs; unix_socket: 1 diffs; subprocess: 1 diffs; zeromq: 1 diffs; redis: 1 diffs; pyo3: 1 diffs |
| Graph Processing (500 nodes) | WARN | 8 | grpc: 466 diffs; thrift: 466 diffs; unix_socket: 466 diffs; subprocess: 466 diffs; zeromq: 466 diffs; redis: 466 diffs; pyo3: 1431 diffs |
| Fibonacci Memo (n=38) | PASS | 8 | All backends match |
| SHA-256 Hashing (10K rounds) | PASS | 8 | All backends match |

## Serial (single request, 100 iterations)

| Operation | FastAPI (ms) | FastAPI (ops/s) | Transit/Rust (ms) | Transit/Rust (ops/s) | Transit/Python (ms) | Transit/Python (ops/s) | Transit/Java (ms) | Transit/Java (ops/s) | gRPC (ms) | gRPC (ops/s) | Thrift (ms) | Thrift (ops/s) | Unix Socket (ms) | Unix Socket (ops/s) | Subprocess (ms) | Subprocess (ops/s) | ZeroMQ (ms) | ZeroMQ (ops/s) | Redis (ms) | Redis (ops/s) | PyO3 (ms) | PyO3 (ops/s) | Winner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ETL Pipeline (1000 rows) | 2.06 | 486.3 | 0.29 | 3480.9 | 1.13 | 885.0 | 0.40 | 2499.6 | 2.47 | 404.4 | 2.37 | 421.9 | 1.40 | 712.1 | 1.62 | 617.3 | 1.89 | 529.4 | 2.10 | 477.2 | 0.61 | 1634.7 | **Transit/Rust** (7.2x faster) |
| Text Analysis (5000 words) | 15.78 | 63.4 | 0.71 | 1409.7 | 15.24 | 65.6 | 0.41 | 2415.3 | 14.30 | 70.0 | 26.62 | 37.6 | 16.84 | 59.4 | 11.91 | 84.0 | 11.86 | 84.3 | 12.16 | 82.2 | 2.52 | 397.4 | **Transit/Java** (38.1x faster) |
| Matrix Multiply (50×50) | 28.85 | 34.7 | 1.19 | 839.2 | 18.39 | 54.4 | 1.24 | 803.3 | 20.18 | 49.6 | 54.59 | 18.3 | 20.73 | 48.2 | 18.22 | 54.9 | 18.27 | 54.7 | 18.28 | 54.7 | 3.80 | 263.2 | **Transit/Rust** (24.2x faster) |
| Matrix Determinant (8×8) | 22.72 | 44.0 | 0.08 | 12488.4 | 22.10 | 45.2 | 0.11 | 8966.5 | 27.36 | 36.6 | 37.44 | 26.7 | 32.84 | 30.4 | 26.10 | 38.3 | 25.01 | 40.0 | 26.19 | 38.2 | 2.06 | 486.0 | **Transit/Rust** (283.8x faster) |
| Graph Processing (500 nodes) | 10.55 | 94.8 | 0.37 | 2695.1 | 6.95 | 143.8 | 0.51 | 1953.8 | 6.53 | 153.2 | 13.36 | 74.8 | 11.51 | 86.9 | 5.04 | 198.5 | 6.03 | 165.9 | 5.56 | 179.9 | 2.17 | 460.9 | **Transit/Rust** (28.4x faster) |
| Fibonacci Memo (n=38) | 1.14 | 874.7 | 0.05 | 19872.8 | 0.19 | 5339.6 | 0.08 | 12488.3 | 1.00 | 996.4 | 0.24 | 4131.0 | 0.19 | 5324.1 | 0.06 | 15432.5 | 0.09 | 10529.6 | 0.55 | 1804.3 | 0.09 | 11377.4 | **Transit/Rust** (22.7x faster) |
| SHA-256 Hashing (10K rounds) | 5.20 | 192.2 | 0.06 | 18024.0 | 4.75 | 210.4 | 0.16 | 6311.5 | 5.67 | 176.4 | 9.19 | 108.8 | 9.82 | 101.9 | 4.66 | 214.4 | 4.89 | 204.3 | 5.17 | 193.3 | 0.69 | 1442.2 | **Transit/Rust** (93.8x faster) |

## Concurrent (undefined parallel requests)

| Operation | FastAPI (ms) | FastAPI (ops/s) | Transit/Rust (ms) | Transit/Rust (ops/s) | Transit/Python (ms) | Transit/Python (ops/s) | Transit/Java (ms) | Transit/Java (ops/s) | gRPC (ms) | gRPC (ops/s) | Thrift (ms) | Thrift (ops/s) | Unix Socket (ms) | Unix Socket (ops/s) | Subprocess (ms) | Subprocess (ops/s) | ZeroMQ (ms) | ZeroMQ (ops/s) | Redis (ms) | Redis (ops/s) | PyO3 (ms) | PyO3 (ops/s) | Winner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ETL Pipeline (1000 rows) | 15.35 | 65.1 | 1.44 | 695.3 | 6.15 | 162.5 | 1.89 | 528.6 | 13.16 | 76.0 | 6.55 | 152.6 | 4.45 | 224.9 | 1.95 | 512.3 | 1.26 | 791.6 | 3.65 | 274.0 | 1.08 | 922.8 | **PyO3** (14.2x faster) |
| Text Analysis (5000 words) | 131.42 | 7.6 | 3.61 | 277.1 | 235.37 | 4.2 | 3.99 | 250.3 | 177.89 | 5.6 | 174.62 | 5.7 | 168.55 | 5.9 | 64.48 | 15.5 | 6.38 | 156.7 | 61.35 | 16.3 | 9.90 | 101.0 | **Transit/Rust** (36.4x faster) |
| Matrix Multiply (50×50) | 227.63 | 4.4 | 5.83 | 171.5 | 236.01 | 4.2 | 7.24 | 138.0 | 222.78 | 4.5 | 239.70 | 4.2 | 214.76 | 4.7 | 77.20 | 13.0 | 10.55 | 94.8 | 80.37 | 12.4 | 17.94 | 55.8 | **Transit/Rust** (39.0x faster) |
| Matrix Determinant (8×8) | 200.48 | 5.0 | 0.54 | 1868.1 | 381.61 | 2.6 | 1.91 | 523.9 | 369.21 | 2.7 | 400.01 | 2.5 | 339.41 | 2.9 | 142.29 | 7.0 | 8.91 | 112.3 | 157.44 | 6.4 | 10.77 | 92.8 | **Transit/Rust** (374.5x faster) |
| Graph Processing (500 nodes) | 91.94 | 10.9 | 2.07 | 482.3 | 108.39 | 9.2 | 3.32 | 301.2 | 63.66 | 15.7 | 56.09 | 17.8 | 42.31 | 23.6 | 28.29 | 35.3 | 2.45 | 408.7 | 30.37 | 32.9 | 7.19 | 139.2 | **Transit/Rust** (44.3x faster) |
| Fibonacci Memo (n=38) | 4.30 | 232.4 | 0.11 | 9433.8 | 0.71 | 1403.2 | 1.77 | 564.3 | 3.40 | 294.3 | 1.50 | 667.8 | 0.71 | 1407.4 | 0.10 | 10514.3 | 0.09 | 10827.9 | 1.01 | 987.3 | 0.15 | 6511.3 | **ZeroMQ** (46.6x faster) |
| SHA-256 Hashing (10K rounds) | 46.42 | 21.5 | 0.26 | 3879.0 | 65.39 | 15.3 | 1.86 | 538.8 | 54.91 | 18.2 | 46.18 | 21.7 | 27.70 | 36.1 | 28.49 | 35.1 | 1.71 | 585.2 | 28.53 | 35.0 | 4.68 | 213.8 | **Transit/Rust** (180.1x faster) |

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
