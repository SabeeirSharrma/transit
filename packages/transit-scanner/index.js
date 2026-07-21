// Stub — the real implementation is the Rust native addon.
// This file exists so npm/bun can resolve the package in dev mode.
// In production, the compiled .so/.node file is loaded directly.

const { existsSync } = require("fs");
const { join } = require("path");
const { createRequire } = require("module");

let nativeAddon = null;

function loadNativeAddon() {
  if (nativeAddon) return nativeAddon;

  const candidates = [
    // napi-rs default output names
    join(__dirname, "transit-scanner.node"),
    join(__dirname, "index.node"),
    // Cargo build output (release)
    join(__dirname, "target/release/libtransit_scanner.node"),
    join(__dirname, "target/release/libtransit_scanner.so"),
    // Cargo build output (debug)
    join(__dirname, "target/debug/libtransit_scanner.node"),
    join(__dirname, "target/debug/libtransit_scanner.so"),
    // Bun cache symlink workaround
    join(__dirname, "transit_scanner.node"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      if (candidate.endsWith(".node")) {
        // Standard Node.js native addon loading
        nativeAddon = require(candidate);
        return nativeAddon;
      } else {
        // .so file — use process.dlopen
        const mod = { exports: {} };
        const binding = process.dlopen(mod, candidate);
        nativeAddon = mod.exports;
        return nativeAddon;
      }
    }
  }

  throw new Error(
    "@sabeeirsharrma/scanner: native addon not built.\n" +
    "To fix, run one of:\n" +
    "  cd packages/transit-scanner && cargo build --release\n" +
    "  cp target/release/libtransit_scanner.so index.node\n" +
    "Or if using napi-rs:\n" +
    "  napi build --release\n" +
    "Then ensure the .node file is in the scanner package directory."
  );
}

module.exports = {
  scanDirectory(root) {
    return loadNativeAddon().scanDirectory(root);
  },
  scanFilePath(filePath) {
    return loadNativeAddon().scanFilePath(filePath);
  },
  invalidateCache(root, filePath) {
    return loadNativeAddon().invalidateCache(root, filePath);
  },
  clearCache(root) {
    return loadNativeAddon().clearCache(root);
  },
  version() {
    return loadNativeAddon().version();
  },
};
