"""Benchmark Python service — mirrors the Rust operations for apples-to-apples comparison."""
# ─── orjson shim ─────────────────────────────────────────────────────────────
import os
_use_orjson = os.environ.get("TRANSIT_USE_ORJSON", "") == "1"
if _use_orjson:
    try:
        import orjson
        def _json_dumps(obj):
            return orjson.dumps(obj).decode("utf-8")
        def _json_loads(s):
            if isinstance(s, bytes):
                return orjson.loads(s)
            return orjson.loads(s.encode("utf-8") if isinstance(s, str) else s)
    except ImportError:
        import json as _json
        _json_dumps = _json.dumps
        _json_loads = _json.loads
else:
    import json as _json
    _json_dumps = _json.dumps
    _json_loads = _json.loads

# Alias for downstream code
json = type("json", (), {"dumps": staticmethod(_json_dumps), "loads": staticmethod(_json_loads)})()

import math
import socket
import struct
import sys
import time
import atexit
import signal
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor

# ─── Protocol constants (matching transit binary protocol) ────────────────────

PROTOCOL_VERSION = 1
TYPE_CALL_REQUEST = 0x01
TYPE_CALL_RESPONSE = 0x02
TYPE_HEALTH_PING = 0x03
TYPE_HEALTH_PONG = 0x04
STATUS_OK = 0
STATUS_ERROR = 1
HEADER_SIZE = 10
HEADER_FORMAT = "<BBII"

_functions = {}

def register_function(name, fn):
    _functions[name] = fn
    print(f"[benchmark-py] Registered function: {name}", file=sys.stderr)


# ─── ETL Pipeline ─────────────────────────────────────────────────────────────

def etl_pipeline(args_json):
    start = time.perf_counter()
    args = _json_loads(args_json)
    csv_data = args.get("csv_data", "")

    groups = defaultdict(list)
    for line in csv_data.strip().split("\n"):
        parts = line.split(",")
        if len(parts) >= 2:
            key = parts[0].strip()
            try:
                val = float(parts[1].strip())
                groups[key].append(val)
            except ValueError:
                continue

    aggregates = []
    for group, values in sorted(groups.items()):
        aggregates.append({
            "group": group,
            "sum": sum(values),
            "avg": sum(values) / len(values) if values else 0,
            "count": len(values),
        })

    records = sum(a["count"] for a in aggregates)
    elapsed = (time.perf_counter() - start) * 1000

    return _json_dumps({
        "records_processed": records,
        "aggregates": aggregates,
        "duration_ms": elapsed,
    })


# ─── Text Analysis ────────────────────────────────────────────────────────────

def _count_syllables(word):
    vowels = "aeiouy"
    chars = word.lower()
    if not chars:
        return 1
    count = 0
    prev_vowel = False
    for c in chars:
        is_vowel = c in vowels
        if is_vowel and not prev_vowel:
            count += 1
        prev_vowel = is_vowel
    if chars.endswith("e") and count > 1:
        count -= 1
    return max(count, 1)


def analyze_text_full(args_json):
    start = time.perf_counter()
    args = _json_loads(args_json)
    text = args.get("text", "")

    chars = len(text)
    words = text.split()
    word_count = len(words)

    # Word frequency
    freq = Counter()
    for w in words:
        clean = "".join(c for c in w.lower() if c.isalnum())
        if clean:
            freq[clean] += 1

    unique_words = len(freq)
    avg_word_length = sum(len(w) for w in words) / word_count if word_count else 0

    # Top 10
    top_words = [{"word": w, "count": c} for w, c in freq.most_common(10)]

    # Bigrams
    clean_words = ["".join(c for c in w.lower() if c.isalnum()) for w in words]
    clean_words = [w for w in clean_words if w]
    bigram_freq = Counter()
    for i in range(len(clean_words) - 1):
        bigram_freq[f"{clean_words[i]} {clean_words[i+1]}"] += 1
    bigrams = [{"word": w, "count": c} for w, c in bigram_freq.most_common(10)]

    # Readability (Flesch-Kincaid simplified)
    sentences = max(text.count(".") + text.count("!") + text.count("?"), 1)
    syllable_count = sum(_count_syllables(w) for w in words)
    readability = 0.0
    if sentences > 0 and word_count > 0:
        readability = 206.835 - 1.015 * (word_count / sentences) - 84.6 * (syllable_count / word_count)

    elapsed = (time.perf_counter() - start) * 1000

    return _json_dumps({
        "word_count": word_count,
        "char_count": chars,
        "unique_words": unique_words,
        "avg_word_length": avg_word_length,
        "top_words": top_words,
        "bigrams": bigrams,
        "readability_score": readability,
    })


# ─── Matrix Operations ────────────────────────────────────────────────────────

def matrix_multiply(args_json):
    start = time.perf_counter()
    args = _json_loads(args_json)
    a = args["a"]
    b = args["b"]
    m = args["m"]
    n = args["n"]
    p = args["p"]

    result = [0.0] * (m * p)
    for i in range(m):
        for k in range(n):
            a_val = a[i * n + k]
            for j in range(p):
                result[i * p + j] += a_val * b[k * p + j]

    elapsed = (time.perf_counter() - start) * 1000

    return _json_dumps({
        "result": result,
        "dimensions": {"m": m, "n": n, "p": p},
        "duration_ms": elapsed,
    })


def matrix_determinant(args_json):
    start = time.perf_counter()
    args = _json_loads(args_json)
    flat = args["flat"]
    n = args["n"]

    mat = [flat[i * n:(i + 1) * n] for i in range(n)]
    det = _determinant(mat, n)
    elapsed = (time.perf_counter() - start) * 1000

    return _json_dumps({
        "determinant": det,
        "size": n,
        "duration_ms": elapsed,
    })


def _determinant(mat, n):
    if n == 1:
        return mat[0][0]
    if n == 2:
        return mat[0][0] * mat[1][1] - mat[0][1] * mat[1][0]

    det = 0.0
    for j in range(n):
        sub = [row[:j] + row[j+1:] for row in mat[1:]]
        sign = 1 if j % 2 == 0 else -1
        det += sign * mat[0][j] * _determinant(sub, n - 1)
    return det


# ─── Graph Processing ─────────────────────────────────────────────────────────

def process_graph(args_json):
    from collections import deque
    import heapq

    start = time.perf_counter()
    args = _json_loads(args_json)
    nodes = args["nodes"]
    edges_flat = args["edges_flat"]
    iterations = args["iterations"]

    n = nodes
    adj = [[] for _ in range(n)]

    for i in range(0, len(edges_flat), 3):
        if i + 2 < len(edges_flat):
            fr, to, weight = edges_flat[i], edges_flat[i+1], edges_flat[i+2]
            if fr < n and to < n:
                adj[fr].append((to, weight))

    # BFS
    visited = [False] * n
    bfs_order = []
    queue = deque([0])
    visited[0] = True
    while queue:
        node = queue.popleft()
        bfs_order.append(node)
        for to, _ in adj[node]:
            if not visited[to]:
                visited[to] = True
                queue.append(to)

    # Dijkstra (shortest paths from 0)
    def dijkstra(start, end):
        dist = [float("inf")] * n
        prev = [-1] * n
        dist[start] = 0
        heap = [(0, start)]
        while heap:
            d, u = heapq.heappop(heap)
            if d > dist[u]:
                continue
            for v, w in adj[u]:
                nd = d + w
                if nd < dist[v]:
                    dist[v] = nd
                    prev[v] = u
                    heapq.heappush(heap, (nd, v))
        if dist[end] == float("inf"):
            return float("inf"), []
        path = []
        cur = end
        while cur != -1:
            path.append(cur)
            cur = prev[cur]
        path.reverse()
        return dist[end], path

    shortest_paths = []
    for target in range(1, min(6, n)):
        d, path = dijkstra(0, target)
        shortest_paths.append({
            "from": 0,
            "to": target,
            "distance": int(d) if d != float("inf") else -1,
            "path": path,
        })

    # PageRank
    damping = 0.85
    ranks = [1.0 / n] * n
    for _ in range(iterations):
        new_ranks = [(1.0 - damping) / n] * n
        for i in range(n):
            share = damping * ranks[i] / max(len(adj[i]), 1)
            for to, _ in adj[i]:
                new_ranks[to] += share
        ranks = new_ranks

    page_rank = sorted(
        [{"node": i, "rank": r} for i, r in enumerate(ranks)],
        key=lambda x: x["rank"],
        reverse=True,
    )

    # Connected components
    visited = [False] * n
    components = 0
    for i in range(n):
        if not visited[i]:
            components += 1
            stack = [i]
            while stack:
                node = stack.pop()
                if not visited[node]:
                    visited[node] = True
                    for to, _ in adj[node]:
                        if not visited[to]:
                            stack.append(to)

    elapsed = (time.perf_counter() - start) * 1000

    return _json_dumps({
        "bfs_order": bfs_order,
        "shortest_paths": shortest_paths,
        "page_rank": page_rank,
        "connected_components": components,
    })


# ─── Fibonacci & Hash ─────────────────────────────────────────────────────────

def fibonacci_memo(args_json):
    start = time.perf_counter()
    args = _json_loads(args_json)
    n = args["n"]

    memo = {}

    def fib(i):
        if i <= 1:
            return i
        if i in memo:
            return memo[i]
        memo[i] = fib(i - 1) + fib(i - 2)
        return memo[i]

    result = fib(n)
    elapsed = (time.perf_counter() - start) * 1000

    return _json_dumps({
        "n": n,
        "result": result,
        "duration_ms": elapsed,
    })


def hash_data(args_json):
    import hashlib
    start = time.perf_counter()
    args = _json_loads(args_json)
    data = args.get("data", "")
    rounds = args.get("rounds", 1000)

    current = data.encode()
    for _ in range(rounds):
        current = hashlib.sha256(current).digest()

    elapsed = (time.perf_counter() - start) * 1000

    return _json_dumps({
        "hash": current.hex(),
        "rounds": rounds,
        "duration_ms": elapsed,
    })


# ─── Transit Server ───────────────────────────────────────────────────────────

class TransitServer:
    def __init__(self):
        self._server_socket = None
        self._running = False
        self._executor = ThreadPoolExecutor(max_workers=min(os.cpu_count() or 4, 8))
        self._call_executor = ThreadPoolExecutor(max_workers=min(os.cpu_count() or 4, 8))
        self._socket_path = None

    def _cleanup_socket_file(self):
        if self._socket_path and os.path.exists(self._socket_path):
            try:
                os.unlink(self._socket_path)
            except OSError:
                pass

    def start(self):
        # Register cleanup
        atexit.register(self._cleanup_socket_file)
        signal.signal(signal.SIGTERM, lambda *_: (self._cleanup_socket_file(), sys.exit(0)))
        signal.signal(signal.SIGINT, lambda *_: (self._cleanup_socket_file(), sys.exit(0)))

        # Try UDS first on Linux/macOS
        if hasattr(socket, "AF_UNIX") and sys.platform != "win32":
            self._socket_path = f"/tmp/transit-{os.getpid()}.sock"
            # Remove stale socket
            if os.path.exists(self._socket_path):
                try:
                    os.unlink(self._socket_path)
                except OSError:
                    pass
            try:
                self._server_socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                self._server_socket.bind(self._socket_path)
                self._server_socket.listen(50)
                self._running = True
                print(f"[benchmark-py] Server listening on UDS {self._socket_path}", file=sys.stderr)
                print(f"[benchmark-py] Registered {len(_functions)} functions", file=sys.stderr)
                print(f"SOCKET={self._socket_path}")
                sys.stdout.flush()
                self._accept_loop()
                return
            except Exception as e:
                print(f"[benchmark-py] UDS failed ({e}), falling back to TCP", file=sys.stderr)
                self._cleanup_socket_file()
                self._socket_path = None

        # Fallback to TCP
        self._server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._server_socket.bind(("127.0.0.1", 0))
        self._server_socket.listen(50)
        self._port = self._server_socket.getsockname()[1]
        self._running = True
        print(f"[benchmark-py] Server listening on 127.0.0.1:{self._port}", file=sys.stderr)
        print(f"[benchmark-py] Registered {len(_functions)} functions", file=sys.stderr)
        print(f"PORT={self._port}")
        sys.stdout.flush()
        self._accept_loop()

    def _accept_loop(self):
        while self._running:
            try:
                client, addr = self._server_socket.accept()
                if self._socket_path is None:
                    # TCP — verify loopback
                    if addr[0] != "127.0.0.1":
                        client.close()
                        continue
                self._executor.submit(self._handle_client, client)
            except OSError:
                break

    def _handle_client(self, client):
        try:
            if self._socket_path is None:
                # TCP only
                client.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            with client:
                while self._running:
                    header = self._recv_exact(client, HEADER_SIZE)
                    if header is None:
                        break
                    version, msg_type, request_id, payload_len = struct.unpack(HEADER_FORMAT, header)
                    if version != PROTOCOL_VERSION:
                        break
                    payload = self._recv_exact(client, payload_len) if payload_len > 0 else b""
                    if msg_type == TYPE_CALL_REQUEST:
                        # Use separate call executor to avoid deadlock:
                        # _handle_client runs on _executor, so _handle_call
                        # must use a different executor to avoid contention.
                        self._call_executor.submit(self._handle_call, payload, request_id, client)
                    elif msg_type == TYPE_HEALTH_PING:
                        resp = struct.pack(HEADER_FORMAT, PROTOCOL_VERSION, TYPE_HEALTH_PONG, request_id, 0)
                        client.sendall(resp)
        except Exception as e:
            if self._running:
                print(f"[benchmark-py] Client error: {e}", file=sys.stderr)

    def _handle_call(self, payload, request_id, client):
        try:
            buf = memoryview(payload)
            fn_name_len = struct.unpack_from("<H", buf, 0)[0]
            fn_name = bytes(buf[2:2 + fn_name_len]).decode("utf-8")
            args_offset = 2 + fn_name_len
            args_len = struct.unpack_from("<I", buf, args_offset)[0]
            args_json = bytes(buf[args_offset + 4:args_offset + 4 + args_len]).decode("utf-8")

            fn = _functions.get(fn_name)
            if fn is None:
                status = STATUS_ERROR
                result_json = _json_dumps({"error": f"Function '{fn_name}' not found"})
            else:
                try:
                    result_json = fn(args_json)
                    status = STATUS_OK
                except Exception as e:
                    status = STATUS_ERROR
                    result_json = _json_dumps({"error": str(e)})

            result_bytes = result_json.encode("utf-8")
            total_size = HEADER_SIZE + 1 + 4 + len(result_bytes)
            resp = bytearray(total_size)
            struct.pack_into(HEADER_FORMAT, resp, 0,
                             PROTOCOL_VERSION, TYPE_CALL_RESPONSE, request_id, 1 + 4 + len(result_bytes))
            struct.pack_into("<BI", resp, HEADER_SIZE, status, len(result_bytes))
            resp[HEADER_SIZE + 5:] = result_bytes
            client.sendall(resp)
        except Exception as e:
            print(f"[benchmark-py] Call error: {e}", file=sys.stderr)

    def _recv_exact(self, sock, n):
        buf = bytearray(n)
        mv = memoryview(buf)
        received = 0
        while received < n:
            try:
                got = sock.recv_into(mv[received:], n - received)
            except (OSError, ValueError):
                return None
            if got == 0:
                return None
            received += got
        return bytes(buf)


if __name__ == "__main__":
    register_function("etlPipeline", etl_pipeline)
    register_function("analyzeTextFull", analyze_text_full)
    register_function("matrixMultiply", matrix_multiply)
    register_function("matrixDeterminant", matrix_determinant)
    register_function("processGraph", process_graph)
    register_function("fibonacciMemo", fibonacci_memo)
    register_function("hashData", hash_data)

    server = TransitServer()
    server.start()
