# @sabeeirsharrma/schema

## 3.0.0

### Major Changes

- Add C/C++ support, make python faster

## 2.5.0

### Minor Changes

- Patch 2.5.0: Added config validation tests and maxRestarts support

### Patch Changes

- Added `maxRestarts` to valid config keys in schema validation
- Added comprehensive config validation test suite (28 tests)

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
