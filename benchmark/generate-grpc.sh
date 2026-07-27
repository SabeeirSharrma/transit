#!/usr/bin/env bash
# Generate gRPC Python code from proto files
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Generating gRPC Python code..."

# Generate computational benchmark gRPC code
cd "$SCRIPT_DIR/../computational/grpc/proto"
python3 -m grpc_tools.protoc -I. --python_out=.. --grpc_python_out=. benchmark.proto

# Generate chat-server benchmark gRPC code
cd "$SCRIPT_DIR/../chat-server/grpc/proto"
python3 -m grpc_tools.protoc -I. --python_out=.. --grpc_python_out=. benchmark.proto

echo "gRPC Python code generated successfully"
