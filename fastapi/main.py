"""FastAPI + JSON benchmark — equivalent operations for apples-to-apples comparison."""
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from collections import Counter, defaultdict, deque
import hashlib
import heapq
import math
import time
import threading

app = FastAPI(title="Benchmark API")

# ─── Request/Response Models ──────────────────────────────────────────────────

class EtlRequest(BaseModel):
    csv_data: str

class TextRequest(BaseModel):
    text: str

class MatrixMultiplyRequest(BaseModel):
    a: List[float]
    b: List[float]
    m: int
    n: int
    p: int

class MatrixDeterminantRequest(BaseModel):
    flat: List[float]
    n: int

class GraphRequest(BaseModel):
    nodes: int
    edges_flat: List[int]
    iterations: int

class FibonacciRequest(BaseModel):
    n: int

class HashRequest(BaseModel):
    data: str
    rounds: int


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _count_syllables(word: str) -> int:
    vowels = "aeiouy"
    word = word.lower()
    if not word:
        return 1
    count = 0
    prev_vowel = False
    for c in word:
        is_vowel = c in vowels
        if is_vowel and not prev_vowel:
            count += 1
        prev_vowel = is_vowel
    if word.endswith("e") and count > 1:
        count -= 1
    return max(count, 1)


def _determinant(mat: List[List[float]], n: int) -> float:
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


# ─── ETL Pipeline ─────────────────────────────────────────────────────────────

@app.post("/etl-pipeline")
async def etl_pipeline(req: EtlRequest):
    start = time.perf_counter()

    groups = defaultdict(list)
    for line in req.csv_data.strip().split("\n"):
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

    return {
        "records_processed": records,
        "aggregates": aggregates,
        "duration_ms": elapsed,
    }


# ─── Text Analysis ────────────────────────────────────────────────────────────

@app.post("/analyze-text-full")
async def analyze_text_full(req: TextRequest):
    start = time.perf_counter()
    text = req.text

    chars = len(text)
    words = text.split()
    word_count = len(words)

    freq = Counter()
    for w in words:
        clean = "".join(c for c in w.lower() if c.isalnum())
        if clean:
            freq[clean] += 1

    unique_words = len(freq)
    avg_word_length = sum(len(w) for w in words) / word_count if word_count else 0

    top_words = [{"word": w, "count": c} for w, c in freq.most_common(10)]

    clean_words = ["".join(c for c in w.lower() if c.isalnum()) for w in words]
    clean_words = [w for w in clean_words if w]
    bigram_freq = Counter()
    for i in range(len(clean_words) - 1):
        bigram_freq[f"{clean_words[i]} {clean_words[i+1]}"] += 1
    bigrams = [{"word": w, "count": c} for w, c in bigram_freq.most_common(10)]

    sentences = max(text.count(".") + text.count("!") + text.count("?"), 1)
    syllable_count = sum(_count_syllables(w) for w in words)
    readability = 0.0
    if sentences > 0 and word_count > 0:
        readability = 206.835 - 1.015 * (word_count / sentences) - 84.6 * (syllable_count / word_count)

    elapsed = (time.perf_counter() - start) * 1000

    return {
        "word_count": word_count,
        "char_count": chars,
        "unique_words": unique_words,
        "avg_word_length": avg_word_length,
        "top_words": top_words,
        "bigrams": bigrams,
        "readability_score": readability,
    }


# ─── Matrix Operations ────────────────────────────────────────────────────────

@app.post("/matrix-multiply")
async def matrix_multiply(req: MatrixMultiplyRequest):
    start = time.perf_counter()

    m, n, p = req.m, req.n, req.p
    result = [0.0] * (m * p)
    for i in range(m):
        for k in range(n):
            a_val = req.a[i * n + k]
            for j in range(p):
                result[i * p + j] += a_val * req.b[k * p + j]

    elapsed = (time.perf_counter() - start) * 1000

    return {
        "result": result,
        "dimensions": {"m": m, "n": n, "p": p},
        "duration_ms": elapsed,
    }


@app.post("/matrix-determinant")
async def matrix_determinant(req: MatrixDeterminantRequest):
    start = time.perf_counter()

    n = req.n
    mat = [req.flat[i * n:(i + 1) * n] for i in range(n)]
    det = _determinant(mat, n)
    elapsed = (time.perf_counter() - start) * 1000

    return {
        "determinant": det,
        "size": n,
        "duration_ms": elapsed,
    }


# ─── Graph Processing ─────────────────────────────────────────────────────────

@app.post("/process-graph")
async def process_graph(req: GraphRequest):
    start = time.perf_counter()

    n = req.nodes
    adj = [[] for _ in range(n)]

    for i in range(0, len(req.edges_flat), 3):
        if i + 2 < len(req.edges_flat):
            fr, to, weight = req.edges_flat[i], req.edges_flat[i+1], req.edges_flat[i+2]
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

    # Dijkstra
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
    for _ in range(req.iterations):
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

    return {
        "bfs_order": bfs_order,
        "shortest_paths": shortest_paths,
        "page_rank": page_rank,
        "connected_components": components,
    }


# ─── Fibonacci & Hash ─────────────────────────────────────────────────────────

@app.post("/fibonacci-memo")
async def fibonacci_memo(req: FibonacciRequest):
    start = time.perf_counter()

    memo = {}
    def fib(i):
        if i <= 1:
            return i
        if i in memo:
            return memo[i]
        memo[i] = fib(i - 1) + fib(i - 2)
        return memo[i]

    result = fib(req.n)
    elapsed = (time.perf_counter() - start) * 1000

    return {
        "n": req.n,
        "result": result,
        "duration_ms": elapsed,
    }


@app.post("/hash-data")
async def hash_data(req: HashRequest):
    start = time.perf_counter()

    current = req.data.encode()
    for _ in range(req.rounds):
        current = hashlib.sha256(current).digest()

    elapsed = (time.perf_counter() - start) * 1000

    return {
        "hash": current.hex(),
        "rounds": req.rounds,
        "duration_ms": elapsed,
    }


# ─── Health Check ─────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "fastapi-benchmark"}
