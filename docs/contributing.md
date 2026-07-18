# Contributing

Development guide for the Transit monorepo.

## Prerequisites

- **Node.js** >= 20
- **bun** (package manager)
- **Rust** toolchain (for scanner and native addons)
- **Java** JDK 21+ (for Java runtime testing)

## Repository Structure

```
transit/
  packages/
    transit-js/              # Public API (TypeScript → dist/index.js)
    transit-scanner/         # Rust tree-sitter scanner (native addon)
    transit-schema/          # Shared IDL types (TypeScript)
    transit-rust-runtime/    # napi-rs bridge (Rust)
    transit-java-runtime/    # Java TCP server (Java)
    transit-java-runtime-js/ # Java bridge client (TypeScript)
  cli/
    transit-cli/             # CLI tool (skeleton)
  examples/
    js-rust-java-demo/       # Working demo
  docs/                      # Documentation
```

## Building

### Install dependencies

```bash
bun install
```

### Build transit-js

```bash
cd packages/transit-js
./node_modules/.bin/tsc
```

### Build the scanner (Rust)

```bash
cd packages/transit-scanner
cargo build --release
cp target/release/libtransit_scanner.so index.node
```

The `.node` file is the compiled native addon. The `index.js` wrapper loads it via `process.dlopen` for `.so` files or `require()` for `.node` files.

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

### Scanner test

```bash
node -e "
const { scanDirectory } = require('./packages/transit-scanner/index.js');
const result = scanDirectory('packages/transit-java-runtime/src/main/java');
console.log(JSON.parse(result).entries.length, 'functions found');
"
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

## Known Issues / TODOs

- **Scanner cache:** No incremental re-parsing yet (full re-scan on every startup)
- **Build mode:** Codegen and typed stubs not implemented
- **CLI:** `transit dev` / `transit build` / `transit start` are skeleton commands
- **Python:** Bridge not implemented
- **Config overrides:** `transit.config.json` parsing not wired up
- **File watchers:** No file-change detection for live reload in dev mode
- **Binary protocol:** Currently JSON-serialized arguments over the wire; a purpose-built binary encoding (FlatBuffers/Cap'n Proto) is planned

## Code Style

- TypeScript: 2-space indent, double quotes, semicolons
- Rust: standard `rustfmt`
- Java: standard Oracle style
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
