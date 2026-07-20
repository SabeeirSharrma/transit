# Contributing to Transit

This guide is for people who want to help improve Transit. If you just want to use Transit, see the [Getting Started](getting-started.md) guide.

## What You Need

Before you start, install these tools:

| Tool | How to check | How to install |
|------|-------------|----------------|
| **Node.js** >= 20 | `node --version` | Download from nodejs.org |
| **bun** | `bun --version` | `curl -fsSL https://bun.sh/install \| bash` |
| **Rust** | `rustc --version` | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| **Java** JDK 21+ | `java --version` | Download from adoptium.net |
| **Python** 3.10+ | `python3 --version` | Usually pre-installed on Mac/Linux |

## Repository Structure

Here is how the Transit code is organized:

```
transit/
  packages/
    transit-js/                 # The main JavaScript API
    transit-scanner/            # Finds functions in your code (Rust)
    transit-schema/             # Shared types (TypeScript)
    transit-rust-runtime/       # Rust bridge (napi-rs)
    transit-java-runtime/       # Java server (Java)
    transit-java-runtime-js/    # Java client (TypeScript)
    transit-py-runtime/         # Python server (Python)
    transit-python-runtime-js/  # Python client (TypeScript)
    transit-codegen/            # Code generation (TypeScript)
  cli/
    transit-cli/                # Command-line tool
  examples/
    js-rust-java-demo/          # Working example
  docs/                         # Documentation
```

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/SabeeirSharrma/transit.git
cd transit
bun install
```

### 2. Build the scanner

The scanner is the tool that finds functions in your code:

```bash
cd packages/transit-scanner
cargo build --release
cp target/release/libtransit_scanner.so index.node
```

On Mac: `cp target/release/libtransit_scanner.dylib index.node`

### 3. Build transit-js

```bash
cd packages/transit-js
bun run build
```

### 4. Build Java classes

```bash
cd packages/transit-java-runtime
javac -d build src/main/java/transit/java/*.java
```

## Testing Your Changes

### Quick smoke test

From the transit root:

```bash
timeout 15 node --input-type=module -e "
import { transit } from './packages/transit-js/dist/index.js';
import { resolve } from 'node:path';

const rs = transit.rust(resolve('examples/js-rust-java-demo/rust'));
const result = await rs.processGeneral({ id: 'test', bytes: [1,2,3], priority: 1 });
console.log('Rust:', result);
"
```

### Python test

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

## Code Style

- **TypeScript:** 2-space indent, double quotes, semicolons
- **Rust:** Standard `rustfmt`
- **Java:** Standard Oracle style
- **Python:** PEP 8
- **Commit messages:** Imperative mood, concise (e.g., "fix scanner toggle bug", "add Java TCP bridge")

## Pull Requests

1. Create an issue describing what you want to change
2. In the issue, click "Create new branch"
3. Make your changes
4. Create a pull request linked to the issue

**PR format:**
- **Title:** Issue tag and title
- **Description:** What you changed and why

PRs are reviewed within 1-2 days. Once approved, the branch is merged and closed.

## Known Issues

Here are some things that need work:

- The scanner's `index.js` does not check for `transit-scanner.node` (only `index.node`)
- Error messages when the scanner fails to load are too quiet
- Python entry point detection is limited to specific filenames
- The getting-started guide assumes a monorepo layout

See [feedback.md](feedback.md) for a full list of issues found during integration.
