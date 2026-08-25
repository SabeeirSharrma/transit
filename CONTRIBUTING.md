# Contributing to Transit

Thanks for your interest in Transit. Before opening anything, please read
this — it'll save you time.

## The short version

- **Issues are welcome and encouraged.** Bug reports, feature requests,
  questions, benchmark discrepancies, design feedback - all of that belongs
  here and will be read.
- **Unsolicited pull requests are not accepted.** Transit is maintained by
  a single person with a specific architectural vision and a spec-first
  workflow. PRs opened without prior discussion will be closed unreviewed,
  regardless of code quality. This isn't personal - see below for why.

## Why no unsolicited PRs

Transit's design (transport model, export tiers, config resolution order,
etc.) is deliberate and documented in the project's spec docs before any
code gets written. A PR that "just adds a feature" or "just fixes a bug"
often makes an implicit design decision along with it - and reviewing,
understanding, and potentially reverting someone else's design decisions
takes significantly more time than writing the equivalent code from
scratch with full context. For a solo-maintained project, that overhead
isn't sustainable.

This may change as the project matures and if a stable contribution model
makes sense later. For now, the fastest way to get something into Transit
is to open an issue and get alignment first.

## How to actually contribute right now

1. **Found a bug?** Open an issue with:
   - What you expected to happen
   - What actually happened
   - Steps to reproduce (a minimal repro is extremely helpful)
   - Transit version, OS, and relevant language versions (Rust/Java/Python
     versions if relevant to the bug)

2. **Have a feature idea or design suggestion?** Open an issue describing
   the problem you're trying to solve, not just the solution you have in
   mind — the "why" is more useful than the "what" at this stage. If a
   design discussion happens in the issue and there's alignment that a PR
   would help, one may be explicitly requested at that point.

3. **Found a security issue?** Do not open a public issue. See
   [SECURITY.md](./SECURITY.md) if present, or contact the maintainer
   directly.

4. **Benchmark results looking off?** Open an issue with your benchmark
   output attached - benchmark correctness matters a lot here, and
   discrepancies are taken seriously.

## If you already wrote a PR

If you've already put in the work and opened a PR anyway - thank you for
the effort, genuinely, but it will likely be closed unreviewed per the
policy above. If you think it's worth discussing, open an issue describing
what the PR does and why, and link the PR from there. That's the version
of this that has a chance of actually landing.

## Code of Conduct

Participation in this project (issues, discussions, anywhere else the
project has a presence) is governed by the
[Code of Conduct](./CODE_OF_CONDUCT.md).
