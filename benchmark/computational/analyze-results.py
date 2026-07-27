#!/usr/bin/env python3
"""Analyze and compare benchmark results."""
import json
import sys
from pathlib import Path

def analyze(results_file):
    with open(results_file) as f:
        data = json.load(f)

    print(f"\n{'='*70}")
    print(f"  Benchmark Results: {data['timestamp']}")
    print(f"  Iterations: {data['iterations']}, Warmup: {data['warmup']}")
    print(f"{'='*70}\n")

    # Summary table
    header = f"{'Operation':<35} {'FastAPI':>10} {'Rust':>10} {'Python':>10} {'Java':>10}"
    print(header)
    print("-" * len(header))

    winners = {"fastapi": 0, "rust": 0, "python": 0, "java": 0}

    for key, bench in data["benchmarks"].items():
        fastapi_ms = bench["fastapi"]["mean"]
        rust_ms = bench["transit"]["rust"]["mean"] if "rust" in bench.get("transit", {}) else None
        python_ms = bench["transit"]["python"]["mean"] if "python" in bench.get("transit", {}) else None
        java_ms = bench["transit"]["java"]["mean"] if "java" in bench.get("transit", {}) else None

        row = f"{bench['name']:<35} {fastapi_ms:>9.2f}ms"
        row += f" {rust_ms:>9.2f}ms" if rust_ms else f" {'N/A':>10}"
        row += f" {python_ms:>9.2f}ms" if python_ms else f" {'N/A':>10}"
        row += f" {java_ms:>9.2f}ms" if java_ms else f" {'N/A':>10}"
        print(row)

        # Determine winner
        times = {"fastapi": fastapi_ms}
        if rust_ms: times["rust"] = rust_ms
        if python_ms: times["python"] = python_ms
        if java_ms: times["java"] = java_ms

        winner = min(times, key=times.get)
        winners[winner] += 1

    print(f"\n{'='*70}")
    print("  WINNER SUMMARY")
    print(f"{'='*70}")
    for lang, count in sorted(winners.items(), key=lambda x: -x[1]):
        if count > 0:
            print(f"  {lang.upper():.<30} {count} wins")

    # Detailed p95/p99 analysis
    print(f"\n{'='*70}")
    print("  TAIL LATENCY (p95)")
    print(f"{'='*70}")
    header = f"{'Operation':<35} {'FastAPI':>10} {'Rust':>10} {'Python':>10} {'Java':>10}"
    print(header)
    print("-" * len(header))

    for key, bench in data["benchmarks"].items():
        fastapi_ms = bench["fastapi"]["p95"]
        rust_ms = bench["transit"]["rust"]["p95"] if "rust" in bench.get("transit", {}) else None
        python_ms = bench["transit"]["python"]["p95"] if "python" in bench.get("transit", {}) else None
        java_ms = bench["transit"]["java"]["p95"] if "java" in bench.get("transit", {}) else None

        row = f"{bench['name']:<35} {fastapi_ms:>9.2f}ms"
        row += f" {rust_ms:>9.2f}ms" if rust_ms else f" {'N/A':>10}"
        row += f" {python_ms:>9.2f}ms" if python_ms else f" {'N/A':>10}"
        row += f" {java_ms:>9.2f}ms" if java_ms else f" {'N/A':>10}"
        print(row)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        # Find most recent results
        results_dir = Path(__file__).parent / "results"
        files = sorted(results_dir.glob("benchmark-*.json"))
        if not files:
            print("No benchmark results found. Run 'node run-benchmark.js' first.")
            sys.exit(1)
        analyze(files[-1])
    else:
        analyze(sys.argv[1])
