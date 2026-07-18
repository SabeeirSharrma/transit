# Transit — Spec

**Status:** v0.1 (design stage)
**Author:** Sabeeir
**Tagline (draft):** *Languages that just talk to each other. No API. No middleman.*

---

## 1. Problem Statement

Real-world polyglot workflow today (illustrative example, not a fixed system):

```
Frontend (JS) → Upload
     ↓
JS handling layer → normalizes into JSON
     ↓
Python FastAPI server → routes request
     ↓
Rust (fast general processing) OR Java (specific processing)
     ↓
Result serialized back to JSON
     ↓
Back through Python → JS
```

Five programs running for what is conceptually a three-language problem
(JS, Rust, Java). The Python FastAPI layer exists purely as glue — it does
no actual processing, it just routes JSON between processes. Cost: an
extra process, extra serialization/deserialization at every hop, extra
latency, extra resource usage (the "GPU melting" problem), and a hand-written
API surface (routes, request/response schemas) that has to be maintained
by hand and kept in sync across languages.

**Goal:** eliminate the glue layer entirely. JS calls Rust or Java the way
it would call a local function. No REST API. No hand-written JSON schema.
No dedicated server process whose only job is routing.

Target result for the example above:

```
Frontend (JS) → Transit → Rust  (in-process native call)
                       ↘ Java   (persistent local transport)
```

Three programs. No FastAPI. No manually maintained JSON contract.

---

## 2. Core Idea

One shared schema (Transit IDL) defines the types and functions once.
Transit generates typed bindings for each language from that schema, and
provides the runtime transport to move calls/data between languages —
using whichever mechanism is fastest for that specific language pair.
The developer never writes serialization code or route handlers by hand.

```
transit.schema  →  transit-codegen  →  Rust bindings
                                     →  Java bindings
                                     →  JS/TS bindings
```

From JS, calling into Rust or Java looks like a normal function call:

```js
import { processFile } from "transit:processing"

const result = await processFile(fileBuffer)
// Transit decided at compile/config time whether this routes to Rust or Java,
// and how the call physically happens (in-process vs socket).
```

---

## 3. Transport Model (this is the key design decision)

Different language pairs need different transport strategies — there is
no single mechanism that makes all pairs "direct." Transit picks the best
available strategy per pair and hides the difference from the developer.

| Pair | Strategy | Why |
|---|---|---|
| JS ↔ Rust | **In-process native addon** (Rust compiled to a native Node addon, loaded directly into the JS process) | True function call, zero serialization, zero IPC. No second process exists for Rust at all. |
| JS ↔ Java | **Persistent local socket, binary protocol** | V8 and JVM cannot share a process. Java runs as a long-lived resident process (not started per-request like a cold API call); JS talks to it over a local Unix socket / named pipe using a compact binary format — not JSON, not HTTP. No server framework, no routes. |
| Rust ↔ Java | **JNI where feasible, socket fallback otherwise** | Same constraint as above; JNI can get closer to in-process on some builds, socket transport is the general-purpose fallback. |

Common rules across all strategies:
- No HTTP. No REST semantics (verbs, status codes, routes) anywhere in the
  system — this is a call/response and streaming model, not a web API model.
- No JSON on the wire for the binary transports — a compact schema-driven
  binary encoding (think: a purpose-built subset of what Cap'n Proto /
  FlatBuffers do — schema known ahead of time, no field names repeated
  per message, no parsing step) is generated from the Transit schema.
- The resident-process model (for Java) means no cold starts — the process
  is long-lived and warm, which is what actually kills the FastAPI overhead
  problem, not just skipping JSON.

---

## 4. Schema (Transit IDL) — draft

```
# shared type, generates matching Rust struct / Java class / TS interface
type FileJob:
    id: string
    bytes: binary
    priority: int

# declares a function Rust exposes; callable directly from JS/Java via Transit
service processing (target: rust):
    func process_general(job: FileJob) -> Result[FileJob, Error]

# declares a function Java exposes
service specific_processing (target: java):
    func process_specialized(job: FileJob) -> Result[FileJob, Error]
```

Transit reads this once and generates:
- Rust: a `#[transit::export]`-annotated function signature + native addon glue
- Java: a class stub with the method signature + socket transport glue
- JS/TS: a typed async function you import and call directly, with the
  routing decision (in-process vs socket) baked in by the codegen step —
  not decided at runtime, not written by hand.

---

## 5. What "JS decides which backend to use" means

The routing logic (Rust vs Java, per the earlier example) is ordinary
application code the developer writes in JS — Transit doesn't try to be
smart about routing decisions itself. What Transit removes is everything
*after* that decision: no manual `fetch()` call, no manually constructed
JSON body, no route on the other end. The `if` statement choosing Rust or
Java stays exactly where it always was; the boilerplate around calling
across languages disappears.

```js
const target = job.requiresSpecializedHandling ? specialized : general
const result = await target(job)   // direct call either way, Transit handles the rest
```

---

## 6. Non-Goals (v0.1)

- Not a general-purpose RPC framework for arbitrary/unknown services — it's
  designed around a small, known set of languages Sabeeir actually uses
  (JS, Rust, Java to start; C++ and Python later if needed).
- Not trying to support network-distributed services on day one (i.e. not
  competing with gRPC for cross-machine microservices) — the initial target
  is same-machine, multi-language single-application workflows. Distributed
  transport can be a later transport strategy added to the same schema model.
- Not replacing Rust/Java/JS's own concurrency models — Transit moves calls
  and data between languages, it doesn't dictate how each language handles
  its own async/threading internally.

---

## 7. Open Questions

- [ ] Exact binary wire format for the socket transport — roll a minimal
      custom format vs. adopt an existing one (FlatBuffers/Cap'n Proto) to
      avoid reinventing a serializer. Leaning toward evaluating existing
      formats first before building custom.
- [ ] Error model across languages — how do a Rust `Result::Err` and a Java
      exception surface as the same shape on the JS side?
- [ ] Streaming support (large files) — chunked transport vs. whole-buffer
      calls only in v0.1.
- [ ] Where does the Transit schema file live per-project, and how does
      codegen get triggered (build step vs. watch mode)?
- [ ] Does the Java process need a supervisor (auto-restart on crash), and
      who owns that — Transit itself, or left to the developer?

---

## 9. Developer-Facing Usage API

Installed as a normal package in whichever language is the "entry point" —
e.g. for a JS-fronted project: `bun install transit` (or `npm install transit`).
One root file registers each language codebase as a source; everywhere else
in the project imports that root file and calls into other languages as if
they were local functions.

```js
// index.js (project root)
import { transit } from "transit"

export const rs = transit.rust("./rust")
export const jv = transit.java("./java")
export const py = transit.python("./python")
```

```js
// ./js/upload-handler.js
import { rs, jv } from "../index.js"

const processed = await rs.processFile(buffer)
const specialized = await jv.specializedHandler(processed)
```

`transit.<lang>(dir)` scans that directory and returns a live handle whose
methods map 1:1 to exported functions found in that codebase. Calling
`rs.processFile(...)` is a real call across the language boundary — native
in-process call for Rust, socket call for Java — chosen automatically per
the transport rules in Section 3. The developer never sees the difference.

### 9.1 Marking functions as callable (exported)

**Superseded by the three-tier system in Section 9.4** — Tier 1 (native
visibility, zero source changes), Tier 2 (`transit:file` marker comment),
and Tier 3 (`transit:function` marker comment) replace earlier ideas
considered and dropped: decorator-style annotations
(`#[transit::export]`/`@Transit.Export`) and keyword substitution
(`tdef`/`transitfunc`/`transitfunction`). See Section 9.4 for full detail.
Comment markers were chosen because they're valid syntax in every target
language with zero preprocessing required.

The config-file override still applies as described below, layered on top
of all three tiers — for cases where touching source isn't desirable
(generated/vendored code):

```json
{
  "exports": [
    { "file": "legacy/parser.rs", "function": "parse_legacy_format" }
  ]
}
```

Resolution order: Tier 1 baseline + Tier 2/3 source markers are discovered
first; config entries are added on top (union, not replacement).

### 9.2 Discovery engine (how scanning actually works)

Given codebases can be very large, naive full-text scanning on every boot
is not acceptable. Discovery pipeline:

1. **Fast directory walk** — respects `.gitignore`/`.transitignore`, skips
   known noise dirs (`node_modules`, `target`, `__pycache__`, `.git`) by
   default. Modeled on the same approach `ripgrep`'s `ignore` crate uses.
2. **Real parsing via tree-sitter** — not regex. Tree-sitter has existing
   grammars for Rust, Java, Python, and JS/TS, supports incremental
   re-parsing (only the changed region of a changed file gets re-parsed),
   and is fast enough to run on file save in dev mode.
3. **Caching** — per-file hash or mtime stored between runs; unchanged
   files are never re-parsed. Only the diff since last scan is processed
   on startup after the first run.
4. **Manifest output** — the scan produces an internal function manifest
   (name, signature, source file, language) that both dev-mode's dynamic
   `Proxy` resolution and build-mode's codegen consume.

### 9.3 Dev mode vs. build mode

**Dev mode** (`transit dev` or default when just running the app locally):
- Transit runs a resident watcher process, keeping the manifest live as
  files change.
- `rs`, `jv`, `py` etc. are JS `Proxy` objects — calling `rs.processFile(...)`
  resolves the method name against the live manifest at call time and routes
  it through the appropriate transport.
- Optimized for iteration speed and hot-reload feel, not raw throughput.

**Build mode** (`transit build`, run before deploy):
- Codegen replaces the dynamic Proxy with real generated typed stubs — no
  runtime name resolution left.
- Rust sources are compiled into an actual native Node addon (`.node` file,
  via napi-rs) — a genuine compilation step, not just copying JS around.
- Java sources are packaged and Transit sets up the resident-process +
  socket-transport wiring as a managed subprocess with defined startup/
  shutdown/health-check behavior.
- This is a **required pipeline step** for production — `transit build`
  must run before `transit start`, the same way a Rust project needs
  `cargo build --release` before shipping a binary. Running raw source
  through dev-mode's dynamic resolution in production is explicitly
  unsupported (too much runtime overhead, no compiled native addon).

---

## 9.4 Export Mechanisms and Calling Syntax

Transit supports three layered ways to expose and call functions, from
zero-touch to fully explicit. Developers pick whichever fits a given
codebase or file — they're not mutually exclusive within a project.

**Tier 1 — Universal path access (no source changes required).**
Works on any scanned codebase immediately, since the manifest already
contains every discovered function:
```js
transit.rs["filename"]["function"]()
transit.rs.filename.function()      // dot-notation equivalent
```
This is also the required disambiguation form when two files export a
function with the same name (`transit.rs.file1.helloWorld()` vs.
`transit.rs.file2.helloWorld()`).

**Tier 2 — File-level export.** A marker comment at the top of a file,
no keyword changes:
```rust
// transit:file
```
```python
# transit:file
```
Every eligible function in that file is flattened into the shorthand
`transit.rs.function()` (namespace collision still falls back to the
filename-qualified form from Tier 1).

**Tier 3 — Function-level export via comment marker.** A comment placed
directly above the function signals export intent — no keyword changes,
no new syntax, valid in every language today since comments are already
ignored by every compiler/interpreter:
```rust
// transit:function
pub fn process_file(job: FileJob) -> Result<FileJob, Error> { ... }
```
```python
# transit:function
def handle(job: FileJob) -> FileJob: ...
```
```js
// transit:function
function specializedHandler(data) { ... }
```
Functions marked this way behave completely normally if the file is run
directly — the marker is just a comment — and are additionally indexed for
cross-language calls, callable via the flattened shorthand (same collision
rule as Tier 2: falls back to `transit.rs.filename.function()` if two
exported functions share a name).

### Why comment markers don't need a transform stage

Unlike keyword substitution (`tdef`/`transitfunc`/`transitfunction` — an
earlier design considered and dropped in favor of this), a comment is
already valid syntax in every target language, so the real compiler/
interpreter never needs to see a rewritten version of the file. Transit's
scanner detects the `transit:function` comment immediately preceding a
function while doing its normal tree-sitter structural parse — no text
pre-pass, no cached transformed output, no risk of the transform and the
real compiler disagreeing about what a file means. The scanner stays
strictly read-only, which was the original (simpler) design intent.

---

## 9.5 Bootstrap / Installation Flow

Goal: one command sets up a whole polyglot project from an already-declared
root file, installing the correct package for each language and wiring up
imports, without the developer manually running `pip install`/`cargo add`/
`bun install` per language by hand.

```
npx init transit
```

Behavior:
1. Reads the root `index.js`/`transit.js` (or equivalent) to find declared
   codebases — the `transit.rust("./rust")`, `transit.java("./java")`,
   `transit.python("./python")` calls already present.
2. For each declared language, runs that language's native package manager
   to install the Transit runtime library:
   - Python: `uv add transit` (falls back to `pip install transit` if `uv`
     isn't present)
   - Rust: `cargo add transit`
   - JS/TS: already present (the root file importing `transit` implies it's
     installed — bootstrap verifies, doesn't reinstall)
3. Inserts the language-appropriate import/use statement only into source
   files that **call into** other bridged languages (e.g. a Python file
   doing `transit.rs.something()`). Files that are merely *exported* via
   `transit:file`/`transit:function` markers need no import at all — the
   markers are plain comments, not library usage, so a Rust or Java file
   being called *into* stays untouched unless it also calls out elsewhere:
   - Python: `import transit`
   - Rust: `use transit;`
4. Writes/updates a `transit.config.json` at project root recording which
   language dirs are registered and which package versions were installed,
   so subsequent runs of `transit dev`/`transit build` don't need to
   re-resolve this.

This is a **one-time setup command**, not something that runs on every
`transit dev`/`transit build` — subsequent runs read the config written in
step 4. Re-running `npx init transit` is safe (idempotent) if a new
language directory gets added later.

### Default indexing behavior (Tier 1 baseline)

For Tier 1 to work with zero source changes, the scanner indexes every
function that is *natively public* per each language's own visibility
rules by default — `pub fn` in Rust, top-level `def`s not prefixed with
`_` in Python, `export`ed functions in JS — without requiring any Transit-
specific marker. Tiers 2 and 3 exist to *flatten the namespace* and make
intent explicit, not to be the only way something becomes reachable.

**Tier 2/3 markers override native visibility.** A `transit:function`
comment above a `_private`-prefixed Python function (or any similarly
"private by convention" function in another language) still exports it —
the marker is an explicit, deliberate override of the language's own
privacy convention, not subject to it. This is intentional: a fast
internal helper that's inconvenient to reimplement in another language is
exactly the case these markers exist for. Tier 1's native-visibility
baseline only governs what's reachable with *zero* source changes; once a
developer adds a marker, they've made the export decision explicitly and
Transit honors it regardless of the underlying language's naming convention.

---

## 11. Custom Build & Link Configuration

Transit's defaults (Section 3's transport table, `cargo build --release`
for Rust, a standard resident JVM process for Java, etc.) won't fit every
project — cross-compilation targets, custom compiler flags, a specific
Python virtual environment, JVM memory/GC tuning, or a non-default
transport strategy for a given pair. Rather than hardcoding one path,
`transit.config.json` supports per-language **build overrides** and
per-pair **link/transport overrides**, layered on top of the defaults —
specify only what needs to differ, everything else falls back to Transit's
standard pipeline.

### 11.1 Build overrides (how a language's code gets compiled/interpreted)

```json
{
  "build": {
    "rust": {
      "command": "cargo build --release --target aarch64-unknown-linux-gnu",
      "features": ["simd", "gpu-accel"]
    },
    "python": {
      "interpreter": ".venv/bin/python3.12",
      "env": { "PYTHONOPTIMIZE": "1" }
    },
    "java": {
      "jvmArgs": ["-Xmx2g", "-XX:+UseZGC"]
    }
  }
}
```

Any field left unset uses Transit's default for that language. This is
purely additive configuration, not a replacement build system — Transit
still owns *when* these commands run (as part of `transit build`), it just
lets the developer control *how* each language's own toolchain is invoked.

### 11.2 Link/transport overrides (how two languages talk to each other)

Section 3 defines Transit's default transport choice per language pair
(in-process native addon for JS↔Rust, resident-process + socket for
JS↔Java, etc). A project can override the strategy for a specific pair if
the default doesn't fit — e.g. forcing socket transport even for JS↔Rust
if native-addon compilation isn't viable in a given environment (certain
sandboxes, certain CI setups):

```json
{
  "links": {
    "js-rust": { "transport": "socket", "socketPath": "/tmp/transit-rust.sock" },
    "js-java": { "transport": "socket", "socketPath": "/tmp/transit-java.sock" }
  }
}
```

Default remains in-process where available; this section exists purely as
an escape hatch, not a required part of normal setup.

### 11.3 Resolution order

1. Transit's built-in default (Section 3) for the pair/language.
2. `transit.config.json` overrides, if present — build overrides and
   link/transport overrides are independent of each other (setting one
   doesn't require setting the other).
3. `npx init transit` (Section 9.5) never overwrites an existing `build`/
   `links` block in the config — it only fills in fields that are missing,
   so custom configuration survives re-running the bootstrap command.

---

## 12. Relationship to Peid

Transit is the near-term, adoptable-now tool: bridges *existing* Rust/JS/
Java(/C++) code without requiring a rewrite. Peid (separate repo/spec) is
the longer-term language that eventually absorbs this interop model natively
— write once in Peid, compile to whichever backend, no bridging layer needed
at all because there's only one source language. Transit's schema/type model
is expected to directly inform Peid's own type system once that work starts.
