#!/usr/bin/env python3
"""Unix domain socket server for computational benchmark."""

import json
import time
import hashlib
import struct
import math
import os
import socket
import threading

SOCKET_PATH = "/tmp/transit_benchmark.sock"


class UnixSocketServer:
    """Unix socket server implementing computational operations."""

    def __init__(self):
        self.lock = threading.Lock()
        self.running = False

    def start(self):
        """Start the server."""
        # Remove existing socket file
        if os.path.exists(SOCKET_PATH):
            os.unlink(SOCKET_PATH)
        
        self.running = True
        server_socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        server_socket.bind(SOCKET_PATH)
        server_socket.listen(5)
        
        print(f"Unix socket server started on {SOCKET_PATH}")
        
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
        """Handle a client connection."""
        try:
            # Read request length
            length_bytes = client_socket.recv(4)
            if not length_bytes:
                return
            
            length = struct.unpack('!I', length_bytes)[0]
            
            # Read request data
            data = b''
            while len(data) < length:
                chunk = client_socket.recv(length - len(data))
                if not chunk:
                    break
                data += chunk
            
            # Parse request
            request = json.loads(data.decode())
            operation = request.get("operation")
            payload = request.get("payload", {})
            
            # Process request
            start = time.perf_counter()
            result = self._process_operation(operation, payload)
            end = time.perf_counter()
            
            # Send response
            response = {
                "result": result,
                "execution_time_ms": (end - start) * 1000
            }
            response_data = json.dumps(response).encode()
            response_length = struct.pack('!I', len(response_data))
            client_socket.sendall(response_length + response_data)
        
        except Exception as e:
            print(f"Error handling client: {e}")
        finally:
            client_socket.close()

    def _process_operation(self, operation, payload):
        """Process a computational operation."""
        if operation == "etl_pipeline":
            return self._etl_pipeline(payload)
        elif operation == "text_analysis":
            return self._text_analysis(payload)
        elif operation == "matrix_multiply":
            return self._matrix_multiply(payload)
        elif operation == "matrix_determinant":
            return self._matrix_determinant(payload)
        elif operation == "graph_processing":
            return self._graph_processing(payload)
        elif operation == "fibonacci_memo":
            return self._fibonacci_memo(payload)
        elif operation == "sha256_hashing":
            return self._sha256_hashing(payload)
        else:
            return {"error": f"Unknown operation: {operation}"}

    def _etl_pipeline(self, data):
        """Parse, group, aggregate 1000 rows."""
        rows = data.get("rows", [])
        grouped = {}
        for row in rows:
            key = row.get("category", "unknown")
            if key not in grouped:
                grouped[key] = []
            grouped[key].append(row)
        
        result = {}
        for key, group in grouped.items():
            values = [r.get("value", 0) for r in group]
            result[key] = {
                "count": len(values),
                "sum": sum(values),
                "avg": sum(values) / len(values) if values else 0
            }
        
        return result

    def _text_analysis(self, data):
        """Tokenize, frequency count, n-grams, readability."""
        text = data.get("text", "")
        words = text.split()
        
        freq = {}
        for word in words:
            word = word.lower()
            freq[word] = freq.get(word, 0) + 1
        
        bigrams = []
        for i in range(len(words) - 1):
            bigrams.append(f"{words[i]} {words[i+1]}")
        
        avg_word_length = sum(len(w) for w in words) / len(words) if words else 0
        avg_sentence_length = len(words)  # simplified
        
        return {
            "word_count": len(words),
            "unique_words": len(freq),
            "frequency": dict(sorted(freq.items(), key=lambda x: -x[1])[:10]),
            "bigrams": bigrams[:10],
            "avg_word_length": avg_word_length,
            "avg_sentence_length": avg_sentence_length
        }

    def _matrix_multiply(self, data):
        """50x50 matrix multiplication."""
        a = data.get("matrix_a", [])
        b = data.get("matrix_b", [])
        n = len(a)
        result = [[0.0] * n for _ in range(n)]
        
        for i in range(n):
            for j in range(n):
                for k in range(n):
                    result[i][j] += a[i][k] * b[k][j]
        
        return {"result": result, "size": n}

    def _matrix_determinant(self, data):
        """8x8 cofactor expansion."""
        matrix = data.get("matrix", [])
        n = len(matrix)
        
        if n == 1:
            return {"determinant": matrix[0][0]}
        if n == 2:
            return {"determinant": matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0]}
        
        det = 0
        for j in range(n):
            minor = []
            for i in range(1, n):
                row = []
                for k in range(n):
                    if k != j:
                        row.append(matrix[i][k])
                minor.append(row)
            
            sign = 1 if j % 2 == 0 else -1
            det += sign * matrix[0][j] * self._matrix_determinant({"matrix": minor})["determinant"]
        
        return {"determinant": det}

    def _graph_processing(self, data):
        """BFS, Dijkstra, PageRank, connected components."""
        nodes = data.get("nodes", 500)
        edges = data.get("edges", [])
        
        adj = {}
        for i in range(nodes):
            adj[i] = []
        for edge in edges:
            src, dst = edge[0], edge[1]
            adj[src].append(dst)
            adj[dst].append(src)
        
        # BFS from node 0
        visited = set()
        queue = [0]
        visited.add(0)
        bfs_order = []
        while queue:
            node = queue.pop(0)
            bfs_order.append(node)
            for neighbor in adj[node]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)
        
        # Simple PageRank
        pagerank = {i: 1.0 / nodes for i in range(nodes)}
        for _ in range(10):
            new_rank = {}
            for node in range(nodes):
                rank_sum = 0
                for neighbor in adj[node]:
                    if len(adj[neighbor]) > 0:
                        rank_sum += pagerank[neighbor] / len(adj[neighbor])
                new_rank[node] = 0.15 / nodes + 0.85 * rank_sum
            pagerank = new_rank
        
        # Connected components
        visited = set()
        components = []
        for node in range(nodes):
            if node not in visited:
                component = []
                stack = [node]
                while stack:
                    n = stack.pop()
                    if n not in visited:
                        visited.add(n)
                        component.append(n)
                        for neighbor in adj[n]:
                            if neighbor not in visited:
                                stack.append(neighbor)
                components.append(component)
        
        return {
            "bfs_nodes_visited": len(bfs_order),
            "pagerank_top5": sorted(pagerank.items(), key=lambda x: -x[1])[:5],
            "connected_components": len(components)
        }

    def _fibonacci_memo(self, data):
        """Memoized recursion (n=38)."""
        n = data.get("n", 38)
        memo = {}
        
        def fib(n):
            if n in memo:
                return memo[n]
            if n <= 1:
                return n
            memo[n] = fib(n - 1) + fib(n - 2)
            return memo[n]
        
        result = fib(n)
        return {"result": result, "n": n}

    def _sha256_hashing(self, data):
        """10K rounds of SHA-256."""
        rounds = data.get("rounds", 10000)
        data_str = data.get("data", "benchmark_data")
        
        result = data_str.encode()
        for _ in range(rounds):
            result = hashlib.sha256(result).digest()
        
        return {"hash": result.hex(), "rounds": rounds}


def serve():
    """Start the Unix socket server."""
    server = UnixSocketServer()
    server.start()


if __name__ == "__main__":
    serve()
