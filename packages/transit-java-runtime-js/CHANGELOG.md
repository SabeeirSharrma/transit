# @sabeeirsharrma/java-runtime

## 2.6.0

### Minor Changes

- Performance: removed JSON.parse from Python and Java bridge callFunction hot paths, added fnNameCache for zero-allocation function name encoding, replaced Buffer.alloc with Buffer.allocUnsafe, inlined buffer reads for faster response decoding, changed response handlers to use subarray views instead of Buffer.from copies, added env passthrough for Python bridge, and made Python server write_lock conditional for single-client connections.

## 2.5.0

### Minor Changes

- Patch 2.5.0: Critical fixes for Java runtime bridge and server

### Patch Changes

- Fixed SIGKILL never firing — saved process reference before nulling in `stop()`
- Fixed `start()` permanently bricking instance on failure — cleared `readyPromise` on error
- Added `stopping` flag to prevent spurious restarts after `stop()`
- Fixed `error` and `exit` handlers to check `stopping` flag before calling `maybeRestart()`
- Fixed `require()` in `findAvailableClasses` — replaced with imported `readdirSync`, `statSync`, `join`
- Added `readdirSync` and `statSync` to imports
- Added `@sabeeirsharrma/java-runtime-sources` dependency for auto-copy
- Updated dependencies
  - @sabeeirsharrma/java-runtime-sources@2.5.0
  - @sabeeirsharrma/schema@2.5.0

## 2.4.0

### Minor Changes

- Fix request pipelining in python

### Patch Changes

- Updated dependencies
  - @sabeeirsharrma/schema@2.4.0

## 2.3.0

### Minor Changes

- Patch: Fix thread pool deadlock by processing CALL_REQUESTs inline in TransitServer

### Patch Changes

- Updated dependencies
  - @sabeeirsharrma/schema@2.3.0

## 2.2.0

### Minor Changes

- Fix python socket loop bug due to port mismatch with nodejs

### Patch Changes

- Updated dependencies
  - @sabeeirsharrma/schema@2.2.0

## 2.1.0

### Minor Changes

- implement socket connection pooling and concurrent request handling for improved performance

### Patch Changes

- Updated dependencies
  - @sabeeirsharrma/schema@2.1.0

## 2.0.1

### Patch Changes

- depend on @sabeeirsharrma/transit for the ACTUAL framework instead of a package with the same name
- Updated dependencies
  - @sabeeirsharrma/schema@2.0.1

## 2.0.0

### Major Changes

- Fix bugs and update docs

### Patch Changes

- Updated dependencies
  - @sabeeirsharrma/schema@2.0.0

## 1.0.2

### Patch Changes

- re: add READMEs
- 3640fb4: Just add a script to automatically add readme on publish
- Updated dependencies
- Updated dependencies [3640fb4]
  - @sabeeirsharrma/schema@1.0.2

## 1.0.1

### Patch Changes

- PATCH FOR INSTALL
- Updated dependencies
  - @sabeeirsharrma/schema@1.0.1

## 1.0.0

### Major Changes

- 298063f: Complete transit, mostly

### Patch Changes

- Updated dependencies [298063f]
  - @sabeeirsharrma/schema@1.0.0
