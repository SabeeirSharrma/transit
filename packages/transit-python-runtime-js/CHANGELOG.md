# @sabeeirsharrma/python-runtime

## 3.1.0

### Minor Changes

- Patch Notes — Bug Audit (17 bugs fixed)
  Breaking Fixes
  Java server no longer silently drops calls
  
      TransitServer.handleCall previously swallowed all exceptions after parsing, leaving the client hanging for 30 seconds until timeout. It now always sends an error response back to the client, regardless of where the failure occurred (parsing, function lookup, function execution, or response write).
      Critical Fixes
      scanFileSync no longer crashes on unexpected scanner output
      Previously assumed scanFilePath returns { entries: [...] } — it actually returns a raw JSON array. Added Array.isArray guard and signature ?? "" fallback so missing signatures no longer propagate undefined into downstream consumers.
      Python findServerScript now throws on missing custom script
      Setting serverScript to a nonexistent file previously returned null, silently falling through to auto-detection. Now throws immediately with a clear error message pointing to the exact path and option name.
      Socket leak on partial connectPool failure (Python + Java)
      If the Nth socket connection failed, the N-1 already-opened sockets were leaked. Now all sockets opened so far are destroyed before rethrowing.
      waitForTransport / waitForPort no longer hang on early process crash
      If the child process exited or errored before printing PORT= or SOCKET=, the Promise would never resolve. Now proc.on("error") and proc.on("exit") reject immediately.
      maybeRestart now rejects stale pending calls
      On process crash, in-flight requests with pending timers would hang until their 30s timeout. Now maybeRestart clears and rejects the entire pending map before restarting.
      Reliability Fixes
      Java callFunction handles malformed error responses
      If the Java server returns non-JSON in an error status, JSON.parse threw an unhandled SyntaxError. Now catches SyntaxError and returns a truncated raw response for debugging.
      process.on('exit') now performs cleanup
      Previously a no-op comment. Now calls bridge.stop() on all bridges for best-effort synchronous process termination.
      Scanner Fixes
      Rust scanner skips #[...] attribute lines
      Functions preceded by #[test], #[cfg(...)], #[allow(...)], etc. were missed because the scanner looked for pub fn on the attribute line itself rather than the declaration line below it.
      C/C++ scanner skips typedef declarations
      typedef void (*callback)(int) and similar patterns were incorrectly matched as function definitions. Now filtered out alongside comments and preprocessor directives.
      Schema Parser Fixes
      DEDENT tokens now generated
      Indentation decreases previously had no corresponding token, causing the parser to rely entirely on keyword lookahead for block termination. Now properly emits DEDENT tokens at each dedent level.
      Single-quoted strings now supported in schema files
      Lexer only recognized "double quotes". Now handles 'single quotes' identically.
      Parser.advance() returns safe EOF token at end of input
      Previously returned undefined when called past the last token, causing runtime crashes on malformed schemas. Now returns { type: "EOF", value: "", line: 0, col: 0 }.
      Minor Fixes
      Removed duplicate .mjs entry from SCANNABLE_EXTENSIONS in CLI init.

### Patch Changes

- Updated dependencies
  - @sabeeirsharrma/py-runtime@3.1.0

## 3.0.0

### Major Changes

- Add C/C++ support, make python faster

### Patch Changes

- Updated dependencies
  - @sabeeirsharrma/py-runtime@3.0.0

## 2.6.0

### Minor Changes

- Performance: removed JSON.parse from Python and Java bridge callFunction hot paths, added fnNameCache for zero-allocation function name encoding, replaced Buffer.alloc with Buffer.allocUnsafe, inlined buffer reads for faster response decoding, changed response handlers to use subarray views instead of Buffer.from copies, added env passthrough for Python bridge, and made Python server write_lock conditional for single-client connections.

### Patch Changes

- Updated dependencies
  - @sabeeirsharrma/py-runtime@2.6.0

## 2.5.0

### Minor Changes

- Patch 2.5.0: Critical fixes for Python runtime bridge

### Patch Changes

- Fixed SIGKILL never firing — saved process reference before nulling in `stop()`
- Fixed `start()` permanently bricking instance on failure — cleared `readyPromise` on error
- Added `stopping` check in `error` handler to prevent spurious restarts after `stop()`
- Added `@sabeeirsharrma/py-runtime` dependency for auto-copy
- Updated dependencies
  - @sabeeirsharrma/py-runtime@2.5.0

## 2.4.0

### Minor Changes

- Fix request pipelining in python

## 2.3.0

### Minor Changes

- Patch: Fix thread pool deadlock by processing CALL_REQUESTs inline in TransitServer

## 2.2.0

### Minor Changes

- Fix python socket loop bug due to port mismatch with nodejs

## 2.1.0

### Minor Changes

- implement socket connection pooling and concurrent request handling for improved performance

## 2.0.1

### Patch Changes

- depend on @sabeeirsharrma/transit for the ACTUAL framework instead of a package with the same name

## 2.0.0

### Major Changes

- Fix bugs and update docs

## 1.0.2

### Patch Changes

- re: add READMEs
- 3640fb4: Just add a script to automatically add readme on publish

## 1.0.1

### Patch Changes

- PATCH FOR INSTALL

## 1.0.0

### Major Changes

- 298063f: Complete transit, mostly
