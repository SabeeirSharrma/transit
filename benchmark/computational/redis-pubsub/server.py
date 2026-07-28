#!/usr/bin/env python3
"""Redis Pub/Sub server for computational benchmark."""

import json
import sys
import os
import time
import redis

# Add parent dir to path for shared module
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from shared.computations import OPERATIONS


def handle_request(message):
    """Handle incoming requests on the benchmark.request channel."""
    try:
        request_data = message["data"]
        request = json.loads(request_data)

        operation = request.get("operation")
        payload = request.get("payload", {})
        request_id = request.get("id")

        start = time.perf_counter()
        fn = OPERATIONS.get(operation)
        if fn:
            result = fn(payload)
        else:
            result = {"error": f"Unknown operation: {operation}"}
        end = time.perf_counter()

        response = {
            "id": request_id,
            "result": result,
            "execution_time_ms": (end - start) * 1000,
        }
        client.publish("benchmark.response", json.dumps(response))

    except Exception as e:
        response = {
            "id": request.get("id") if request else None,
            "error": str(e),
        }
        client.publish("benchmark.response", json.dumps(response))


if __name__ == "__main__":
    client = redis.Redis(host="127.0.0.1", port=6379, db=0)
    pubsub = client.pubsub()
    pubsub.subscribe(**{"benchmark.request": handle_request})

    print("Redis Pub/Sub server started", flush=True)

    thread = pubsub.run_in_thread(sleep_time=0.01)
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        thread.stop()
