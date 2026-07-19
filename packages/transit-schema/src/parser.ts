/**
 * @sabeeirsharrma/schema — IDL Parser
 *
 * Parses Transit IDL schema files (.schema) into TransitSchema objects.
 * The IDL is intentionally simple — indentation-based, no semicolons,
 * readable by humans and machines alike.
 */

import type {
  TransitSchema,
  SchemaDefinition,
  SchemaType,
  SchemaField,
  SchemaEnum,
  SchemaService,
  SchemaFunction,
  SchemaFunctionParam,
  LanguageTarget,
} from "./types.js";

// ─── Token Types ──────────────────────────────────────────────────────────────

type TokenType =
  | "IDENT"
  | "STRING"
  | "COLON"
  | "ARROW"
  | "COMMA"
  | "LBRACKET"
  | "RBRACKET"
  | "LPAREN"
  | "RPAREN"
  | "NEWLINE"
  | "INDENT"
  | "DEDENT"
  | "EOF";

interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
}

// ─── Lexer ────────────────────────────────────────────────────────────────────

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const lines = source.split("\n");
  let lineNum = 0;

  for (const line of lines) {
    lineNum++;
    // Skip empty lines and pure comment lines
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      tokens.push({ type: "NEWLINE", value: "", line: lineNum, col: 1 });
      continue;
    }

    // Track indentation (2-space based)
    const indent = line.length - line.trimStart().length;
    if (indent > 0 && tokens.length > 0) {
      const last = tokens[tokens.length - 1];
      if (last.type === "NEWLINE") {
        tokens.push({ type: "INDENT", value: String(indent), line: lineNum, col: 1 });
      }
    }

    // Tokenize the rest of the line
    let col = indent + 1;
    const rest = trimmed;

    // Strip inline comments
    const commentIdx = rest.indexOf("#");
    const content = commentIdx >= 0 ? rest.slice(0, commentIdx).trim() : rest;

    let i = 0;
    while (i < content.length) {
      const ch = content[i];

      if (ch === " " || ch === "\t") {
        i++;
        col++;
        continue;
      }

      if (ch === ":") {
        tokens.push({ type: "COLON", value: ":", line: lineNum, col });
        i++;
        col++;
        continue;
      }

      if (ch === "-" && content[i + 1] === ">") {
        tokens.push({ type: "ARROW", value: "->", line: lineNum, col });
        i += 2;
        col += 2;
        continue;
      }

      if (ch === ",") {
        tokens.push({ type: "COMMA", value: ",", line: lineNum, col });
        i++;
        col++;
        continue;
      }

      if (ch === "[") {
        tokens.push({ type: "LBRACKET", value: "[", line: lineNum, col });
        i++;
        col++;
        continue;
      }

      if (ch === "]") {
        tokens.push({ type: "RBRACKET", value: "]", line: lineNum, col });
        i++;
        col++;
        continue;
      }

      if (ch === "(") {
        tokens.push({ type: "LPAREN", value: "(", line: lineNum, col });
        i++;
        col++;
        continue;
      }

      if (ch === ")") {
        tokens.push({ type: "RPAREN", value: ")", line: lineNum, col });
        i++;
        col++;
        continue;
      }

      // Quoted string
      if (ch === '"') {
        let str = "";
        i++;
        col++;
        while (i < content.length && content[i] !== '"') {
          str += content[i];
          i++;
          col++;
        }
        if (i < content.length) {
          i++; // skip closing quote
          col++;
        }
        tokens.push({ type: "STRING", value: str, line: lineNum, col });
        continue;
      }

      // Identifiers (including dotted names like "Result[FileJob, Error]")
      if (/[a-zA-Z0-9_.*]/.test(ch)) {
        let ident = "";
        while (i < content.length && /[a-zA-Z0-9_.*\[\], ]/.test(content[i])) {
          ident += content[i];
          i++;
          col++;
        }
        tokens.push({ type: "IDENT", value: ident.trim(), line: lineNum, col });
        continue;
      }

      // Skip unknown characters
      i++;
      col++;
    }

    tokens.push({ type: "NEWLINE", value: "", line: lineNum, col });
  }

  tokens.push({ type: "EOF", value: "", line: lineNum, col: 0 });
  return tokens;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.pos] ?? { type: "EOF", value: "", line: 0, col: 0 };
  }

  private advance(): Token {
    const tok = this.tokens[this.pos];
    this.pos++;
    return tok;
  }

  private expect(type: TokenType): Token {
    const tok = this.peek();
    if (tok.type !== type) {
      throw new Error(
        `Parse error at line ${tok.line}:${tok.col}: expected ${type}, got ${tok.type} ("${tok.value}")`
      );
    }
    return this.advance();
  }

  private skipNewlines(): void {
    while (this.peek().type === "NEWLINE" || this.peek().type === "INDENT" || this.peek().type === "DEDENT") {
      this.advance();
    }
  }

  parse(): TransitSchema {
    const schema: TransitSchema = { types: [], services: [] };

    while (this.peek().type !== "EOF") {
      this.skipNewlines();
      if (this.peek().type === "EOF") break;

      const keyword = this.peek();
      if (keyword.type !== "IDENT") {
        throw new Error(`Parse error at line ${keyword.line}:${keyword.col}: expected keyword, got ${keyword.type}`);
      }

      if (keyword.value === "type") {
        schema.types.push(this.parseType());
      } else if (keyword.value === "enum") {
        schema.types.push(this.parseEnum());
      } else if (keyword.value === "service") {
        schema.services.push(this.parseService());
      } else {
        throw new Error(`Parse error at line ${keyword.line}:${keyword.col}: unknown keyword "${keyword.value}"`);
      }

      this.skipNewlines();
    }

    return schema;
  }

  private parseType(): SchemaType {
    this.expect("IDENT"); // "type"
    const name = this.expect("IDENT").value;
    this.expect("COLON");
    this.expect("NEWLINE");
    this.expect("INDENT");

    const fields: SchemaField[] = [];
    while (this.peek().type === "IDENT" && this.peek().value !== "service" && this.peek().value !== "type" && this.peek().value !== "enum") {
      const fieldName = this.expect("IDENT").value;
      this.expect("COLON");
      const fieldType = this.expect("IDENT").value;
      const optional = fieldType.endsWith("?");
      fields.push({
        name: fieldName,
        type: optional ? fieldType.slice(0, -1) : fieldType,
        optional,
      });
      this.expect("NEWLINE");
      this.skipNewlines();
    }

    this.expect("DEDENT");
    return { kind: "type", name, fields };
  }

  private parseEnum(): SchemaEnum {
    this.expect("IDENT"); // "enum"
    const name = this.expect("IDENT").value;
    this.expect("COLON");
    this.expect("NEWLINE");
    this.expect("INDENT");

    const variants: string[] = [];
    while (this.peek().type === "IDENT" && this.peek().value !== "service" && this.peek().value !== "type" && this.peek().value !== "enum") {
      variants.push(this.expect("IDENT").value);
      this.expect("NEWLINE");
      this.skipNewlines();
    }

    this.expect("DEDENT");
    return { kind: "enum", name, variants };
  }

  private parseService(): SchemaService {
    this.expect("IDENT"); // "service"
    const name = this.expect("IDENT").value;

    // Parse optional (target: lang) annotation
    let target: LanguageTarget = "rust";
    if (this.peek().type === "LPAREN") {
      this.advance(); // (
      const key = this.expect("IDENT").value;
      if (key !== "target") throw new Error(`Expected "target", got "${key}"`);
      this.expect("COLON");
      target = this.expect("IDENT").value as LanguageTarget;
      this.expect("RPAREN");
    }

    this.expect("COLON");
    this.expect("NEWLINE");
    this.expect("INDENT");

    const functions: SchemaFunction[] = [];
    while (this.peek().type === "IDENT" && this.peek().value !== "service" && this.peek().value !== "type" && this.peek().value !== "enum") {
      functions.push(this.parseFunction());
      this.skipNewlines();
    }

    this.expect("DEDENT");
    return { kind: "service", name, target, functions };
  }

  private parseFunction(): SchemaFunction {
    this.expect("IDENT"); // "func"
    const name = this.expect("IDENT").value;

    // Params
    this.expect("LPAREN");
    const params: SchemaFunctionParam[] = [];
    if (this.peek().type !== "RPAREN") {
      const paramName = this.expect("IDENT").value;
      this.expect("COLON");
      const paramType = this.expect("IDENT").value;
      params.push({ name: paramName, type: paramType });

      while (this.peek().type === "COMMA") {
        this.advance(); // ,
        const pName = this.expect("IDENT").value;
        this.expect("COLON");
        const pType = this.expect("IDENT").value;
        params.push({ name: pName, type: pType });
      }
    }
    this.expect("RPAREN");

    // Return type
    this.expect("ARROW");
    const returnType = this.expect("IDENT").value;

    this.expect("NEWLINE");
    return { name, params, returnType };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a Transit IDL schema source string into a TransitSchema.
 */
export function parseSchema(source: string): TransitSchema {
  const tokens = tokenize(source);
  const parser = new Parser(tokens);
  return parser.parse();
}

/**
 * Parse a Transit IDL schema file.
 */
export async function parseSchemaFile(path: string): Promise<TransitSchema> {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(path, "utf-8");
  return parseSchema(source);
}
