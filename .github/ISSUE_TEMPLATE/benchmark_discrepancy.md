---
name: Benchmark Discrepancy
about: Report a benchmark result that looks incorrect, inconsistent, or suspicious
title: "[Benchmark] Title"
labels: benchmark
assignees: ''
---

## What looks off

Describe what result seems wrong - e.g. a number that's implausibly fast/
slow, inconsistent between runs, or doesn't scale the way you'd expect
given the operation.

## Benchmark Category & Operation

- **Category:** (e.g. Computational, Chat Server)
- **Operation:** (e.g. Matrix Multiply, Message Send Pipeline)
- **Mode:** (Serial / Concurrent, if applicable)
- **Comparison target(s) affected:** (e.g. ZeroMQ, Redis, Transit/Rust)

## Your Results

```md
paste your benchmark.md output or raw log here
```

## Environment

- **Transit version:**
- **OS and hardware:**
- **Relevant runtime versions (Node, Rust, Java, Python):**

## Correctness Check

Benchmarks in this project validate output correctness before recording a
timing (a fast-but-wrong result shouldn't be able to win). If you have
reason to believe a result reflects an implementation that isn't doing the
real computation (e.g. fire-and-forget instead of round-trip, a stub
handler, etc.), describe why here - this is taken seriously.

## Additional Context

Anything else relevant — did this reproduce across multiple runs? Any
recent changes to your setup?
