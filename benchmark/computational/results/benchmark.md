# Computational Benchmark Results

> Generated: 2026-07-28T13:06:34.706Z | Mode: Serial & Concurrent | Iterations: 100 | Warmup: 10

## Serial (single request, 100 iterations)

| Operation | FastAPI (ms) | FastAPI (ops/s) | Transit/Rust (ms) | Transit/Rust (ops/s) | Transit/Python (ms) | Transit/Python (ops/s) | Transit/Java (ms) | Transit/Java (ops/s) | Winner |
|-----------|-------------|-----------------|-------------------|----------------------|---------------------|------------------------|-------------------|----------------------|--------|
| ETL Pipeline (1000 rows) | 2.90 | 344.3 | 0.32 | 3143.6 | 1.04 | 958.4 | 0.43 | 2329.1 | **Transit/Rust** (9.1x faster) |
| Text Analysis (5000 words) | 16.13 | 62.0 | 0.74 | 1357.5 | 15.97 | 62.6 | 0.65 | 1534.8 | **Transit/Java** (24.8x faster) |
| Matrix Multiply (50×50) | 26.97 | 37.1 | 1.20 | 834.2 | 21.07 | 47.5 | 1.22 | 820.1 | **Transit/Rust** (22.5x faster) |
| Matrix Determinant (8×8) | 21.61 | 46.3 | 0.06 | 15606.8 | 23.41 | 42.7 | 0.27 | 3711.6 | **Transit/Rust** (337.3x faster) |
| Graph Processing (500 nodes) | 10.78 | 92.8 | 0.37 | 2733.9 | 7.32 | 136.7 | 0.30 | 3356.8 | **Transit/Java** (36.2x faster) |
| Fibonacci Memo (n=38) | 0.80 | 1253.9 | 0.02 | 61166.2 | 0.13 | 7858.5 | 0.09 | 11549.6 | **Transit/Rust** (48.8x faster) |
| SHA-256 Hashing (10K rounds) | 5.06 | 197.7 | 0.03 | 37201.8 | 7.40 | 135.2 | 0.08 | 12087.1 | **Transit/Rust** (188.2x faster) |

## Concurrent (undefined parallel requests)

| Operation | FastAPI (ms) | FastAPI (ops/s) | Transit/Rust (ms) | Transit/Rust (ops/s) | Transit/Python (ms) | Transit/Python (ops/s) | Transit/Java (ms) | Transit/Java (ops/s) | Winner |
|-----------|-------------|-----------------|-------------------|----------------------|---------------------|------------------------|-------------------|----------------------|--------|
| ETL Pipeline (1000 rows) | 9.45 | 105.8 | 1.56 | 642.8 | 4.07 | 245.8 | 2.65 | 377.6 | **Transit/Rust** (6.1x faster) |
| Text Analysis (5000 words) | 133.67 | 7.5 | 4.13 | 242.3 | 157.02 | 6.4 | 2.99 | 334.2 | **Transit/Java** (44.7x faster) |
| Matrix Multiply (50×50) | 226.82 | 4.4 | 6.46 | 154.8 | 220.53 | 4.5 | 6.85 | 146.1 | **Transit/Rust** (35.1x faster) |
| Matrix Determinant (8×8) | 232.45 | 4.3 | 0.21 | 4666.2 | 352.78 | 2.8 | 2.29 | 437.4 | **Transit/Rust** (1084.7x faster) |
| Graph Processing (500 nodes) | 93.12 | 10.7 | 2.08 | 481.9 | 112.04 | 8.9 | 3.11 | 321.6 | **Transit/Rust** (44.9x faster) |
| Fibonacci Memo (n=38) | 2.31 | 433.0 | 0.09 | 10636.5 | 0.39 | 2536.1 | 0.70 | 1437.9 | **Transit/Rust** (24.6x faster) |
| SHA-256 Hashing (10K rounds) | 43.04 | 23.2 | 0.12 | 8406.5 | 76.30 | 13.1 | 0.69 | 1455.4 | **Transit/Rust** (361.8x faster) |

## Key Takeaways

- **Transit/Rust** uses an in-process native addon — zero serialization overhead
- **Transit/Python** and **Transit/Java** use a persistent TCP bridge — no HTTP overhead
- **FastAPI** uses HTTP/JSON — full serialization cost on every request
- Under concurrent load, Transit's persistent connections avoid TCP handshake overhead
