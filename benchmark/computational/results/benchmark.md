# Computational Benchmark Results

> Generated: 2026-08-15T09:21:26.096Z | Mode: Serial & Concurrent | Iterations: 100 | Warmup: 10

## Correctness Validation

| Operation | Status | Backends Checked | Notes |
|-----------|--------|------------------|-------|
| ETL Pipeline (1000 rows) | WARN | 7 | grpc: 16 diffs; thrift: 16 diffs; unix_socket: 16 diffs; subprocess: 16 diffs; zeromq: 16 diffs; pyo3: 16 diffs |
| Text Analysis (5000 words) | WARN | 7 | grpc: 20 diffs; thrift: 20 diffs; unix_socket: 20 diffs; subprocess: 20 diffs; zeromq: 20 diffs; pyo3: 20 diffs |
| Matrix Multiply (50×50) | WARN | 7 | grpc: 2500 diffs; thrift: 2500 diffs; unix_socket: 2500 diffs; subprocess: 2500 diffs; zeromq: 2500 diffs; pyo3: 2500 diffs |
| Matrix Determinant (8×8) | WARN | 7 | grpc: 1 diffs; thrift: 1 diffs; unix_socket: 1 diffs; subprocess: 1 diffs; zeromq: 1 diffs; pyo3: 1 diffs |
| Graph Processing (500 nodes) | WARN | 7 | grpc: 4 diffs; thrift: 4 diffs; unix_socket: 4 diffs; subprocess: 4 diffs; zeromq: 4 diffs; pyo3: 974 diffs |
| Fibonacci Memo (n=38) | PASS | 7 | All backends match |
| SHA-256 Hashing (10K rounds) | PASS | 7 | All backends match |

## Serial (single request, 100 iterations)

| Operation | FastAPI (ms) | FastAPI (ops/s) | Transit/Rust (ms) | Transit/Rust (ops/s) | Transit/Python (ms) | Transit/Python (ops/s) | Transit/Java (ms) | Transit/Java (ops/s) | Transit/C (ms) | Transit/C (ops/s) | Transit/C++ (ms) | Transit/C++ (ops/s) | gRPC (ms) | gRPC (ops/s) | Thrift (ms) | Thrift (ops/s) | Unix Socket (ms) | Unix Socket (ops/s) | Subprocess (ms) | Subprocess (ops/s) | ZeroMQ (ms) | ZeroMQ (ops/s) | Redis (ms) | Redis (ops/s) | PyO3 (ms) | PyO3 (ops/s) | Winner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ETL Pipeline (1000 rows) | 3.62 | 276.0 | 0.35 | 2847.9 | 1.48 | 675.5 | 0.31 | 3214.3 | 0.19 | 5166.3 | 0.18 | 5439.4 | 3.26 | 307.1 | 2.10 | 476.3 | 0.98 | 1022.3 | 0.88 | 1134.7 | 1.47 | 681.3 | N/A | N/A | 0.88 | 1136.6 | **Transit/C++** (19.7x faster) |
| Text Analysis (5000 words) | 16.10 | 62.1 | 0.46 | 2182.6 | 15.11 | 66.2 | 0.66 | 1524.9 | 6.78 | 147.5 | 2.70 | 370.6 | 13.68 | 73.1 | 27.74 | 36.0 | 16.18 | 61.8 | 11.99 | 83.4 | 12.10 | 82.6 | N/A | N/A | 2.47 | 404.9 | **Transit/Rust** (35.1x faster) |
| Matrix Multiply (50×50) | 28.38 | 35.2 | 1.11 | 904.8 | 18.14 | 55.1 | 1.02 | 985.0 | 2.34 | 427.1 | 2.01 | 496.3 | 20.75 | 48.2 | 46.52 | 21.5 | 22.81 | 43.8 | 17.73 | 56.4 | 17.78 | 56.2 | N/A | N/A | 5.69 | 175.7 | **Transit/Java** (28.0x faster) |
| Matrix Determinant (8×8) | 23.05 | 43.4 | 0.03 | 28690.0 | 22.54 | 44.4 | 0.05 | 18906.8 | 0.43 | 2329.5 | 0.66 | 1518.2 | 29.94 | 33.4 | 39.73 | 25.2 | 33.48 | 29.9 | 26.22 | 38.1 | 26.51 | 37.7 | N/A | N/A | 2.09 | 479.4 | **Transit/Rust** (661.3x faster) |
| Graph Processing (500 nodes) | 10.96 | 91.2 | 0.17 | 5890.7 | 6.49 | 154.2 | 0.37 | 2683.9 | 0.43 | 2299.1 | 0.44 | 2253.3 | 7.36 | 135.9 | 17.04 | 58.7 | 8.79 | 113.7 | 5.65 | 177.0 | 5.28 | 189.4 | N/A | N/A | 1.81 | 551.9 | **Transit/Rust** (64.6x faster) |
| Fibonacci Memo (n=38) | 0.72 | 1389.9 | 0.04 | 23491.0 | 0.10 | 9971.1 | 0.01 | 124731.8 | 0.01 | 186745.2 | 0.01 | 163875.6 | 1.52 | 659.6 | 0.31 | 3236.7 | 0.26 | 3796.4 | 0.07 | 13422.0 | 0.10 | 9632.1 | N/A | N/A | 0.05 | 19549.7 | **Transit/C** (134.4x faster) |
| SHA-256 Hashing (10K rounds) | 5.48 | 182.6 | 0.02 | 41867.3 | 4.70 | 212.6 | 0.01 | 141353.3 | 0.83 | 1200.6 | 0.88 | 1133.3 | 6.23 | 160.4 | 8.54 | 117.0 | 7.86 | 127.2 | 4.70 | 212.9 | 4.74 | 210.9 | N/A | N/A | 1.00 | 997.6 | **Transit/Java** (774.0x faster) |

## Concurrent (undefined parallel requests)

| Operation | FastAPI (ms) | FastAPI (ops/s) | Transit/Rust (ms) | Transit/Rust (ops/s) | Transit/Python (ms) | Transit/Python (ops/s) | Transit/Java (ms) | Transit/Java (ops/s) | Transit/C (ms) | Transit/C (ops/s) | Transit/C++ (ms) | Transit/C++ (ops/s) | gRPC (ms) | gRPC (ops/s) | Thrift (ms) | Thrift (ops/s) | Unix Socket (ms) | Unix Socket (ops/s) | Subprocess (ms) | Subprocess (ops/s) | ZeroMQ (ms) | ZeroMQ (ops/s) | Redis (ms) | Redis (ops/s) | PyO3 (ms) | PyO3 (ops/s) | Winner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ETL Pipeline (1000 rows) | 9.77 | 102.4 | 1.42 | 702.6 | 5.26 | 190.0 | 0.21 | 4830.1 | 1.17 | 851.4 | 1.10 | 906.1 | 10.39 | 96.2 | 6.96 | 143.8 | 5.06 | 197.5 | 2.46 | 406.3 | 1.30 | 772.2 | N/A | N/A | 2.00 | 500.4 | **Transit/Java** (47.2x faster) |
| Text Analysis (5000 words) | 142.11 | 7.0 | 3.71 | 269.5 | 238.16 | 4.2 | 0.48 | 2083.6 | 39.50 | 25.3 | 15.00 | 66.7 | 169.74 | 5.9 | 224.13 | 4.5 | 153.13 | 6.5 | 60.86 | 16.4 | 6.96 | 143.6 | N/A | N/A | 9.21 | 108.6 | **Transit/Java** (296.1x faster) |
| Matrix Multiply (50×50) | 240.68 | 4.2 | 6.47 | 154.6 | 233.05 | 4.3 | 1.16 | 861.5 | 12.36 | 80.9 | 11.40 | 87.7 | 285.44 | 3.5 | 307.64 | 3.3 | 275.66 | 3.6 | 73.54 | 13.6 | 11.13 | 89.9 | N/A | N/A | 19.77 | 50.6 | **Transit/Java** (207.3x faster) |
| Matrix Determinant (8×8) | 208.09 | 4.8 | 0.50 | 2001.6 | 450.87 | 2.2 | 0.07 | 15135.9 | 1.86 | 536.8 | 3.65 | 274.1 | 520.80 | 1.9 | 616.82 | 1.6 | 369.29 | 2.7 | 149.82 | 6.7 | 8.59 | 116.4 | N/A | N/A | 11.37 | 88.0 | **Transit/Java** (3149.6x faster) |
| Graph Processing (500 nodes) | 91.00 | 11.0 | 2.10 | 476.6 | 107.36 | 9.3 | 0.19 | 5331.9 | 2.90 | 344.5 | 2.48 | 403.1 | 82.69 | 12.1 | 72.06 | 13.9 | 43.41 | 23.0 | 24.24 | 41.3 | 3.05 | 327.7 | N/A | N/A | 5.82 | 171.8 | **Transit/Java** (485.2x faster) |
| Fibonacci Memo (n=38) | 2.98 | 335.8 | 0.15 | 6664.8 | 1.16 | 859.8 | 0.01 | 108312.2 | 0.03 | 29227.7 | 0.04 | 27929.5 | 3.37 | 296.4 | 1.19 | 840.5 | 0.79 | 1258.1 | 0.13 | 7601.4 | 100.21 | 10.0 | N/A | N/A | 0.27 | 3651.3 | **Transit/Java** (322.5x faster) |
| SHA-256 Hashing (10K rounds) | 43.64 | 22.9 | 0.39 | 2575.6 | 77.50 | 12.9 | 0.02 | 43158.5 | 4.24 | 235.8 | 4.75 | 210.7 | 78.93 | 12.7 | 80.96 | 12.4 | 30.93 | 32.3 | 26.63 | 37.6 | 0.26 | 3867.9 | N/A | N/A | 3.65 | 274.1 | **Transit/Java** (1883.3x faster) |

## Key Takeaways

| Backend | Protocol | Serialization | Connection Model |
|---------|----------|---------------|------------------|
| **Transit/Rust** | In-process native addon | Zero-copy | Direct function call |
| **Transit/C** | In-process native addon | Zero-copy | Direct function call |
| **Transit/C++** | In-process native addon | Zero-copy | Direct function call |
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

- Transit/Rust, Transit/C, and Transit/C++ eliminate all IPC overhead — zero serialization, zero context switches
- Transit/Python and Transit/Java use a persistent TCP bridge — no HTTP overhead
- gRPC and Thrift use binary protocols but still require IPC serialization
- ZeroMQ and Unix Socket reduce overhead vs HTTP but still serialize to JSON
- Redis Pub/Sub adds broker overhead — useful for fan-out, costly for request/response
- PyO3 measures Rust FFI overhead from Python — lower bound for cross-language calls
- Subprocess has highest overhead due to process startup and stdin/stdout pipe buffering
