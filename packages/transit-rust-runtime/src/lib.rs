/**
 * transit-rust-runtime — Native addon bridge for in-process Rust calls
 *
 * This crate compiles to a .node native addon that Node.js can load directly.
 * It provides the bridge between Rust types and JS/N-API types.
 */

use napi::bindgen_prelude::*;
use napi_derive::napi;

// ─── Exported functions ───────────────────────────────────────────────────────

/// Get the Transit runtime version.
#[napi]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Register a Rust function to be callable from JS.
///
/// In build mode, codegen generates calls to this.
#[napi]
pub fn register_function(name: String) -> Result<()> {
    eprintln!("[transit-rust-runtime] register_function: {}", name);
    Ok(())
}
