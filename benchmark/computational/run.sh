#!/usr/bin/env bash
# Computational Benchmark Runner
# Usage: ./run.sh [options]
# Options: --serial-only, --concurrent-only, --help

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --serial-only      Run only serial benchmarks (100 iterations)"
    echo "  --concurrent-only  Run only concurrent benchmarks (10 parallel)"
    echo "  --help             Show this help message"
    echo ""
    echo "Prerequisites:"
    echo "  - Node.js >= 20"
    echo "  - Rust toolchain"
    echo "  - Java JDK 21+"
    echo "  - Python 3.10+"
}

MODE="both"
while [[ $# -gt 0 ]]; do
    case $1 in
        --serial-only) MODE="serial"; shift ;;
        --concurrent-only) MODE="concurrent"; shift ;;
        --help) usage; exit 0 ;;
        *) echo "Unknown option: $1"; usage; exit 1 ;;
    esac
done

cd "$SCRIPT_DIR"

echo "=== Computational Benchmark ==="
echo "Running in $MODE mode"
echo ""

# Check prerequisites
echo "Checking prerequisites..."
command -v node >/dev/null 2>&1 || { echo "Error: Node.js not found"; exit 1; }
command -v cargo >/dev/null 2>&1 || { echo "Error: Rust toolchain not found"; exit 1; }
command -v javac >/dev/null 2>&1 || { echo "Error: Java JDK not found"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "Error: Python 3 not found"; exit 1; }

# Install dependencies
echo "Installing dependencies..."
npm install

# Build Rust native addon
echo "Building Rust native addon..."
npm run build:rust

# Build C native addon
echo "Building C native addon..."
npm run build:c

# Build C++ native addon
echo "Building C++ native addon..."
npm run build:cpp

# Build Java service
echo "Building Java service..."
npm run build:java

# Install FastAPI dependencies
echo "Installing FastAPI dependencies..."
npm run install:fastapi

# Install additional backend dependencies
echo "Installing gRPC dependencies..."
npm run install:grpc || echo "  ⚠ gRPC setup failed (missing grpcio-tools?)"

echo "Installing Thrift dependencies..."
npm run install:thrift || echo "  ⚠ Thrift setup failed (missing thrift compiler?)"

echo "Installing Unix Socket dependencies..."
npm run install:unix-socket || echo "  ⚠ Unix Socket setup failed"

echo "Installing Subprocess dependencies..."
npm run install:subprocess || echo "  ⚠ Subprocess setup failed"

echo "Installing ZeroMQ dependencies..."
npm run install:zeromq || echo "  ⚠ ZeroMQ setup failed (missing libzmq?)"

echo "Installing Redis Pub/Sub dependencies..."
npm run install:redis-pubsub || echo "  ⚠ Redis Pub/Sub setup failed (missing redis?)"

# Run benchmark
echo "Running benchmark..."
if [ "$MODE" = "both" ]; then
    npm run benchmark
elif [ "$MODE" = "serial" ]; then
    npm run benchmark -- --serial
elif [ "$MODE" = "concurrent" ]; then
    npm run benchmark -- --concurrent
fi

echo ""
echo "=== Benchmark Complete ==="
echo "Results saved to results/"
