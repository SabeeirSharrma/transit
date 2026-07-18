#!/usr/bin/env node

/**
 * transit-cli — The Transit command-line interface
 *
 * Commands:
 *   transit dev       Start dev mode with live scanning
 *   transit build     Run codegen + compilation for all languages
 *   transit start     Run the production build
 */

import { resolve } from "node:path";

const args = process.argv.slice(2);
const command = args[0];

const HELP = `
transit — Languages that just talk to each other

Usage:
  transit <command>

Commands:
  dev       Start dev mode with live scanning
  build     Run codegen + compilation for all registered languages
  start     Run the production build
  init      Bootstrap a new Transit project

Options:
  --help    Show this message
`;

async function main() {
  if (!command || command === "--help" || command === "-h") {
    console.log(HELP);
    process.exit(0);
  }

  switch (command) {
    case "dev": {
      console.log("[transit] Starting dev mode...");
      const { transit } = await import("transit");
      // TODO: Load transit.config.json, scan directories, start watcher
      console.log("[transit] Dev mode ready. Watching for changes...");
      break;
    }

    case "build": {
      console.log("[transit] Running build...");
      // TODO: Load config, run scanner, codegen, compile
      console.log("[transit] Build complete.");
      break;
    }

    case "start": {
      console.log("[transit] Starting production mode...");
      // TODO: Load built artifacts and start
      break;
    }

    case "init": {
      console.log("[transit] Initializing project...");
      // TODO: Implement init flow (Section 9.5)
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("[transit] Fatal error:", err);
  process.exit(1);
});
