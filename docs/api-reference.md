# API Reference

This page lists all the Transit functions you can use in your JavaScript code.

## Importing Transit

```js
import { transit } from "transit";
```

This gives you the main `transit` object. Everything starts from here.

---

## Setting Up Languages

### `transit.rust(directory)`

Tells Transit to look for Rust functions in the given folder.

```js
const rs = transit.rust("./rust");
```

**What it does:**
1. Scans the folder for Rust files
2. Finds all `pub fn` functions
3. Loads the compiled Rust code (the `.node` file)
4. Returns an object you can use to call those functions

**You need:**
- The folder must contain Rust source files
- The Rust code must be compiled (`cargo build --release`)
- The compiled `.node` file must be in the folder or `target/release/`

**Example:**
```js
const rs = transit.rust("./rust");
console.log(await rs.greet("World"));  // Calls the greet function in Rust
```

---

### `transit.java(directory)`

Tells Transit to look for Java functions in the given folder.

```js
const jv = transit.java("./java/src/main/java");
```

**What it does:**
1. Scans the folder for Java files
2. Finds all `public` methods
3. On first function call, starts a Java process in the background
4. Returns an object you can use to call those functions

**You need:**
- The folder must contain Java source files
- The Java code must be compiled (`javac`)
- Java JDK 21+ must be installed

**Example:**
```js
const jv = transit.java("./java/src/main/java");
console.log(await jv.processJob({}));  // Calls processJob in Java
```

---

### `transit.python(directory)`

Tells Transit to look for Python functions in the given folder.

```js
const py = transit.python("./python");
```

**What it does:**
1. Scans the folder for Python files
2. Finds all top-level `def` functions
3. On first function call, starts a Python process in the background
4. Returns an object you can use to call those functions

**You need:**
- The folder must contain Python files
- The file must be named `transit_service.py` (or `service.py`, `main.py`, `app.py`)
- The file must import and use `transit_server.py` (see getting-started guide)
- Python 3.10+ must be installed

**Example:**
```js
const py = transit.python("./python");
console.log(await py.processData({ items: [1, 2, 3] }));  // Calls processData in Python
```

---

## Calling Functions

Once you have set up a language, you call its functions like normal JavaScript functions:

```js
const rs = transit.rust("./rust");
const py = transit.python("./python");

// Call Rust functions
const greeting = await rs.greet("World");
const sum = await rs.add(10, 20);

// Call Python functions
const result = await py.processData({ items: [1, 2, 3] });
const stats = await py.getStats();
```

**Important:** Always use `await` when calling Transit functions. The first call may take a moment (especially for Python and Java), but subsequent calls are fast.

---

## Listing Discovered Functions

### `transit.info()`

Prints a list of all functions Transit found:

```js
transit.info();
```

Output:
```
rust (./rust): 2 functions
  - greet [tier 1] (pub fn greet(name: String) -> String)
  - add [tier 1] (pub fn add(a: i32, b: i32) -> i32)
python (./python): 2 functions
  - processData [tier 1] (def process_data(args_json))
  - getStats [tier 1] (def get_stats(args_json))
```

This is helpful for debugging — if your function does not appear here, Transit did not find it.

---

## Handling Multiple Files with the Same Name

If two files export functions with the same name, use the file name to pick which one:

```js
// If lib.rs and utils.rs both have a "process" function:
await rs["lib"]["process"](data)    // Calls lib.rs's process
await rs["utils"]["process"](data)  // Calls utils.rs's process

// Dot notation also works:
await rs.lib.process(data)
```

---

## Cleaning Up

### `py._bridge.stop()`

Shuts down the Python process that Transit started in the background:

```js
await py._bridge.stop();
```

### `jv._bridge.stop()`

Shuts down the Java process:

```js
await jv._bridge.stop();
```

**When to use this:** When your application is shutting down and you want to cleanly stop background processes. In most cases, you do not need to call this — the processes will stop when your application exits.

---

## Configuration

### `transit.config`

The current Transit configuration (read-only):

```js
console.log(transit.config.build.rust.command);  // "cargo build --release"
console.log(transit.config.maxRestarts);          // 3
```

### `transit.reloadConfig(directory?)`

Reloads the configuration from disk. Use this if you change `transit.config.json` while your app is running:

```js
transit.reloadConfig();        // Reload from current directory
transit.reloadConfig("/app");  // Reload from a different directory
```

---

## Error Handling

When a function call fails, Transit throws an error with useful information:

```js
try {
    await rs.nonexistentFunction(data);
} catch (err) {
    console.error(err.message);
    // "Function \"nonexistentFunction\" not found in rust. Available: greet, add"
}
```

If a Python or Java function raises an error, Transit wraps it:

```js
try {
    await py.processData(badData);
} catch (err) {
    console.error(err.message);
    // "[python] processData: Division by zero"
}
```

---

## Advanced: Scanning a Single File

If you are building a file watcher and want to scan one file at a time:

```js
import { scanFileSync } from "transit";

const entries = scanFileSync("./src/lib.rs");
console.log(entries);  // Array of discovered functions in that file
```

---

## Advanced: Cache Management

Transit caches scan results to speed up subsequent startups. You can manage the cache:

```js
import { invalidateFileCache, clearScanCache } from "transit";

// Remove one file from the cache (e.g., when a file is deleted)
invalidateFileCache("./rust", "./rust/src/lib.rs");

// Clear the entire cache for a directory
clearScanCache("./rust");
```
