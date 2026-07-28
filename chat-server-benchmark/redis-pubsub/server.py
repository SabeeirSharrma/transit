#!/usr/bin/env python3
"""Redis Pub/Sub server for chat server benchmark operations."""

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from shared.computations import FUNCTIONS

import redis

_publisher = None


def handle_message(message):
    data = json.loads(message["data"].decode("utf-8"))
    operation = data.get("operation", "")
    payload = data.get("payload", {})
    req_id = data.get("id")

    start = time.time()
    fn = FUNCTIONS.get(operation)
    if not fn:
        result = {"error": f"Unknown operation: {operation}"}
    else:
        result = fn(payload)
    elapsed = (time.time() - start) * 1000

    response = {"id": req_id, "result": result, "execution_time_ms": elapsed}
    resp_bytes = json.dumps(response).encode("utf-8")
    # Publish response back to the response channel
    _publisher.publish("benchmark.response", resp_bytes)


def serve():
    global _publisher
    r = redis.Redis(host="127.0.0.1", port=6379)
    _publisher = r
    pubsub = r.pubsub()
    pubsub.subscribe(**{"benchmark.request": handle_message})

    print("Redis Pub/Sub server started on 127.0.0.1:6379", flush=True)

    thread = pubsub.run_in_thread(sleep_time=0.01)

    # Keep main thread alive
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        thread.stop()


if __name__ == "__main__":
    serve()
