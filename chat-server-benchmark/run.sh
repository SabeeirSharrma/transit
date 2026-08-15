#!/bin/bash
# Chat Server Benchmark - Setup and Run
set -e

cd "$(dirname "$0")"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Chat Server Benchmark Setup                                ║"
echo "╚══════════════════════════════════════════════════════════════╝"

# Install npm dependencies
echo "Installing npm dependencies..."
npm install

# Build Rust
echo "Building Rust native addon..."
cd transit/rust
cargo build --release
cp target/release/libchat_benchmark.so index.node
cd ../..

# Build C
echo "Building C native addon..."
cd transit/c
npx node-gyp rebuild
cp build/Release/chat_benchmark_c.node index.node
cd ../..

# Build C++
echo "Building C++ native addon..."
cd transit/cpp
npx node-gyp rebuild
cp build/Release/chat_benchmark_cpp.node index.node
cd ../..

# Build Java
echo "Compiling Java..."
mkdir -p transit/java/build
javac -d transit/java/build transit/java/src/main/java/chatservice/ChatService.java
cd ..

# Setup FastAPI venv
echo "Setting up FastAPI venv..."
cd fastapi
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cd ..

# Run benchmark
echo ""
echo "Running benchmark..."
node run-benchmark.js "$@"
