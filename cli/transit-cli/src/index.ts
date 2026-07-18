#!/usr/bin/env node

/**
 * transit-cli — The Transit command-line interface
 *
 * Commands:
 *   transit init      Bootstrap a new Transit project
 *   transit dev       Start dev mode with live scanning
 *   transit build     Run codegen + compilation for all languages
 *   transit start     Run the production build
 */

const args = process.argv.slice(2);
const command = args[0];

// Parse flags
const flags = new Set(args.slice(1).filter((a) => a.startsWith("--")));
const hasFlag = (name: string) => flags.has(`--${name}`);

const HELP = `
transit — Languages that just talk to each other

Usage:
  transit <command> [options]

Commands:
  init      Bootstrap a new Transit project (detect languages, write config)
  dev       Start dev mode with live scanning and file watching
  build     Run codegen + compilation for all registered languages
  start     Run the production build

Options:
  --help        Show this message
  --verbose     Verbose output (per-file scan results)
  --dry-run     Init only: show what would be written without writing

Examples:
  transit init             # Detect languages and write transit.config.json
  transit dev              # Start watching for changes
  transit dev --verbose    # Show per-file scan results
`;

async function main() {
  if (!command || command === "--help" || command === "-h") {
    console.log(HELP);
    process.exit(0);
  }

  switch (command) {
    case "init": {
      const { init } = await import("./init.js");
      const result = await init({
        dryRun: hasFlag("dry-run"),
      });
      if (result.warnings.length > 0) {
        console.log("\n[transit] Next steps:");
        for (const w of result.warnings) {
          console.log(`  - ${w}`);
        }
      }
      break;
    }

    case "dev": {
      const { dev } = await import("./dev.js");
      await dev({
        verbose: hasFlag("verbose"),
      });
      // dev() keeps the process alive — no break needed
      break;
    }

    case "build": {
      console.log("[transit] Running build...");
      // TODO: Phase 5 — Load config, run scanner, codegen, compile
      console.log("[transit] Build not yet implemented.");
      console.log("[transit] Use `transit dev` for development mode.");
      break;
    }

    case "start": {
      console.log("[transit] Starting production mode...");
      // TODO: Phase 5 — Load built artifacts and start
      console.log("[transit] Start not yet implemented.");
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
