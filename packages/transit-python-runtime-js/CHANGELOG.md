# @sabeeirsharrma/python-runtime

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
