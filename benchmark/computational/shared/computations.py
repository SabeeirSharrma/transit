#!/usr/bin/env python3
"""Shared computation functions matching the FastAPI benchmark output format."""

import hashlib
from collections import Counter, defaultdict


def etl_pipeline(data):
    """Parse, group, aggregate 1000 rows from CSV string."""
    csv_data = data.get("csv_data", "")
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
    for group in sorted(groups.keys()):
        values = groups[group]
        aggregates.append({
            "group": group,
            "sum": sum(values),
            "avg": sum(values) / len(values) if values else 0,
            "count": len(values),
        })

    records = sum(a["count"] for a in aggregates)
    return {
        "records_processed": records,
        "aggregates": aggregates,
    }


def text_analysis(data):
    """Tokenize, frequency count, n-grams, readability."""
    text = data.get("text", "")
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

    return {
        "word_count": word_count,
        "unique_words": unique_words,
        "avg_word_length": avg_word_length,
        "frequency": dict(freq.most_common(10)),
        "bigrams": bigrams,
    }


def matrix_multiply(data):
    """Matrix multiplication with flat arrays."""
    a = data.get("a", [])
    b = data.get("b", [])
    m = data.get("m", 0)
    n = data.get("n", 0)
    p = data.get("p", 0)

    result = [0.0] * (m * p)
    for i in range(m):
        for k in range(n):
            a_val = a[i * n + k]
            for j in range(p):
                result[i * p + j] += a_val * b[k * p + j]

    return {"result": result, "dimensions": {"m": m, "n": n, "p": p}}


def matrix_determinant(data):
    """8x8 cofactor expansion from flat array."""
    flat = data.get("flat", [])
    n = data.get("n", 0)

    mat = [flat[i * n:(i + 1) * n] for i in range(n)]
    det = _determinant(mat, n)
    return {"determinant": det, "size": n}


def _determinant(mat, n):
    if n == 1:
        return mat[0][0]
    if n == 2:
        return mat[0][0] * mat[1][1] - mat[0][1] * mat[1][0]

    det = 0
    for j in range(n):
        minor = []
        for i in range(1, n):
            row = []
            for k in range(n):
                if k != j:
                    row.append(mat[i][k])
            minor.append(row)
        sign = 1 if j % 2 == 0 else -1
        det += sign * mat[0][j] * _determinant(minor, n - 1)
    return det


def graph_processing(data):
    """BFS, PageRank, connected components from flat edge array."""
    nodes = data.get("nodes", 500)
    edges_flat = data.get("edges_flat", [])
    iterations = data.get("iterations", 10)

    adj = [[] for _ in range(nodes)]
    for i in range(0, len(edges_flat), 3):
        if i + 2 < len(edges_flat):
            fr, to, weight = edges_flat[i], edges_flat[i + 1], edges_flat[i + 2]
            if fr < nodes and to < nodes:
                adj[fr].append((to, weight))

    # BFS from node 0
    visited = [False] * nodes
    bfs_order = []
    queue = [0]
    visited[0] = True
    while queue:
        node = queue.pop(0)
        bfs_order.append(node)
        for to, _ in adj[node]:
            if not visited[to]:
                visited[to] = True
                queue.append(to)

    # PageRank
    damping = 0.85
    ranks = [1.0 / nodes] * nodes
    for _ in range(iterations):
        new_ranks = [(1.0 - damping) / nodes] * nodes
        for i in range(nodes):
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
    visited = [False] * nodes
    components = 0
    for i in range(nodes):
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

    return {
        "bfs_order": bfs_order,
        "page_rank": page_rank,
        "connected_components": components,
    }


def fibonacci_memo(data):
    """Memoized recursion (n=38)."""
    n = data.get("n", 38)
    memo = {}

    def fib(i):
        if i <= 1:
            return i
        if i in memo:
            return memo[i]
        memo[i] = fib(i - 1) + fib(i - 2)
        return memo[i]

    result = fib(n)
    return {"result": result, "n": n}


def hash_data(data):
    """10K rounds of SHA-256."""
    rounds = data.get("rounds", 10000)
    data_str = data.get("data", "benchmark_data")

    current = data_str.encode()
    for _ in range(rounds):
        current = hashlib.sha256(current).digest()

    return {"hash": current.hex(), "rounds": rounds}


OPERATIONS = {
    "etl_pipeline": etl_pipeline,
    "text_analysis": text_analysis,
    "matrix_multiply": matrix_multiply,
    "matrix_determinant": matrix_determinant,
    "graph_processing": graph_processing,
    "fibonacci_memo": fibonacci_memo,
    "sha256_hashing": hash_data,
}
