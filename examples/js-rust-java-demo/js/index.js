/**
 * Example: JS calling Rust via Transit.
 *
 * Usage:
 *   node js/index.js
 *
 * This demonstrates the developer-facing API from Spec Section 9.
 */

import { transit } from "@sabeeirsharrma/transit";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Register the Rust codebase — this is the root index.js pattern
const rs = transit.rust(resolve(__dirname, "../rust"));

// In dev mode, this would scan the Rust directory for exported functions.
// For now, with the native addon loaded directly:

async function main() {
  console.log("Transit Demo — JS → Rust");
  console.log("========================\n");

  const job = {
    id: "job-001",
    bytes: new Uint8Array([72, 101, 108, 108, 111]), // "Hello"
    priority: 1,
  };

  try {
    // This looks like a normal function call, but Transit routes it
    // through the in-process native addon bridge
    const result = await rs.processGeneral(job);
    console.log("Result from Rust:", result);
  } catch (err) {
    console.error("Error calling Rust:", err instanceof Error ? err.message : String(err));
    console.log("\nMake sure to build the Rust addon first:");
    console.log("  cd rust && cargo build --release");
  }
}

main();
