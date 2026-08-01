/**
 * @sabeeirsharrma/schema — Config loader
 *
 * Reads, validates, and normalizes transit.config.json.
 * All functions are pure — no side effects, no file watchers.
 */

import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import type { TransitConfig, BuildOverride, LinkOverride } from "./types.js";

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_BUILD: Record<string, BuildOverride> = {
  rust: {
    command: "cargo build --release",
    features: [],
  },
  java: {
    jvmArgs: ["-Xmx512m"],
  },
  python: {
    interpreter: "python3",
    env: {},
  },
};

const DEFAULT_LINKS: Record<string, LinkOverride> = {
  "js-rust": { transport: "native" },
  "js-java": { transport: "socket" },
  "js-python": { transport: "socket" },
  "rust-java": { transport: "socket" },
};

// ─── Validation ──────────────────────────────────────────────────────────────

class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateBuildOverride(
  key: string,
  value: unknown
): BuildOverride {
  if (!isRecord(value)) {
    throw new ConfigError(
      `transit.config.json → build.${key}: expected an object, got ${typeof value}`
    );
  }

  const override: BuildOverride = {};

  if (value.command !== undefined) {
    if (typeof value.command !== "string") {
      throw new ConfigError(
        `transit.config.json → build.${key}.command: expected a string, got ${typeof value.command}`
      );
    }
    override.command = value.command;
  }

  if (value.features !== undefined) {
    if (!Array.isArray(value.features)) {
      throw new ConfigError(
        `transit.config.json → build.${key}.features: expected an array, got ${typeof value.features}`
      );
    }
    override.features = value.features.map((f: unknown) => {
      if (typeof f !== "string") {
        throw new ConfigError(
          `transit.config.json → build.${key}.features: each feature must be a string`
        );
      }
      return f;
    });
  }

  if (value.interpreter !== undefined) {
    if (typeof value.interpreter !== "string") {
      throw new ConfigError(
        `transit.config.json → build.${key}.interpreter: expected a string, got ${typeof value.interpreter}`
      );
    }
    override.interpreter = value.interpreter;
  }

  if (value.env !== undefined) {
    if (!isRecord(value.env)) {
      throw new ConfigError(
        `transit.config.json → build.${key}.env: expected an object, got ${typeof value.env}`
      );
    }
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(value.env)) {
      if (typeof v !== "string") {
        throw new ConfigError(
          `transit.config.json → build.${key}.env.${k}: expected a string, got ${typeof v}`
        );
      }
      env[k] = v;
    }
    override.env = env;
  }

  if (value.jvmArgs !== undefined) {
    if (!Array.isArray(value.jvmArgs)) {
      throw new ConfigError(
        `transit.config.json → build.${key}.jvmArgs: expected an array, got ${typeof value.jvmArgs}`
      );
    }
    override.jvmArgs = value.jvmArgs.map((a: unknown) => {
      if (typeof a !== "string") {
        throw new ConfigError(
          `transit.config.json → build.${key}.jvmArgs: each arg must be a string`
        );
      }
      return a;
    });
  }

  if (value.fastJson !== undefined) {
    if (typeof value.fastJson !== "boolean") {
      throw new ConfigError(
        `transit.config.json → build.${key}.fastJson: expected a boolean, got ${typeof value.fastJson}`
      );
    }
    override.fastJson = value.fastJson;
  }

  return override;
}

function validateLinkOverride(key: string, value: unknown): LinkOverride {
  if (!isRecord(value)) {
    throw new ConfigError(
      `transit.config.json → links.${key}: expected an object, got ${typeof value}`
    );
  }

  const transport = value.transport;
  if (transport !== "native" && transport !== "socket" && transport !== "jni") {
    throw new ConfigError(
      `transit.config.json → links.${key}.transport: expected "native" | "socket" | "jni", got "${transport}"`
    );
  }

  const override: LinkOverride = { transport };

  if (value.socketPath !== undefined) {
    if (typeof value.socketPath !== "string") {
      throw new ConfigError(
        `transit.config.json → links.${key}.socketPath: expected a string, got ${typeof value.socketPath}`
      );
    }
    override.socketPath = value.socketPath;
  }

  return override;
}

function validateExportOverride(index: number, value: unknown): {
  file: string;
  function: string;
} {
  if (!isRecord(value)) {
    throw new ConfigError(
      `transit.config.json → exports[${index}]: expected an object, got ${typeof value}`
    );
  }

  if (typeof value.file !== "string") {
    throw new ConfigError(
      `transit.config.json → exports[${index}].file: expected a string, got ${typeof value.file}`
    );
  }

  if (typeof value.function !== "string") {
    throw new ConfigError(
      `transit.config.json → exports[${index}].function: expected a string, got ${typeof value.function}`
    );
  }

  return { file: value.file, function: value.function };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Load transit.config.json from the given directory.
 * Returns null if no config file exists (not an error — defaults apply).
 *
 * @param dir - Project root directory to search in
 * @returns The raw parsed JSON, or null if not found
 */
export function loadConfigRaw(dir: string): Record<string, unknown> | null {
  const configPath = join(dir, "transit.config.json");

  if (!existsSync(configPath)) {
    return null;
  }

  let content: string;
  try {
    content = readFileSync(configPath, "utf-8");
  } catch (err) {
    throw new ConfigError(
      `Failed to read transit.config.json: ${(err as Error).message}`
    );
  }

  try {
    return JSON.parse(content);
  } catch (err) {
    throw new ConfigError(
      `transit.config.json is not valid JSON: ${(err as Error).message}`
    );
  }
}

/**
 * Validate a raw JSON object against the TransitConfig schema.
 * Throws ConfigError with a human-readable message on invalid input.
 *
 * @param raw - The parsed JSON object
 * @returns A validated TransitConfig
 */
export function validateConfig(raw: Record<string, unknown>): TransitConfig {
  const config: TransitConfig = {};

  // Validate build overrides
  if (raw.build !== undefined) {
    if (!isRecord(raw.build)) {
      throw new ConfigError(
        `transit.config.json → build: expected an object, got ${typeof raw.build}`
      );
    }
    config.build = {};
    for (const [key, value] of Object.entries(raw.build)) {
      config.build[key] = validateBuildOverride(key, value);
    }
  }

  // Validate link overrides
  if (raw.links !== undefined) {
    if (!isRecord(raw.links)) {
      throw new ConfigError(
        `transit.config.json → links: expected an object, got ${typeof raw.links}`
      );
    }
    config.links = {};
    for (const [key, value] of Object.entries(raw.links)) {
      config.links[key] = validateLinkOverride(key, value);
    }
  }

  // Validate export overrides
  if (raw.exports !== undefined) {
    if (!Array.isArray(raw.exports)) {
      throw new ConfigError(
        `transit.config.json → exports: expected an array, got ${typeof raw.exports}`
      );
    }
    config.exports = raw.exports.map((v, i) => validateExportOverride(i, v));
  }

  // Validate maxRestarts
  if (raw.maxRestarts !== undefined) {
    if (typeof raw.maxRestarts !== "number" || raw.maxRestarts < 0) {
      throw new ConfigError(
        `transit.config.json → maxRestarts: expected a non-negative number, got ${typeof raw.maxRestarts}`
      );
    }
    config.maxRestarts = raw.maxRestarts;
  }

  // Reject unknown top-level keys
  const knownKeys = new Set(["build", "links", "exports", "maxRestarts"]);
  for (const key of Object.keys(raw)) {
    if (!knownKeys.has(key)) {
      throw new ConfigError(
        `transit.config.json → unknown key "${key}". Valid keys: build, links, exports, maxRestarts`
      );
    }
  }

  return config;
}

/**
 * Fill in Transit defaults for any missing config fields.
 * Does not overwrite explicitly set values.
 *
 * @param config - A validated TransitConfig (may have missing fields)
 * @returns A complete TransitConfig with all defaults applied
 */
export function mergeWithDefaults(config: TransitConfig): Required<TransitConfig> {
  const build: Record<string, BuildOverride> = {};

  // Start with language defaults
  for (const [lang, defaults] of Object.entries(DEFAULT_BUILD)) {
    build[lang] = { ...defaults };
  }

  // Overlay user config
  if (config.build) {
    for (const [lang, override] of Object.entries(config.build)) {
      if (build[lang]) {
        build[lang] = { ...build[lang], ...override };
      } else {
        build[lang] = { ...override };
      }
    }
  }

  const links: Record<string, LinkOverride> = {};

  // Start with link defaults
  for (const [pair, defaults] of Object.entries(DEFAULT_LINKS)) {
    links[pair] = { ...defaults };
  }

  // Overlay user config
  if (config.links) {
    for (const [pair, override] of Object.entries(config.links)) {
      links[pair] = { ...override };
    }
  }

  return {
    build,
    links,
    exports: config.exports ?? [],
    maxRestarts: config.maxRestarts ?? 3,
  };
}

/**
 * Load, validate, and normalize transit.config.json from a directory.
 * Returns a complete config with all defaults applied.
 * Returns null if no config file exists.
 *
 * @param dir - Project root directory
 * @returns A complete TransitConfig, or null if no config file exists
 */
export function loadConfig(dir: string): Required<TransitConfig> | null {
  const raw = loadConfigRaw(dir);
  if (raw === null) {
    return null;
  }
  const validated = validateConfig(raw);
  return mergeWithDefaults(validated);
}

/**
 * Load config or return defaults if no config file exists.
 * This is the main entry point for most consumers.
 *
 * @param dir - Project root directory
 * @returns A complete TransitConfig, always with all fields populated
 */
export function loadConfigWithDefaults(
  dir: string
): Required<TransitConfig> {
  return loadConfig(dir) ?? mergeWithDefaults({});
}
