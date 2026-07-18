# Getting Started

A hands-on guide to using Transit for polyglot JS ↔ Rust ↔ Java interop.

## Prerequisites

- Node.js >= 20
- Rust toolchain (for scanner and Rust addons)
- Java JDK 21+
- Python 3.10+
- bun (recommended) or npm

## 1. Install Transit

```bash
bun install transit
```

## 2. Create a Rust module

```rust
// rust/src/lib.rs
// transit:file — exports all public functions

use napi_derive::napi;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
#[napi(object)]
pub struct Job {
    pub id: String,
    pub data: Vec<u8>,
    pub priority: i32,
}

#[derive(Serialize, Deserialize)]
#[napi(object)]
pub struct Result {
    pub id: String,
    pub output: String,
    pub processed: bool,
}

#[napi]
pub fn process_job(job: Job) -> Result {
    Result {
        id: job.id,
        output: format!("Processed {} bytes", job.data.len()),
        processed: true,
    }
}
```

Create a `Cargo.toml`:

```toml
[package]
name = "my-rust-module"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
napi = { version = "2", features = ["serde-json"] }
napi-derive = "2"
serde = { version = "1", features = ["derive"] }
```

Build it:

```bash
cd rust && cargo build --release
cp target/release/libmy_rust_module.so index.node
```

## 3. Create a Java service

```java
// java/src/main/java/transit/java/TransitService.java
package transit.java;

public class TransitService {

    public String processJob(String argsJson) {
        return "{\"output\":\"Java processed: " + argsJson.length() + " chars\"}";
    }

    public String getVersion(String argsJson) {
        return "{\"version\":\"1.0.0\"}";
    }

    public static void main(String[] args) throws Exception {
        TransitServer server = new TransitServer();
        TransitService service = new TransitService();
        server.registerFunction("processJob", service::processJob);
        server.registerFunction("getVersion", service::getVersion);
        server.start();
    }
}
```

Compile it:

```bash
cd packages/transit-java-runtime
javac -d build src/main/java/transit/java/*.java
```

## 4. Create a Python service

```python
# python/transit_service.py
import json
from transit_server import TransitServer, register_function

def process_data(args_json):
    """Process data and return a result."""
    args = json.loads(args_json)
    return json.dumps({
        "output": f"Python processed: {len(args.get('data', []))} items",
        "processed": True
    })

def get_version(args_json):
    """Return the service version."""
    return json.dumps({"version": "1.0.0"})

if __name__ == "__main__":
    server = TransitServer()
    register_function("processData", process_data)
    register_function("getVersion", get_version)
    server.start()
```

## 5. Wire it up in JS

```js
// index.js
import { transit } from "transit"
import { resolve } from "node:path"

const __dirname = import.meta.dirname

// Register codebases
const rs = transit.rust(resolve(__dirname, "./rust"))
const jv = transit.java(resolve(__dirname, "./java/src/main/java"))
const py = transit.python(resolve(__dirname, "./python"))

// Call Rust
const rustResult = await rs.processJob({
  id: "job-001",
  data: [72, 101, 108, 108, 111],
  priority: 1,
})
console.log("Rust:", rustResult)
// { id: "job-001", output: "Processed 5 bytes", processed: true }

// Call Java
const javaResult = await jv.processJob({
  id: "job-001",
  data: [1, 2, 3],
})
console.log("Java:", javaResult)
// { output: "Java processed: 24 chars" }

// Call Python
const pythonResult = await py.processData({
  id: "job-001",
  data: [10, 20, 30],
})
console.log("Python:", pythonResult)
// { output: "Python processed: 3 items", processed: true }

// List all discovered functions
transit.info()
```

Run it:

```bash
node index.js
```

## 6. File disambiguation

If two files export functions with the same name, use the qualified form:

```js
await rustTransit["lib"]["processJob"](job)
// or dot notation:
await rustTransit.lib.processJob(job)
```

## How discovery works

When you call `transit.rust("./rust")`, Transit:

1. Walks the directory (skipping `node_modules`, `target`, etc.)
2. Parses each `.rs` file with tree-sitter (Rust grammar)
3. Detects `pub fn` declarations (Tier 1)
4. Detects `// transit:file` and `// transit:function` markers (Tiers 2/3)
5. Builds a manifest of all discovered functions
6. Returns a `Proxy` that resolves function names against this manifest

The scanner runs once at startup. In dev mode, use `transit dev` to watch for file changes and update the manifest incrementally.

## 7. Using the CLI

### `transit init`

Scans your source files for `transit.rust()`, `transit.java()`, and `transit.python()` calls. Detects which languages are in use and writes `transit.config.json`.

```bash
transit init              # Detect languages and write config
transit init --dry-run    # Preview what would be written
```

### `transit dev`

Starts a live development server that watches for file changes and re-scans directories automatically.

```bash
transit dev               # Start watching for changes
transit dev --verbose     # Show per-file scan results
```

The dev server:
- Loads `transit.config.json` (or auto-discovers language directories)
- Scans all registered directories on startup using the tree-sitter scanner
- Watches for file changes and logs function additions/removals
- Clean shutdown with Ctrl+C

## Next steps

- [API Reference](api-reference.md) — full API documentation
- [Export Tiers](export-tiers.md) — three-tier function discovery system
- [Binary Protocol](binary-protocol.md) — how JS ↔ Java communication works
- [Architecture](architecture.md) — system design deep dive
