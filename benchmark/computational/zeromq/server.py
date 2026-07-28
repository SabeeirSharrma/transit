#!/usr/bin/env python3
"""ZeroMQ server for computational benchmark."""

import json
import sys
import os
import time
import zmq

# Add parent dir to path for shared module
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from shared.computations import OPERATIONS


def serve():
    """Start the ZeroMQ REP server."""
    context = zmq.Context()
    socket = context.socket(zmq.REP)
    socket.bind("tcp://127.0.0.1:5555")

    print("ZeroMQ server started on port 5555", flush=True)

    while True:
        try:
            request_data = socket.recv()
            request = json.loads(request_data.decode())

            operation = request.get("operation")
            payload = request.get("payload", {})

            start = time.perf_counter()
            fn = OPERATIONS.get(operation)
            if fn:
                result = fn(payload)
            else:
                result = {"error": f"Unknown operation: {operation}"}
            end = time.perf_counter()

            response = {
                "result": result,
                "execution_time_ms": (end - start) * 1000,
            }
            socket.send(json.dumps(response).encode())

        except Exception as e:
            socket.send(json.dumps({"error": str(e)}).encode())


if __name__ == "__main__":
    serve()
