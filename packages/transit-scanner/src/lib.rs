extern crate napi_derive;

use napi_derive::napi;
use std::path::{Path, PathBuf};
use tree_sitter::{Language, Parser, Query, QueryCursor};

// ─── Language grammars ────────────────────────────────────────────────────────

fn rust_lang() -> Language {
    tree_sitter_rust::LANGUAGE.into()
}

fn js_lang() -> Language {
    tree_sitter_javascript::LANGUAGE.into()
}

fn python_lang() -> Language {
    tree_sitter_python::LANGUAGE.into()
}

fn java_lang() -> Language {
    tree_sitter_java::LANGUAGE.into()
}

fn language_for_file(path: &Path) -> Option<Language> {
    match path.extension()?.to_str()? {
        "rs" => Some(rust_lang()),
        "js" | "ts" | "mjs" | "mts" => Some(js_lang()),
        "py" => Some(python_lang()),
        "java" => Some(java_lang()),
        _ => None,
    }
}

fn language_name_for_file(path: &Path) -> Option<&'static str> {
    match path.extension()?.to_str()? {
        "rs" => Some("rust"),
        "js" | "ts" | "mjs" | "mts" => Some("javascript"),
        "py" => Some("python"),
        "java" => Some("java"),
        _ => None,
    }
}

// ─── Manifest types (plain structs, no NAPI derive) ──────────────────────────

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ManifestEntry {
    pub language: String,
    pub source_file: String,
    pub function_name: String,
    pub signature: String,
    pub export_tier: u8,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Manifest {
    pub entries: Vec<ManifestEntry>,
    pub generated_at: u64,
}

// ─── Tree-sitter queries ──────────────────────────────────────────────────────

fn js_function_query() -> &'static str {
    "(export_statement
        declaration: (function_declaration
            name: (identifier) @name
            parameters: (formal_parameters) @params
        )
    )"
}

fn python_function_query() -> &'static str {
    "(function_definition
        name: (identifier) @name
        parameters: (parameters) @params
    )"
}

fn java_function_query() -> &'static str {
    "(method_declaration
        name: (identifier) @name
        parameters: (formal_parameters) @params
        type: (_) @ret
    )"
}

// ─── Comment marker detection ─────────────────────────────────────────────────

fn has_transit_function_marker(source: &[u8], node: tree_sitter::Node) -> bool {
    let start_byte = node.start_byte();
    if start_byte == 0 {
        return false;
    }
    let region = &source[..start_byte];
    if let Some(last_nl) = region.iter().rposition(|&b| b == b'\n') {
        let prev_line = &region[..last_nl];
        if let Some(prev_prev_nl) = prev_line.iter().rposition(|&b| b == b'\n') {
            let line = &region[prev_prev_nl + 1..last_nl];
            let line_str = std::str::from_utf8(line).unwrap_or("");
            return line_str.trim().contains("transit:function");
        } else {
            let line = &region[..last_nl];
            let line_str = std::str::from_utf8(line).unwrap_or("");
            return line_str.trim().contains("transit:function");
        }
    }
    false
}

fn has_transit_file_marker(source: &[u8]) -> bool {
    let first_line_end = source.iter().position(|&b| b == b'\n').unwrap_or(source.len());
    let first_line = std::str::from_utf8(&source[..first_line_end]).unwrap_or("");
    first_line.trim().contains("transit:file")
}

// ─── Signature extraction ─────────────────────────────────────────────────────

fn extract_signature(source: &[u8], node: tree_sitter::Node) -> String {
    let start = node.start_byte();
    let end = node.end_byte();
    let text = std::str::from_utf8(&source[start..end]).unwrap_or("");
    if let Some(brace_pos) = text.find('{') {
        text[..brace_pos].trim().to_string()
    } else {
        text.trim().to_string()
    }
}

// ─── Core scanning logic ──────────────────────────────────────────────────────

fn scan_file(path: &Path, source: &[u8]) -> Vec<ManifestEntry> {
    let mut entries = Vec::new();
    let lang = match language_for_file(path) {
        Some(l) => l,
        None => return entries,
    };
    let lang_name = match language_name_for_file(path) {
        Some(n) => n,
        None => return entries,
    };

    let mut parser = Parser::new();
    if parser.set_language(&lang).is_err() {
        return entries;
    }

    let tree = match parser.parse(source, None) {
        Some(t) => t,
        None => return entries,
    };

    let file_has_transit_file_marker = has_transit_file_marker(source);

    // For Rust, detect pub functions via source text
    if lang_name == "rust" {
        let source_str = std::str::from_utf8(source).unwrap_or("");
        for line in source_str.lines() {
            let trimmed = line.trim();
            if trimmed.contains("pub fn ") || trimmed.contains("pub async fn ") {
                // Extract function name
                if let Some(fn_start) = trimmed.find("fn ") {
                    let after_fn = &trimmed[fn_start + 3..];
                    if let Some(paren_pos) = after_fn.find('(') {
                        let fn_name = after_fn[..paren_pos].trim();
                        let signature = trimmed.trim_end_matches('{').trim().to_string();
                        entries.push(ManifestEntry {
                            language: lang_name.to_string(),
                            source_file: path.to_string_lossy().to_string(),
                            function_name: fn_name.to_string(),
                            signature,
                            export_tier: 1,
                        });
                    }
                }
            }
        }
        return entries;
    }

    // For Java, use text-based detection (more reliable than tree-sitter queries across versions)
    if lang_name == "java" {
        let source_str = std::str::from_utf8(source).unwrap_or("");
        for line in source_str.lines() {
            let trimmed = line.trim();
            // Match: public String methodName( ... ) or public void methodName( ... )
            // Also match: public static ... methodName( ... )
            if trimmed.starts_with("public ") && trimmed.contains('(') {
                // Extract method name: find the identifier before '('
                if let Some(paren_pos) = trimmed.find('(') {
                    let before_paren = &trimmed[..paren_pos];
                    // Find the last word before '(' — that's the method name
                    let words: Vec<&str> = before_paren.split_whitespace().collect();
                    if let Some(method_name) = words.last() {
                        // Skip constructors (method name == class name) and common keywords
                        if *method_name != "class"
                            && *method_name != "static"
                            && *method_name != "void"
                            && *method_name != "String"
                            && *method_name != "int"
                            && *method_name != "boolean"
                            && !method_name.starts_with('@')
                        {
                            let signature = trimmed.trim_end_matches('{').trim().to_string();
                            entries.push(ManifestEntry {
                                language: lang_name.to_string(),
                                source_file: path.to_string_lossy().to_string(),
                                function_name: method_name.to_string(),
                                signature,
                                export_tier: 1,
                            });
                        }
                    }
                }
            }
        }
        return entries;
    }

    // For other languages, use tree-sitter
    let query_str = match lang_name {
        "javascript" => js_function_query(),
        "python" => python_function_query(),
        "java" => java_function_query(),
        _ => return entries,
    };

    let query = match Query::new(&lang, query_str) {
        Ok(q) => q,
        Err(_) => return entries,
    };

    let mut cursor = QueryCursor::new();
    let matches = cursor.matches(&query, tree.root_node(), source);

    for mat in matches {
        let mut name = "";
        let mut is_natively_public = false;

        for cap in mat.captures {
            match cap.node.kind() {
                "identifier" if name.is_empty() => {
                    name = std::str::from_utf8(&source[cap.node.start_byte()..cap.node.end_byte()]).unwrap_or("");
                }
                "modifiers" => {
                    let mods = std::str::from_utf8(&source[cap.node.start_byte()..cap.node.end_byte()]).unwrap_or("");
                    if mods.contains("public") {
                        is_natively_public = true;
                    }
                }
                _ => {}
            }
        }

        if name.is_empty() {
            continue;
        }

        // Skip Python private functions
        if lang_name == "python" && name.starts_with('_') {
            continue;
        }

        // Determine export tier
        let func_node = mat.captures.first().map(|c| c.node).unwrap();
        let export_tier = if has_transit_function_marker(source, func_node) {
            3
        } else if file_has_transit_file_marker {
            2
        } else if lang_name == "javascript" || is_natively_public {
            1 // natively public
        } else {
            continue // not exported
        };

        let signature = extract_signature(source, func_node);

        entries.push(ManifestEntry {
            language: lang_name.to_string(),
            source_file: path.to_string_lossy().to_string(),
            function_name: name.to_string(),
            signature,
            export_tier,
        });
    }

    entries
}

// ─── Directory walking ────────────────────────────────────────────────────────

fn should_skip_dir(name: &str) -> bool {
    matches!(
        name,
        "node_modules" | "target" | "__pycache__" | ".git" | "dist" | "build" | ".next" | "vendor"
    )
}

fn walk_and_scan(root: &Path) -> Vec<ManifestEntry> {
    let mut entries = Vec::new();
    let walker = ignore::WalkBuilder::new(root)
        .hidden(false)
        .build();

    for result in walker {
        let entry = match result {
            Ok(e) => e,
            Err(_) => continue,
        };

        if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
            let dir_name = entry.file_name().to_string_lossy();
            if should_skip_dir(&dir_name) {
                continue;
            }
            continue;
        }

        let path = entry.path();
        if path.extension().is_none() {
            continue;
        }

        let source = match std::fs::read(path) {
            Ok(s) => s,
            Err(_) => continue,
        };

        let mut file_entries = scan_file(path, &source);
        entries.append(&mut file_entries);
    }

    entries
}

// ─── NAPI exports ─────────────────────────────────────────────────────────────

/// Scan a directory and return a JSON manifest string.
#[napi]
pub fn scan_directory(root: String) -> String {
    let root_path = PathBuf::from(&root);
    let entries = walk_and_scan(&root_path);

    let manifest = Manifest {
        entries,
        generated_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64,
    };

    serde_json::to_string(&manifest).unwrap_or_else(|_| "{}".to_string())
}

/// Get the Transit scanner version.
#[napi]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
