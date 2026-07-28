#!/usr/bin/env bash
# Chat Server Benchmark Runner
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
    echo "  - Redis (for Redis Pub/Sub benchmark, optional)"
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

echo "=== Chat Server Benchmark ==="
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

# Build Java service
echo "Building Java service..."
npm run build:java

# Install FastAPI dependencies
echo "Installing FastAPI dependencies..."
npm run install:fastapi

# Check if Redis is available (optional)
REDIS_PID=""
if command -v redis-server >/dev/null 2>&1; then
    if ! redis-cli ping >/dev/null 2>&1; then
        echo "Starting Redis server..."
        redis-server --daemonize yes --port 6379 --loglevel warning
        REDIS_PID=$!
        sleep 1
        if redis-cli ping >/dev/null 2>&1; then
            echo "✓ Redis ready on port 6379"
        else
            echo "⚠ Redis failed to start, skipping Redis Pub/Sub benchmark"
            REDIS_PID=""
        fi
    else
        echo "✓ Redis already running"
    fi
else
    echo "⚠ Redis not found, skipping Redis Pub/Sub benchmark"
fi

# Run benchmark
echo "Running benchmark..."
if [ "$MODE" = "both" ]; then
    npm run benchmark
elif [ "$MODE" = "serial" ]; then
    npm run benchmark -- --serial
elif [ "$MODE" = "concurrent" ]; then
    npm run benchmark -- --concurrent
fi

# Stop Redis if we started it
if [ -n "$REDIS_PID" ]; then
    echo "Stopping Redis..."
    redis-cli shutdown 2>/dev/null || true
fi

echo ""
echo "=== Benchmark Complete ==="
echo "Results saved to results/"
