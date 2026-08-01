# @sabeeirsharrma/py-runtime

## 2.5.0

### Minor Changes

- Patch 2.5.0: Critical fixes for Python server protocol and thread safety

### Patch Changes

- Fixed health ping write lock — `_handle_health_ping` now acquires `write_lock` to prevent interleaved responses
- Fixed `None` payload crash — added check for client disconnect mid-payload
- Added early break on `None` payload to avoid confused reads on dead sockets

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
