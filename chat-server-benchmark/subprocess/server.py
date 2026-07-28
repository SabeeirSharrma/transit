#!/usr/bin/env python3
"""Subprocess (stdin/stdout) server for chat server benchmark operations."""

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from shared.computations import FUNCTIONS


def main():
    print("READY", flush=True)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
            req_id = request.get("id")
            operation = request.get("operation", "")
            payload = request.get("payload", {})

            start = time.time()
            fn = FUNCTIONS.get(operation)
            if not fn:
                result = {"error": f"Unknown operation: {operation}"}
            else:
                result = fn(payload)
            elapsed = (time.time() - start) * 1000

            response = {"id": req_id, "result": result, "execution_time_ms": elapsed}
        except Exception as e:
            response = {"id": locals().get("request", {}).get("id"), "error": str(e)}

        print(json.dumps(response), flush=True)


if __name__ == "__main__":
    main()
