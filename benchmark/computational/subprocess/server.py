#!/usr/bin/env python3
"""Subprocess server for computational benchmark.
Reads from stdin and writes to stdout.
"""

import json
import sys
import os
import time

# Add parent dir to path for shared module
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from shared.computations import OPERATIONS


def main():
    """Main loop: read from stdin, process, write to stdout."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
            req_id = request.get("id")
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
            if req_id is not None:
                response["id"] = req_id

            sys.stdout.write(json.dumps(response) + "\n")
            sys.stdout.flush()

        except json.JSONDecodeError as e:
            sys.stdout.write(json.dumps({"error": f"Invalid JSON: {e}"}) + "\n")
            sys.stdout.flush()
        except Exception as e:
            sys.stdout.write(json.dumps({"error": str(e)}) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
