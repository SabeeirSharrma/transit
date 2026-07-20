# Getting Started with Transit

Welcome! This guide will walk you through using Transit **step by step**, even if you have never set up a project like this before. Transit lets your JavaScript code call functions written in Rust, Python, and Java — like they are all one language.

## What is Transit?

Imagine you have three friends who speak different languages: one speaks Rust (fast at math), one speaks Python (great at data tasks), and one speaks Java (handles big jobs). Transit is a translator that lets you — the JavaScript speaker — talk to all three at once, seamlessly.

You write your code in JavaScript. When you need something fast, you call a Rust function. When you need something simple, you call a Python function. Transit handles all the communication behind the scenes.

## Before You Start

You will need some tools installed on your computer. Here is how to check:

| Tool | What it does | How to check if you have it |
|------|-------------|----------------------------|
| **Node.js** (version 20 or higher) | Runs JavaScript | Open a terminal and type `node --version` |
| **bun** or **npm** | Installs packages | Type `bun --version` or `npm --version` |
| **Rust** | Only if you want Rust functions | Type `rustc --version` |
| **Python** 3.10+ | Only if you want Python functions | Type `python3 --version` |
| **Java** JDK 21+ | Only if you want Java functions | Type `java --version` |

**If you only want Rust and Python**, you can skip Java entirely. Transit only loads what you ask it to.

## Step 1: Create Your Project

Open a terminal (on Mac, it is called "Terminal"; on Windows, use "PowerShell" or "WSL"; on Linux, you already know).

Type these commands one at a time:

```bash
mkdir my-transit-app
cd my-transit-app
bun init -y
bun install transit
```

This creates a new folder, enters it, sets up the project, and downloads Transit.

## Step 2: Your First Rust Function

Rust is great for fast, safe code. Let us create a simple Rust function.

### Create the Rust project

First, make the folders and files:

```bash
mkdir -p rust/src
```

Now create the file `rust/Cargo.toml` (this tells Rust how to build your code). Put this inside:

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
serde_json = "1"
```

**What this does:** It tells Rust "please build a special file that JavaScript can load." The `cdylib` part creates what is called a "native addon" — a file that Node.js can read directly.

### Write the Rust function

Create the file `rust/src/lib.rs` and put this inside:

```rust
use napi_derive::napi;

// This function takes a name and returns a greeting
#[napi]
pub fn greet(name: String) -> String {
    format!("Hello from Rust, {}!", name)
}

// This function adds two numbers
#[napi]
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}
```

**What this does:**
- `#[napi]` tells Transit "please export this function so JavaScript can call it"
- `pub fn` means "this is a public function"
- The function takes inputs and returns a result, just like any normal function

### Build the Rust code

```bash
cd rust
cargo build --release
```

This compiles your Rust code. It will take a minute the first time.

When it finishes, you need to copy the result so Transit can find it:

```bash
cp target/release/libmy_rust_module.so index.node
cd ..
```

**Important:** On Mac, use `cp target/release/libmy_rust_module.dylib index.node` instead.

### Call it from JavaScript

Create the file `index.js` in your project root:

```js
import { transit } from "transit";
import { resolve } from "node:path";

const __dirname = import.meta.dirname;

// Tell Transit where your Rust code lives
const rs = transit.rust(resolve(__dirname, "./rust"));

// Call the Rust functions — it feels like calling any JavaScript function!
const greeting = await rs.greet("World");
console.log(greeting);  // "Hello from Rust, World!"

const sum = await rs.add(10, 20);
console.log(sum);  // 30
```

**What this does:**
- `transit.rust(...)` scans your Rust directory and finds the functions you exported
- `rs.greet("World")` calls your Rust function from JavaScript — Transit handles all the communication
- `await` is needed because the first call loads the Rust code (subsequent calls are instant)

### Run it!

```bash
node index.js
```

You should see:

```
Hello from Rust, World!
30
```

Congratulations! You just called Rust from JavaScript!

## Step 3: Add Python Functions

Python is great for data processing and simple scripts. Let us add some Python functions.

### Create the Python file

Create the file `python/transit_service.py` (the name matters — Transit looks for this specific name):

```python
import json
import sys
import os

# Tell Python where to find the Transit server code
# This is inside the transit package you installed
sys.path.insert(0, os.path.join(
    os.path.dirname(__file__),
    "..", "node_modules", "transit", "packages", "transit-py-runtime"
))

from transit_server import TransitServer, register_function


def process_data(args_json):
    """Process some data and return a result."""
    args = json.loads(args_json)
    items = args.get("items", [])
    return json.dumps({
        "output": f"Python processed {len(items)} items",
        "processed": True
    })


def get_stats(args_json):
    """Return some stats."""
    return json.dumps({"status": "healthy", "language": "python"})


if __name__ == "__main__":
    server = TransitServer()
    register_function("processData", process_data)
    register_function("getStats", get_stats)
    server.start()
```

**What this does:**
- Each function takes a JSON string and returns a JSON string
- `register_function("processData", process_data)` tells Transit "when JavaScript calls `processData`, run my `process_data` function"
- The names do not have to match — you can call the JavaScript name anything you want
- `server.start()` starts a tiny server that listens for JavaScript requests

### Call from JavaScript

Update your `index.js`:

```js
import { transit } from "transit";
import { resolve } from "node:path";

const __dirname = import.meta.dirname;

const rs = transit.rust(resolve(__dirname, "./rust"));
const py = transit.python(resolve(__dirname, "./python"));

// Call Rust
console.log(await rs.greet("Transit"));

// Call Python
const result = await py.processData({ items: [1, 2, 3] });
console.log(result);  // {"output": "Python processed 3 items", "processed": true}
```

Run it:

```bash
node index.js
```

**Note:** The first time you call a Python function, Transit starts a Python process in the background. This takes a moment. After that, all calls are fast.

## Step 4: Add Java Functions

Java is good for complex business logic. Let us add some Java.

### Create the Java file

Create `java/src/main/java/com/example/App.java`:

```java
package com.example;

import transit.java.TransitServer;

public class App {
    public String processJob(String argsJson) {
        return "{\"output\": \"Java processed the job\"}";
    }

    public String getVersion(String argsJson) {
        return "{\"version\": \"1.0.0\"}";
    }

    public static void main(String[] args) throws Exception {
        TransitServer server = new TransitServer();
        App app = new App();
        server.registerFunction("processJob", app::processJob);
        server.registerFunction("getVersion", app::getVersion);
        server.start();
    }
}
```

**What this does:**
- Each Java method takes a `String` (JSON) and returns a `String` (JSON)
- `server.registerFunction("processJob", app::processJob)` links the JavaScript name to the Java method
- The `main` method starts the Java server

### Build the Java code

You need to compile the Java code. This requires the Java Development Kit (JDK):

```bash
mkdir -p java/build

# First, build the Transit Java runtime (the server code)
cd packages/transit-java-runtime
javac -d build src/main/java/transit/java/*.java
cd ../..

# Then build your app
javac -cp packages/transit-java-runtime/build -d java/build java/src/main/java/com/example/*.java
```

### Call from JavaScript

Update `index.js`:

```js
import { transit } from "transit";
import { resolve } from "node:path";

const __dirname = import.meta.dirname;

const rs = transit.rust(resolve(__dirname, "./rust"));
const jv = transit.java(resolve(__dirname, "./java/src/main/java"));
const py = transit.python(resolve(__dirname, "./python"));

// Call all three languages — they all feel the same from JavaScript!
console.log(await rs.greet("World"));
console.log(await jv.processJob({}));
console.log(await py.processData({ items: [1, 2, 3] }));
```

## Step 5: See What Transit Found

Add this to your `index.js`:

```js
transit.info();
```

This prints every function Transit discovered:

```
rust (./rust): 2 functions
  - greet [tier 1] (pub fn greet(name: String) -> String)
  - add [tier 1] (pub fn add(a: i32, b: i32) -> i32)
python (./python): 2 functions
  - processData [tier 1] (def process_data(args_json))
  - getStats [tier 1] (def get_stats(args_json))
java (./java/src/main/java): 2 functions
  - processJob [tier 1] (public String processJob(String argsJson))
  - getVersion [tier 1] (public String getVersion(String argsJson))
```

## How Function Discovery Works

You do not need to do anything special to export functions. Transit finds them automatically:

- **Rust:** Any function with `pub fn` is found
- **Python:** Any top-level `def` function (not starting with `_`) is found
- **Java:** Any `public` method is found
- **JavaScript:** Any `export function` is found

If you have two files with the same function name, use this syntax:

```js
await rs["lib"]["process"](data)    // calls lib.rs's process
await rs["utils"]["process"](data)  // calls utils.rs's process
```

## File Layout

Here is what a typical Transit project looks like:

```
my-project/
  rust/
    src/lib.rs          # Your Rust functions
    Cargo.toml
  python/
    transit_service.py  # Your Python functions
  java/
    src/main/java/...   # Your Java functions
  index.js              # Your JavaScript entry point
```

## Troubleshooting

**"Scanner not available" or "native addon not built"**

The scanner is the tool that finds your functions. Build it first:

```bash
cd packages/transit-scanner
cargo build --release
cp target/release/libtransit_scanner.so index.node
cd ../..
```

On Mac: `cp target/release/libtransit_scanner.dylib index.node`

**"Python transit_service.py not found"**

Make sure your Python file is named `transit_service.py` (not `service.py` or `server.py`). Transit looks for this specific name.

Also make sure `transit_server.py` is in the same directory. Copy it from the Transit monorepo:

```bash
cp packages/transit-py-runtime/transit_service.py python/transit_service.py
```

**"Java class not found"**

Compile your Java code:

```bash
javac -d build src/main/java/**/*.java
```

**Functions not showing up**

Check that your functions match these rules:
- Rust: must be `pub fn` (not just `fn`)
- Python: must be `def` at the top level (not inside a class unless you want `ClassName.method` style)
- Java: must be `public` methods

**The first Python/Java call is slow**

This is normal! The first call starts the Python/Java process. After that, all calls are fast because the process stays running.

**"Port already in use"**

If you see this error, another Transit process might be running. Kill it:

```bash
pkill -f "transit_service.py"
```

## Next Steps

- [How Export Tiers Work](export-tiers.md) — learn about the three levels of function visibility
- [API Reference](api-reference.md) — full list of Transit functions
- [Binary Protocol](binary-protocol.md) — how Transit communicates between languages (advanced)
- [Architecture](architecture.md) — how Transit is built (advanced)
