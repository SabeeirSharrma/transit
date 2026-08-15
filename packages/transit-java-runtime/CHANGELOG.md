# @sabeeirsharrma/java-runtime-sources

## 3.0.0

### Major Changes

- Add C/C++ support, make python faster

## 2.5.0

### Minor Changes

- Patch 2.5.0: Fixed health ping write lock in TransitServer

### Patch Changes

- Fixed `handleHealthPing` to acquire `writeLock` before writing — prevents interleaved responses with concurrent `handleCall` writes
