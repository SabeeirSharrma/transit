#!/usr/bin/env python3
"""gRPC server for computational benchmark."""

import json
import sys
import os
import time
from concurrent import futures

# Add parent dir to path for shared module
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from shared.computations import OPERATIONS

import grpc
from benchmark_pb2 import ComputeRequest, ComputeResponse, ComputeBatchRequest, ComputeBatchResponse
import benchmark_pb2_grpc as benchmark_pb2_grpc


class BenchmarkServiceServicer(benchmark_pb2_grpc.BenchmarkServiceServicer):
    def Compute(self, request, context):
        start = time.perf_counter()

        operation = request.operation
        payload = json.loads(request.payload)

        fn = OPERATIONS.get(operation)
        if fn:
            result = fn(payload)
        else:
            result = {"error": f"Unknown operation: {operation}"}

        end = time.perf_counter()

        return ComputeResponse(
            result=json.dumps(result).encode(),
            execution_time_ms=(end - start) * 1000,
        )

    def ComputeBatch(self, request, context):
        start = time.perf_counter()
        responses = [self.Compute(req, context) for req in request.requests]
        end = time.perf_counter()
        return ComputeBatchResponse(
            responses=responses,
            total_time_ms=(end - start) * 1000,
        )


def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=8))
    benchmark_pb2_grpc.add_BenchmarkServiceServicer_to_server(
        BenchmarkServiceServicer(), server
    )
    server.add_insecure_port("[::]:50051")
    server.start()
    print("gRPC server started on port 50051", flush=True)
    server.wait_for_termination()


if __name__ == "__main__":
    serve()
