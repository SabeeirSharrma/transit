/**
 * @sabeeirsharrma/schema — Transit IDL type definitions and parser
 *
 * Defines the shared type system that all Transit packages consume.
 * The schema describes types and service functions that span language boundaries.
 */

// ─── Primitive Types ──────────────────────────────────────────────────────────

export type TransitPrimitive =
  | "string"
  | "int"
  | "float"
  | "bool"
  | "binary"
  | "void";

// ─── Schema Types ─────────────────────────────────────────────────────────────

export interface SchemaField {
  name: string;
  type: string; // primitive or user-defined type name
  optional?: boolean;
}

export interface SchemaType {
  kind: "type";
  name: string;
  fields: SchemaField[];
}

export interface SchemaEnum {
  kind: "enum";
  name: string;
  variants: string[];
}

export type SchemaDefinition = SchemaType | SchemaEnum;

// ─── Service Functions ────────────────────────────────────────────────────────

export type LanguageTarget = "rust" | "java" | "python" | "cpp";

export interface SchemaFunctionParam {
  name: string;
  type: string;
}

export interface SchemaFunction {
  name: string;
  params: SchemaFunctionParam[];
  returnType: string; // e.g. "Result[FileJob, Error]" or "void"
}

export interface SchemaService {
  kind: "service";
  name: string;
  target: LanguageTarget;
  functions: SchemaFunction[];
}

// ─── Schema Document ──────────────────────────────────────────────────────────

export interface TransitSchema {
  types: SchemaDefinition[];
  services: SchemaService[];
}

// ─── Manifest (Scanner Output) ────────────────────────────────────────────────

export type ExportTier = 1 | 2 | 3;

export interface ManifestEntry {
  language: string;
  sourceFile: string;
  functionName: string;
  signature: string;
  export_tier: ExportTier;
  /** Alias for exportTier (camelCase) */
  exportTier: ExportTier;
}

export interface Manifest {
  entries: ManifestEntry[];
  generatedAt: number;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface BuildOverride {
  command?: string;
  features?: string[];
  interpreter?: string;
  env?: Record<string, string>;
  jvmArgs?: string[];
}

export interface LinkOverride {
  transport: "native" | "socket" | "jni";
  socketPath?: string;
}

export interface ExportOverride {
  file: string;
  function: string;
}

export interface TransitConfig {
  build?: Record<string, BuildOverride>;
  links?: Record<string, LinkOverride>;
  exports?: ExportOverride[];
  /** Maximum restart attempts for resident processes (Java, Python). Default: 3 */
  maxRestarts?: number;
}
