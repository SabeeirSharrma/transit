# transit-cli

## 2.5.0

### Minor Changes

- Patch 2.5.0: Added runtime file copying to `transit init`

### Patch Changes

- `transit init` now copies runtime files to detected language directories (Java .java files, Python transit_server.py)
- Added workspace package detection for monorepo support
- Updated dependencies
  - @sabeeirsharrma/scanner@2.5.0
  - @sabeeirsharrma/schema@2.5.0
  - @sabeeirsharrma/transit@2.5.0
  - @sabeeirsharrma/codegen@2.5.0

## 2.4.0

### Minor Changes

- Fix request pipelining in python

### Patch Changes

- Updated dependencies
  - @sabeeirsharrma/codegen@2.4.0
  - @sabeeirsharrma/transit@2.4.0
  - @sabeeirsharrma/scanner@2.4.0
  - @sabeeirsharrma/schema@2.4.0

## 2.3.0

### Minor Changes

- Patch: Fix thread pool deadlock by processing CALL_REQUESTs inline in TransitServer

### Patch Changes

- Updated dependencies
  - @sabeeirsharrma/codegen@2.3.0
  - @sabeeirsharrma/transit@2.3.0
  - @sabeeirsharrma/scanner@2.3.0
  - @sabeeirsharrma/schema@2.3.0

## 2.2.0

### Minor Changes

- Fix python socket loop bug due to port mismatch with nodejs

### Patch Changes

- Updated dependencies
  - @sabeeirsharrma/codegen@2.2.0
  - @sabeeirsharrma/transit@2.2.0
  - @sabeeirsharrma/scanner@2.2.0
  - @sabeeirsharrma/schema@2.2.0

## 2.1.0

### Minor Changes

- implement socket connection pooling and concurrent request handling for improved performance

### Patch Changes

- Updated dependencies
  - @sabeeirsharrma/codegen@2.1.0
  - @sabeeirsharrma/transit@2.1.0
  - @sabeeirsharrma/scanner@2.1.0
  - @sabeeirsharrma/schema@2.1.0

## 2.0.1

### Patch Changes

- depend on @sabeeirsharrma/transit for the ACTUAL framework instead of a package with the same name
- Updated dependencies
  - @sabeeirsharrma/codegen@2.0.1
  - @sabeeirsharrma/transit@2.0.1
  - @sabeeirsharrma/scanner@2.0.1
  - @sabeeirsharrma/schema@2.0.1

## 2.0.0

### Major Changes

- Fix bugs and update docs

### Patch Changes

- Updated dependencies
  - @sabeeirsharrma/scanner@2.0.0
  - transit@2.0.0
  - @sabeeirsharrma/codegen@2.0.0
  - @sabeeirsharrma/schema@2.0.0

## 1.0.2

### Patch Changes

- re: add READMEs
- 3640fb4: Just add a script to automatically add readme on publish
- Updated dependencies
- Updated dependencies [3640fb4]
  - @sabeeirsharrma/codegen@1.0.2
  - transit@1.0.2
  - @sabeeirsharrma/scanner@1.0.2
  - @sabeeirsharrma/schema@1.0.2

## 1.0.1

### Patch Changes

- PATCH FOR INSTALL
- Updated dependencies
  - @sabeeirsharrma/codegen@1.0.1
  - transit@1.0.1
  - @sabeeirsharrma/scanner@1.0.1
  - @sabeeirsharrma/schema@1.0.1

## 1.0.0

### Major Changes

- 298063f: Complete transit, mostly

### Patch Changes

- Updated dependencies [298063f]
  - @sabeeirsharrma/scanner@1.0.0
  - @sabeeirsharrma/codegen@1.0.0
  - transit@1.0.0
  - @sabeeirsharrma/schema@1.0.0
