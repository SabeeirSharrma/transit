# Transit Showcase Demo

A self-contained demo that shows [Transit](https://github.com/sabeeirsharrma/transit) calling **Rust**, **Python**, and **Java** functions from a single JavaScript process — no APIs, no JSON schemas, no glue code.

## What It Demonstrates

| Demo | Languages | What Happens |
| ------ | ----------- | ------------- |
| **Simple Calls** | Rust → Python → Java | Greeting, fibonacci, text analysis, ID generation |
| **Matrix Multiply** | Rust only | 100×100 matrix multiply with timing |
| **Data Pipeline** | Python only | Normalize numbers, compute statistics |
| **Batch Processing** | Java only | Process 10 records in parallel, then compute batch stats |
| **Cross-Language Chain** | Rust → Python → Java → JS | Primes computed in Rust, transformed in Python, enriched in Java, formatted in Python |

## Prerequisites

| Tool | Version | Check |
| ------ | --------- | ------- |
| **Node.js** | ≥ 20 | `node --version` |
| **Rust** | any stable | `rustc --version` |
| **Python** | ≥ 3.10 | `python3 --version` |
| **Java** | JDK 21+ | `java --version` |
| **bun** or **npm** | any | `bun --version` |

## Setup

```bash
# Install dependencies
bun install    # or: npm install

# Build the Rust native addon
cd rust && cargo build --release && cp target/release/libtransit_showcase.so index.node && cd ..

# Build the Java runtime + demo classes
mkdir -p java/build
# Download Transit Java runtime (BinaryProtocol, TransitServer, TransitService)
mkdir -p java/lib/transit/java
curl -sO "https://raw.githubusercontent.com/sabeeirsharrma/transit/main/packages/transit-java-runtime/src/main/java/transit/java/BinaryProtocol.java" --output-dir java/lib/transit/java/
curl -sO "https://raw.githubusercontent.com/sabeeirsharrma/transit/main/packages/transit-java-runtime/src/main/java/transit/java/TransitServer.java" --output-dir java/lib/transit/java/
curl -sO "https://raw.githubusercontent.com/sabeeirsharrma/transit/main/packages/transit-java-runtime/src/main/java/transit/java/TransitService.java" --output-dir java/lib/transit/java/
# Compile everything
javac -d java/build java/lib/transit/java/*.java
javac -cp java/build -d java/build java/src/main/java/com/demo/*.java
```

> **Mac users:** Replace `libtransit_showcase.so` with `libtransit_showcase.dylib`.

> **Note:** This demo includes a patched `TransitServer.java` that uses `CachedThreadPool` instead of a fixed-size pool to avoid thread pool deadlock when the Node.js client connects with a full socket pool (8 connections).

## Run

```bash
node index.js
```

Or use the all-in-one script:

```bash
npm run demo   # builds + runs
```

## Expected Output

```md
🚀  Transit Showcase — Languages that just talk to each other

───────────────────────────────────────────────────────
  DEMO 1 — Simple cross-language calls
───────────────────────────────────────────────────────
  🦀  rs.greet("Transit")       → Hello from Rust, Transit! 🦀
  🦀  rs.fibonacci(10)          → 55
  🦀  rs.fibonacci(20)          → 6765
  🐍  py.analyzeText(...)        → {"word_count":12, ...}
  ☕  jv.generateId({prefix})   → {"id":"demo-1753..."} 

───────────────────────────────────────────────────────
  DEMO 2 — Rust matrix multiply (100×100)
───────────────────────────────────────────────────────
  🦀  Matrix multiply 100×100
      Result length: 10000 (expected 10000)
      Time: 2.41ms

...

✅  All demos completed successfully!
```

## Project Structure

```md
demo/
├── index.js              # Main orchestrator — chains all 3 languages
├── package.json
├── rust/
│   ├── Cargo.toml
│   ├── build.rs
│   └── src/lib.rs        # greet, fibonacci, matrix_multiply, count_primes
├── python/
│   ├── transit_server.py  # Transit Python server (included directly)
│   └── service.py         # analyzeText, transformData, formatReport
└── java/
    ├── lib/transit/java/  # Transit Java runtime (patched CachedThreadPool)
    │   ├── BinaryProtocol.java
    │   ├── TransitServer.java
    │   └── TransitService.java
    └── src/main/java/com/demo/
        └── App.java       # processRecord, computeStats, generateId
```
