#!/usr/bin/env python3
"""Unix domain socket server for computational benchmark."""

import json
import sys
import os
import time
import struct
import socket
import threading

# Add parent dir to path for shared module
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from shared.computations import OPERATIONS

SOCKET_PATH = "/tmp/transit_benchmark.sock"


class UnixSocketServer:
    def __init__(self):
        self.running = False

    def start(self):
        if os.path.exists(SOCKET_PATH):
            os.unlink(SOCKET_PATH)

        self.running = True
        server_socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        server_socket.bind(SOCKET_PATH)
        server_socket.listen(5)

        print(f"Unix socket server started on {SOCKET_PATH}", flush=True)

        while self.running:
            try:
                client_socket, _ = server_socket.accept()
                client_thread = threading.Thread(target=self._handle_client, args=(client_socket,))
                client_thread.daemon = True
                client_thread.start()
            except Exception as e:
                if self.running:
                    print(f"Error accepting connection: {e}")

        server_socket.close()

    def _handle_client(self, client_socket):
        try:
            length_bytes = client_socket.recv(4)
            if not length_bytes:
                return

            length = struct.unpack("!I", length_bytes)[0]

            data = b""
            while len(data) < length:
                chunk = client_socket.recv(length - len(data))
                if not chunk:
                    break
                data += chunk

            request = json.loads(data.decode())
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
            response_data = json.dumps(response).encode()
            response_length = struct.pack("!I", len(response_data))
            client_socket.sendall(response_length + response_data)

        except Exception as e:
            print(f"Error handling client: {e}")
        finally:
            client_socket.close()


def serve():
    server = UnixSocketServer()
    server.start()


if __name__ == "__main__":
    serve()
