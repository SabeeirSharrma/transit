# Transit Benchmark Feedback

## Issue: Python Worker Infinite Respawn Loop

**Severity:** Critical — benchmark cannot complete
**Date:** 2026-07-27
**Component:** `@sabeeirsharrma/python-runtime` (PythonProcessManager) + Python TransitServer

---

## Symptom

When running `./run-all.sh`, the Transit/Python benchmark hangs during the first test (ETL Pipeline). The output shows dozens of new Python processes being spawned in rapid succession, each printing:

```
[benchmark-py] Server listening on UDS /tmp/transit-XXXXX.sock
[benchmark-py] Registered 7 functions
```

with different PIDs and socket paths. The benchmark never progresses past this point and must be killed with Ctrl+C.

---

## Root Cause: Protocol Mismatch Between Python Server and Node.js Manager

The Python `TransitServer` and the Node.js `PythonProcessManager` disagree on the transport protocol:

| Component | Preferred Transport | Stdout Signal |
|---|---|---|
| Python `TransitServer` | **UDS** (Unix Domain Socket) — tried first on Linux/macOS | `SOCKET=/tmp/transit-XXXXX.sock` |
| Node.js `PythonProcessManager` | **TCP** only | Looks for `PORT=XXXX` |

### The Loop

1. Node.js spawns the Python process.
2. Python successfully binds to a UDS socket (faster than TCP on Linux).
3. Python prints `SOCKET=/tmp/transit-XXXXX.sock` on stdout.
4. Node.js `waitForPort()` (line 132–151 of `python-runtime/dist/index.js`) scans stdout looking for the regex `/PORT=(\d+)/`.
5. No `PORT=` line ever appears → `waitForPort()` times out after `connectTimeout` (default 10s).
6. Node.js kills the Python process (or it crashes on timeout).
7. `maybeRestart()` is called → spawns a new Python process → back to step 2.

This repeats up to `maxRestarts` (default 3) times, but because the health check timer also fires and triggers restarts, it can loop far more than that in practice.

### Why UDS Is Preferred

In `service.py` lines 401–419:

```python
if hasattr(socket, "AF_UNIX") and sys.platform != "win32":
    self._socket_path = f"/tmp/transit-{os.getpid()}.sock"
    # ... binds UDS, prints SOCKET=, enters accept loop, returns
```

UDS is a valid optimization — it avoids TCP overhead (loopback NIC, Nagle's algorithm, etc.). The problem is that the **client side doesn't know how to consume it**.

---

## Why This Only Affects Python

- **Rust**: In-process native addon (N-API). No process spawning, no protocol negotiation.
- **Java**: `JavaProcessManager` uses TCP and prints `PORT=`. Works correctly.
- **Python**: `PythonProcessManager` uses TCP, but the Python server tries UDS first. Mismatch.

---

## Proposed Fixes (Priority Order)

### Fix 1: Teach `PythonProcessManager` to Support UDS (Recommended)

Update `waitForPort()` in `@sabeeirsharrma/python-runtime` to also recognize `SOCKET=` output and connect via Unix Domain Socket.

**In `python-runtime/dist/index.js`:**

```javascript
// waitForPort — also detect SOCKET= for UDS
waitForPort(proc) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error("Python process did not print PORT= or SOCKET= within timeout"));
        }, this.options.connectTimeout);
        let buffer = "";
        proc.stdout.on("data", (chunk) => {
            buffer += chunk.toString();
            // Check for TCP
            const portMatch = buffer.match(/PORT=(\d+)/);
            if (portMatch) {
                clearTimeout(timeout);
                resolve({ type: "tcp", port: parseInt(portMatch[1], 10) });
                return;
            }
            // Check for UDS
            const sockMatch = buffer.match(/SOCKET=([^\s]+)/);
            if (sockMatch) {
                clearTimeout(timeout);
                resolve({ type: "uds", path: sockMatch[1] });
            }
        });
        // ...
    });
}
```

And update `connect()` to handle both:

```javascript
async connect() {
    if (this.connectionInfo.type === "uds") {
        // Connect via Unix Domain Socket
        return new Promise((resolve, reject) => {
            const socket = createConnection(this.connectionInfo.path, () => {
                this.socket = socket;
                socket.setNoDelay(true);
                resolve();
            });
            socket.on("error", reject);
        });
    } else {
        // Existing TCP connection logic
    }
}
```

**Pros:** Preserves the UDS performance benefit. No Python-side changes needed.
**Cons:** Requires a change to `@sabeeirsharrma/python-runtime`.

---

### Fix 2: Make Python Server Detect Its Execution Context

Add an environment variable or CLI flag so the Python server knows whether it's being managed by the Node.js bridge:

```python
# In service.py start()
use_tcp = os.environ.get("TRANSIT_FORCE_TCP", "") == "1" or "--tcp" in sys.argv
if not use_tcp and hasattr(socket, "AF_UNIX") and sys.platform != "win32":
    # ... UDS path
else:
    # ... TCP path
```

Then in `run-benchmark.js`:

```javascript
const py = transit.python(resolve(__dirname, "./transit/python"), {
    env: { TRANSIT_FORCE_TCP: "1" }
});
```

**Pros:** Simple, no library changes needed.
**Cons:** Loses UDS performance. Requires callers to know about the flag.

---

### Fix 3: Default Python Server to TCP

Remove the UDS block from `TransitServer.start()` entirely, making TCP the only transport.

**Pros:** Simplest fix. Guaranteed compatibility.
**Cons:** Lose UDS performance (measurable for high-throughput IPC).

---

### Fix 4: Add `SOCKET=` Protocol Support to the Transit Package

Update the `transit.python()` factory to pass UDS support through:

```javascript
// In transit package's PythonLanguageHandle
const py = transit.python("./transit/python", { transport: "uds" }); // or "tcp"
```

**Pros:** Explicit, configurable, backward-compatible.
**Cons:** Requires API design decisions in the Transit package.

---

## Resolution: UDS Support (Already Implemented)

The `PythonProcessManager` in `@sabeeirsharrma/python-runtime` **already supports UDS**. The `waitForTransport()` method detects both `SOCKET=` and `PORT=` patterns, and `createConnection()` handles both UDS and TCP connections. No changes were needed for this fix.

---

## Resolution: Thread Pool Deadlock (Fixed 2026-07-28)

The thread pool deadlock was fixed by handling `_handle_call` inline instead of submitting to the executor. See "Issue: Thread Pool Deadlock in Python Service" below.

---

## Resolution: Rust Compiler Warnings (Fixed 2026-07-28)

Added `duration_ms` field to `TextAnalysisResult` and `GraphResult` structs in `benchmark/benchmark/computational/transit/rust/src/lib.rs`, making `analyze_text_full` and `process_graph` consistent with other benchmark functions that report timing.

---

## Recommendation

**Fix 1** is the correct long-term solution. UDS is genuinely faster for local IPC (benchmarks typically show 20-40% lower latency vs TCP loopback), and the Python server's preference for UDS is a good default. The Node.js bridge should adapt to what the server offers, not force TCP.

As an immediate workaround to unblock the benchmark, **Fix 2** (environment variable) is the least invasive change that doesn't require modifying `node_modules`.

---

## Additional Observations

### Rust Compiler Warnings

`src/lib.rs` has two unused `start` variables (lines 84 and 271) in `analyze_text_full` and `process_graph`. These functions don't report `duration_ms` in their results, unlike the other benchmarks. This is inconsistent — either all functions should report timing, or none should. Prefixing with `_start` would suppress the warnings.

### `TransitServer.start` Detected as Exported Function

The `.transit-cache.json` scanner picks up `TransitServer.start` as an exported function with signature `def start(self)`. This is a class method, not a standalone function — the scanner should exclude methods of classes that aren't the entry point. This doesn't cause bugs but clutters the function list.

### Process Cleanup

When the benchmark is interrupted (Ctrl+C), orphaned Python processes and stale UDS socket files (`/tmp/transit-*.sock`) are left behind. The `atexit` handler in `service.py` only fires on clean exit, not on SIGINT/SIGKILL. Consider adding SIGINT handling or a cleanup script.

---

## Issue: Thread Pool Deadlock in Python Service

**Severity:** Critical — Python benchmarks hang indefinitely
**Date:** 2026-07-28
**Component:** Python `TransitServer` (`_handle_client` + `_handle_call`)

---

### Symptom

After the UDS connection is established, the benchmark hangs during the first Python function call. No error messages appear, and no timeout is triggered. The output stops at:

```
[transit-python] Connected to Python process on UDS /tmp/transit-XXXXX.sock
```

---

### Root Cause: Thread Pool Exhaustion Deadlock

The `ThreadPoolExecutor` is shared between `_handle_client` (connection handler) and `_handle_call` (request processor). When the connection pool creates N connections, N `_handle_client` tasks are submitted to the executor. If the executor has M workers (where M < N), all M workers become blocked in `_recv_exact()` waiting for requests.

When a request arrives and `_handle_client` submits `_handle_call` to the same executor, no workers are available to process it. `_handle_client` loops back to `_recv_exact()` and blocks again. `_handle_call` is queued indefinitely — **deadlock**.

**Example:** On a 4-core machine (`max_workers=4`), `connectPool` creates 8 connections → 8 `_handle_client` tasks. 4 run immediately, 4 queued. When one submits `_handle_call`, all 4 workers are busy → `_handle_call` never runs.

---

### Fix: Handle Calls Inline

Call `_handle_call` directly from `_handle_client` instead of submitting to the executor. Each connection processes requests sequentially (Node.js awaits each call), so there's no need for concurrent dispatch.

**Files changed:**
- `benchmark/benchmark/chat-server/transit/python/service.py`
- `benchmark/benchmark/computational/transit/python/service.py`
- `packages/transit-py-runtime/transit_server.py`

**Diff pattern:**

```python
# BEFORE (deadlock-prone):
if msg_type == TYPE_CALL_REQUEST:
    self._executor.submit(self._handle_call, payload, request_id, client)

# AFTER (inline, no deadlock):
if msg_type == TYPE_CALL_REQUEST:
    self._handle_call(payload, request_id, client)
```

**Pros:** Eliminates deadlock entirely. Simpler code. No performance regression (requests were already serial).
**Cons:** Removes request pipelining support (not used by the benchmark anyway).
