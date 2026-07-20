# How Transit Finds Your Functions

When you write a function in Rust, Python, or Java, Transit can find it automatically. You do not need to register functions manually or write special configuration. Transit scans your code and discovers functions based on simple rules.

## The Three Tiers

Think of tiers like levels of permission:

- **Tier 1** (default): Transit finds functions that are already public in your language. No changes needed.
- **Tier 2** (file-level): You put a comment at the top of a file to export everything in that file.
- **Tier 3** (function-level): You put a comment above a specific function to export it, even if it is private.

Most people only need Tier 1.

## Tier 1: Public Functions (No Changes Needed)

Transit finds functions that are public by your language's own rules:

### Rust

Any function with `pub fn` is found automatically:

```rust
// Transit finds this — it is a pub fn
pub fn process_job(job: FileJob) -> ProcessResult {
    // your code here
}

// Transit does NOT find this — it is not pub
fn internal_helper(data: &[u8]) -> String {
    format!("Internal: {} bytes", data.len())
}
```

**Important:** For Transit to call your Rust function from JavaScript, it must also be annotated with `#[napi]`. Here is a complete example:

```rust
use napi_derive::napi;

#[napi]
pub fn process_job(job: String) -> String {
    format!("Processed: {}", job)
}
```

And your `Cargo.toml` must include:

```toml
[lib]
crate-type = ["cdylib"]

[dependencies]
napi = "2"
napi-derive = "2"
```

### Python

Any function defined at the top level of a file (not inside a class) is found:

```python
# Transit finds this — it is a top-level def
def process_data(data):
    return transform(data)

# Transit also finds class methods
class DataProcessor:
    def process(self, data):  # Found as "DataProcessor.process"
        return transform(data)

# Transit does NOT find this — it starts with underscore
def _private_helper(data):
    return optimized_path(data)
```

**Important:** Your Python function receives a JSON string, not a parsed dictionary. You must call `json.loads()`:

```python
import json

def process_data(args_json):
    args = json.loads(args_json)  # Now args is a dictionary
    items = args.get("items", [])
    return json.dumps({"count": len(items)})
```

### Java

Any `public` method is found:

```java
// Transit finds this — it is a public method
public String processJob(String argsJson) {
    return "{\"result\": \"done\"}";
}

// Transit does NOT find this — it is private
private String internalHelper(String data) {
    return data.toUpperCase();
}
```

### JavaScript/TypeScript

Any exported function is found:

```js
// Transit finds this — it is exported
export function processJob(data) {
    return { result: "done" };
}

// Transit does NOT find this — it is not exported
function internalHelper(data) {
    return data.toUpperCase();
}
```

## Tier 2: File-Level Export

If you want to export all functions in a file (including private ones), add a comment at the very top:

### Rust

```rust
// transit:file
// All public functions in this file are exported

pub fn helper_a() -> String { ... }
pub fn helper_b() -> String { ... }
```

### Python

```python
# transit:file

def process(data):
    return transform(data)
```

### Java

```java
// transit:file

public class Utils {
    public static String format(String input) { ... }
    public static String parse(String input) { ... }
}
```

## Tier 3: Function-Level Export

If you want to export a specific private function, add a comment directly above it:

### Rust

```rust
// transit:function
fn internal_helper(data: &[u8]) -> String {
    format!("Internal: {} bytes", data.len())
}
```

### Python

```python
# transit:function
def _private_transform(data):
    return optimized_path(data)
```

### JavaScript

```js
// transit:function
function computeHash(buffer) {
    // ...
}
```

**Key point:** Tier 3 overrides the language's privacy rules. A function that would normally be hidden becomes callable from other languages.

## Name Disambiguation

If two files export functions with the same name, use the file name to pick which one:

```js
// If lib.rs and utils.rs both export "process":
await rs["lib"]["process"](data)    // calls lib.rs's process
await rs["utils"]["process"](data)  // calls utils.rs's process

// Dot notation also works:
await rs.lib.process(data)
```

## What the Scanner Produces

When Transit scans your code, it creates a list of discovered functions:

```json
{
  "language": "rust",
  "sourceFile": "/path/to/lib.rs",
  "functionName": "process_job",
  "signature": "pub fn process_job(job: FileJob) -> ProcessResult",
  "exportTier": 1
}
```

This list is used by Transit to know which functions are available and how to call them.

## Naming Between Languages

Transit automatically handles naming differences between languages:

- Rust uses `snake_case` (like `process_general`)
- JavaScript uses `camelCase` (like `processGeneral`)
- Java uses `camelCase` (like `processSpecialized`)

You can call functions using either style:

```js
// Both work for a Rust function named process_general:
await rs.process_general(data)
await rs.processGeneral(data)
```
