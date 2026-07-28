#!/usr/bin/env python3
"""Unix domain socket server for chat server benchmark operations."""

import json
import os
import socket
import struct
import sys
import time
import threading

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from shared.computations import FUNCTIONS

SOCKET_PATH = "/tmp/transit_chat_benchmark.sock"


def handle_client(conn):
    try:
        while True:
            # Read 4-byte length prefix
            length_bytes = conn.recv(4)
            if not length_bytes or len(length_bytes) < 4:
                break
            length = struct.unpack(">I", length_bytes)[0]
            data = conn.recv(length)
            if not data or len(data) < length:
                break

            request = json.loads(data.decode("utf-8"))
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
            resp_bytes = json.dumps(response).encode("utf-8")
            conn.sendall(struct.pack(">I", len(resp_bytes)) + resp_bytes)
    except Exception as e:
        pass
    finally:
        conn.close()


def serve():
    if os.path.exists(SOCKET_PATH):
        os.unlink(SOCKET_PATH)

    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(SOCKET_PATH)
    server.listen(50)
    print(f"Unix socket server started on {SOCKET_PATH}", flush=True)

    while True:
        conn, _ = server.accept()
        threading.Thread(target=handle_client, args=(conn,), daemon=True).start()


if __name__ == "__main__":
    serve()
