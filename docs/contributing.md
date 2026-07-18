# Contributing

Development guide for the Transit monorepo.

## Prerequisites

- **Node.js** >= 20
- **bun** (package manager)
- **Rust** toolchain (for scanner and native addons)
- **Java** JDK 21+ (for Java runtime)
- **Python** 3.10+ (for Python runtime)

## Repository Structure

```
transit/
  packages/
    transit-js/                 # Public API (TypeScript → dist/index.js)
    transit-scanner/            # Rust tree-sitter scanner (native addon)
    transit-schema/             # Shared types and config (TypeScript)
    transit-rust-runtime/       # napi-rs bridge (Rust)
    transit-java-runtime/       # Java TCP server (Java)
    transit-java-runtime-js/    # Java bridge client (TypeScript)
    transit-py-runtime/         # Python TCP server (Python)
    transit-python-runtime-js/  # Python bridge client (TypeScript)
    transit-codegen/            # Code generation (TypeScript)
  cli/
    transit-cli/                # CLI tool — init, dev, build, start
  examples/
    js-rust-java-demo/          # Working demo
  docs/                         # Documentation
```

## Building

### Install all dependencies

```bash
bun install
```

### Build the scanner (Rust native addon)

```bash
cd packages/transit-scanner
cargo build --release
cp target/release/libtransit_scanner.so index.node
```

### Build transit-js

```bash
cd packages/transit-js
bun run build
```

### Build the CLI

```bash
cd cli/transit-cli
bun run build
```

### Build Java classes

```bash
cd packages/transit-java-runtime
javac -d build src/main/java/transit/java/*.java
```

### Build the Rust demo addon

```bash
cd examples/js-rust-java-demo/rust
cargo build --release
cp target/release/libtransit_demo.so index.node
```

## Testing

### Quick smoke test

```bash
timeout 15 node --input-type=module -e "
import { transit } from './packages/transit-js/dist/index.js';
import { resolve } from 'node:path';

const rs = transit.rust(resolve('examples/js-rust-java-demo/rust'));
const jv = transit.java(resolve('packages/transit-java-runtime/src/main/java'));

const rustResult = await rs.processGeneral({ id: 'test', bytes: [1,2,3], priority: 1 });
console.log('Rust:', rustResult);

const javaResult = await jv.processSpecialized({ id: 'test', bytes: [1,2,3] });
console.log('Java:', javaResult);

await jv._bridge.stop();
process.exit(0);
"
```

### Python smoke test

```bash
timeout 15 node --input-type=module -e "
import { transit } from './packages/transit-js/dist/index.js';
import { resolve } from 'node:path';

const py = transit.python(resolve('packages/transit-py-runtime'));

const result = await py.processData({ items: [1, 2, 3] });
console.log('Python:', result);

await py._bridge.stop();
process.exit(0);
"
```

### Scanner test

```bash
node -e "
const { scanDirectory } = require('./packages/transit-scanner/index.js');
const result = scanDirectory('packages/transit-java-runtime/src/main/java');
console.log(JSON.parse(result).entries.length, 'functions found');
"
```

### CLI test

```bash
# Test init
node cli/transit-cli/dist/index.js init --dry-run

# Test build (codegen only)
node cli/transit-cli/dist/index.js build --codegen-only

# Test help
node cli/transit-cli/dist/index.js --help
```

## Architecture Notes

### Scanner (transit-scanner)

Written in Rust for performance. Uses tree-sitter for structural parsing and a text-based fallback for Rust (`pub fn`) and Java (`public` methods).

Key files:
- `src/lib.rs` — scanner implementation
- `index.js` — CJS loader for the native addon
- `index.node` — compiled addon (not committed, built locally)

### Transit-js

The public API is a TypeScript file (`src/index.ts`) that compiles to ESM. Uses top-level `await` to load the scanner module at init.

Key pattern: `createLanguageHandle()` builds a JavaScript `Proxy` that intercepts property access, resolves function names against the manifest, and dispatches to the appropriate bridge.

### Java Runtime

Two packages:
- `transit-java-runtime/` — the Java server code (`.java` files + compiled `.class` files)
- `transit-java-runtime-js/` — the Node.js client (`JavaProcessManager`)

The Java server uses TCP (not Unix sockets) because `UnixDomainSocketAddress` is not supported on all platforms. The server binds to `127.0.0.1` on an ephemeral port.

### Python Runtime

Two packages:
- `transit-py-runtime/` — the Python server code (`transit_server.py`)
- `transit-python-runtime-js/` — the Node.js client (`PythonProcessManager`)

Same binary protocol as Java. Uses only Python stdlib (no external dependencies).

### Codegen (transit-codegen)

Generates typed stubs from scanner manifests:
- `generateTypeScript()` — produces `transit.gen.ts`
- `generateJavaGlue()` — produces `TransitService.gen.java`
- `generatePythonGlue()` — produces `transit_service.gen.py`

### CLI (transit-cli)

Commands:
- `transit init` — detects languages, writes config
- `transit dev` — live development with file watching
- `transit build` — scan → codegen → compile pipeline
- `transit start` — production mode with resident processes

## Known Issues / TODOs

- **Error normalization:** `TransitError` class not yet implemented (Phase 6)
- **Schema file:** The `transit.config.schema.json` format is not yet defined
- **Python auto-import:** `transit init` doesn't auto-insert import statements
- **`transit start` entry point:** Currently uses `--import ./transit.gen.js` which requires ESM support in the entry point

## Code Style

- TypeScript: 2-space indent, double quotes, semicolons
- Rust: standard `rustfmt`
- Java: standard Oracle style
- Python: PEP 8
- Commit messages: imperative mood, concise (e.g., "fix scanner toggle bug", "add Java TCP bridge")

## Pull Requests

To start contributing, first, create an issue and then, within that issue click on 'Create new branch'.
Once finished and ready to merge, create a new pull request related to the issue, PRs should be in this format:

**Title:** issue tag and title
**Description:** Changes made + how they work

Once PRs are published, it may take 1-2 days for review and approval, once approved, branch will be merged and PR + issue closed

You cannot re-open PRs, if something related to the original issue or the same problem/bug arises, you can either re-open the original issue OR create a new issue.

Some issues may be overtaken/undertaken by repo maintainer(s) at any time, with notice (so please keep checking issue conversations)

Issue branches will be deleted (unless they are extremely major changes)
