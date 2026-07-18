// Type declarations for @transit/scanner (Rust native addon)
// These will be replaced by generated types once the Rust package is built.

export interface ManifestEntry {
  language: string;
  sourceFile: string;
  functionName: string;
  signature: string;
  exportTier: 1 | 2 | 3;
}

export interface Manifest {
  entries: ManifestEntry[];
  generatedAt: number;
}

export declare function scanDirectory(root: string): string;
export declare function scanFilePath(filePath: string): string;
export declare function invalidateCache(root: string, filePath: string): void;
export declare function clearCache(root: string): void;
export declare function version(): string;
