#!/usr/bin/env python3
"""ZeroMQ REQ/REP server for chat server benchmark operations."""

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from shared.computations import FUNCTIONS

import zmq


def serve():
    context = zmq.Context()
    socket = context.socket(zmq.REP)
    socket.bind("tcp://127.0.0.1:5555")
    print("ZeroMQ server started on tcp://127.0.0.1:5555", flush=True)

    while True:
        message = socket.recv()
        request = json.loads(message.decode("utf-8"))
        operation = request.get("operation", "")
        payload = request.get("payload", {})

        start = time.time()
        fn = FUNCTIONS.get(operation)
        if not fn:
            result = {"error": f"Unknown operation: {operation}"}
        else:
            result = fn(payload)
        elapsed = (time.time() - start) * 1000

        response = {"result": result, "execution_time_ms": elapsed}
        socket.send(json.dumps(response).encode("utf-8"))


if __name__ == "__main__":
    serve()
