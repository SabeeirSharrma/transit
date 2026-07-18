# Export Tiers

Transit discovers functions in your source code using a three-tier system. Higher tiers provide more control; Tier 1 requires zero source changes.

## Tier 1 — Natively Public (Zero Changes)

The scanner automatically discovers functions that are public by their language's own rules:

| Language | Detection Method | Example |
|----------|-----------------|---------|
| **Rust** | Text scan for `pub fn` / `pub async fn` | `pub fn process_job(job: FileJob) -> Result` |
| **Java** | Text scan for lines starting with `public` + `(` | `public String processJob(String argsJson)` |
| **JavaScript** | Tree-sitter query for `export_statement` + `function_declaration` | `export function processJob(data) {}` |
| **Python** | Tree-sitter query for `function_definition` (non-underscore prefix) | `def process_job(data):` |

**No annotations, no markers, no source changes.** Just write normal code with normal visibility modifiers.

```rust
// This is automatically discovered — it's a pub fn
pub fn process_general(job: FileJob) -> ProcessResult { ... }
```

```java
// This is automatically discovered — it's a public method
public String processSpecialized(String argsJson) { ... }
```

## Tier 2 — File-Level Export

A comment marker at the top of a file exports all eligible functions in that file into the flat namespace:

```rust
// transit:file
// All public functions in this file are exported

pub fn helper_a() -> String { ... }
pub fn helper_b() -> String { ... }
```

```python
# transit:file

def process(data):
    return transform(data)
```

```java
// transit:file

public class Utils {
    public static String format(String input) { ... }
    public static String parse(String input) { ... }
}
```

**Effect:** Functions in the file are available via the flat namespace (`rs.helperA()`) in addition to the qualified form.

## Tier 3 — Function-Level Export

A comment marker placed directly above a function exports that specific function, even if it would otherwise be private:

```rust
// transit:function
fn internal_helper(data: &[u8]) -> String {
    format!("Internal: {} bytes", data.len())
}
```

```python
# transit:function
def _private_transform(data):
    return optimized_path(data)
```

```js
// transit:function
function computeHash(buffer) { ... }
```

**Key point:** Tier 3 overrides the language's visibility rules. A `_private`-prefixed Python function or a non-`pub` Rust function becomes callable from other languages when marked with `// transit:function`.

This is intentional: the whole point is to export fast internal helpers that would be inconvenient to reimplement in another language.

## Name Disambiguation

When multiple files export functions with the same name, the flat namespace uses the last one seen. To call a specific file's version, use the qualified form:

```js
// If lib.rs and utils.rs both export "process":
await rs["lib"]["process"](data)    // calls lib.rs's process
await rs["utils"]["process"](data)  // calls utils.rs's process

// Dot notation also works:
await rs.lib.process(data)
```

## Marker Syntax by Language

| Language | Tier 2 (file) | Tier 3 (function) |
|----------|---------------|-------------------|
| Rust | `// transit:file` | `// transit:function` |
| JavaScript | `// transit:file` | `// transit:function` |
| TypeScript | `// transit:file` | `// transit:function` |
| Python | `# transit:file` | `# transit:function` |
| Java | `// transit:file` | `// transit:function` |

## Why Comment Markers?

Transit considered and rejected several alternatives:

- **Decorator/annotation style** (`#[transit::export]`, `@Transit.Export`): Requires a library import in every file. Changes the language's syntax.
- **Keyword substitution** (`tdef`, `transitfunc`): Requires a preprocessor to rewrite the file before compilation. Risk of the transformed version diverging from what the compiler sees.
- **Comment markers**: Valid syntax in every language. No preprocessing needed. The scanner detects them during its normal tree-sitter parse pass. The developer's code runs unchanged.

## Priority and Layering

1. **Tier 1 baseline:** All natively public functions are always in the manifest
2. **Tier 2/3 markers:** Add functions to the flat namespace (can include private functions)
3. **Config overrides:** `transit.config.json` can add additional exports for generated/vendored code:

```json
{
  "exports": [
    { "file": "legacy/parser.rs", "function": "parse_legacy_format" }
  ]
}
```

Resolution order: Tier 1 + Tier 2/3 are discovered first, then config entries are added on top (union, not replacement).

## Scanner Output

The scanner produces a manifest entry for each discovered function:

```json
{
  "language": "rust",
  "sourceFile": "/path/to/lib.rs",
  "function_name": "process_general",
  "signature": "pub fn process_general(job: FileJob) -> ProcessResult",
  "export_tier": 1
}
```

The transit-js layer normalizes `function_name` to support both snake_case and camelCase lookups.
