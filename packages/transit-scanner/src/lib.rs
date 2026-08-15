extern crate napi_derive;

use napi_derive::napi;
use std::collections::HashMap;
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

fn c_lang() -> Language {
    tree_sitter_c::LANGUAGE.into()
}

fn cpp_lang() -> Language {
    tree_sitter_cpp::LANGUAGE.into()
}

fn language_for_file(path: &Path) -> Option<Language> {
    match path.extension()?.to_str()? {
        "rs" => Some(rust_lang()),
        "js" | "ts" | "mjs" | "mts" => Some(js_lang()),
        "py" => Some(python_lang()),
        "java" => Some(java_lang()),
        "c" | "h" | "hc" => Some(c_lang()),
        "cpp" | "cc" | "cxx" | "hpp" | "hxx" => Some(cpp_lang()),
        _ => None,
    }
}

fn language_name_for_file(path: &Path) -> Option<&'static str> {
    match path.extension()?.to_str()? {
        "rs" => Some("rust"),
        "js" | "ts" | "mjs" | "mts" => Some("javascript"),
        "py" => Some("python"),
        "java" => Some("java"),
        "c" | "h" | "hc" => Some("c"),
        "cpp" | "cc" | "cxx" | "hpp" | "hxx" => Some("cpp"),
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

// ─── Cache types ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct CacheEntry {
    mtime: u64, // seconds since epoch
    entries: Vec<ManifestEntry>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct Cache {
    scanner_version: String,
    files: HashMap<String, CacheEntry>,
}

impl Cache {
    fn new() -> Self {
        Self {
            scanner_version: env!("CARGO_PKG_VERSION").to_string(),
            files: HashMap::new(),
        }
    }

    fn is_valid(&self) -> bool {
        self.scanner_version == env!("CARGO_PKG_VERSION")
    }
}

fn get_mtime(path: &Path) -> u64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn cache_path(root: &Path) -> PathBuf {
    root.join(".transit-cache.json")
}

fn load_cache(root: &Path) -> Cache {
    let path = cache_path(root);
    match std::fs::read_to_string(&path) {
        Ok(content) => match serde_json::from_str::<Cache>(&content) {
            Ok(cache) if cache.is_valid() => cache,
            _ => Cache::new(),
        },
        Err(_) => Cache::new(),
    }
}

fn save_cache(root: &Path, cache: &Cache) {
    let path = cache_path(root);
    if let Ok(json) = serde_json::to_string_pretty(cache) {
        let _ = std::fs::write(path, json);
    }
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
    // Only match top-level functions (direct children of module), not methods inside classes
    "(module
        (function_definition
            name: (identifier) @name
            parameters: (parameters) @params
        )
    )"
}

fn python_method_query() -> &'static str {
    "(class_definition
        name: (identifier) @class_name
        body: (block
            (function_definition
                name: (identifier) @name
            ) @method
        )
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
    
    // Scan backward through lines, skipping blank lines, to find the comment
    let mut pos = region.len();
    while pos > 0 {
        // Find the previous newline
        if let Some(nl_pos) = region[..pos].iter().rposition(|&b| b == b'\n') {
            let line = &region[nl_pos + 1..pos];
            let line_str = std::str::from_utf8(line).unwrap_or("");
            let trimmed = line_str.trim();
            
            // If line is blank, skip it and continue scanning
            if trimmed.is_empty() {
                pos = nl_pos;
                continue;
            }
            
            // Check if this line has the marker
            return trimmed.contains("transit:function");
        } else {
            // No more newlines — check the remaining text
            let line_str = std::str::from_utf8(&region[..pos]).unwrap_or("");
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

    // For Python (function_definition ends with colon):
    // "def foo(self, x):\n    ..."
    if node.kind() == "function_definition" {
        // Check if this is Python (has "def " prefix)
        if text.starts_with("def ") {
            // Find the colon that ends the signature line
            if let Some(colon_pos) = text.find(":\n") {
                return text[..colon_pos].trim().to_string();
            }
            if let Some(colon_pos) = text.find(':') {
                return text[..colon_pos].trim().to_string();
            }
        }
        // For other languages, find opening brace
        if let Some(brace_pos) = text.find('{') {
            return text[..brace_pos].trim().to_string();
        }
    }

    if let Some(brace_pos) = text.find('{') {
        text[..brace_pos].trim().to_string()
    } else {
        text.trim().to_string()
    }
}

fn check_transit_marker_before_line(source: &[u8], line_idx: usize) -> bool {
    let mut byte_offset = 0;
    for (i, l) in source.split(|&b| b == b'\n').enumerate() {
        if i == line_idx {
            break;
        }
        byte_offset += l.len() + 1;
    }
    let region = &source[..byte_offset.min(source.len())];
    let mut check_pos = region.len();
    while check_pos > 0 {
        if let Some(nl_pos) = region[..check_pos].iter().rposition(|&b| b == b'\n') {
            let line = &region[nl_pos + 1..check_pos];
            let trimmed = std::str::from_utf8(line).unwrap_or("").trim();
            if trimmed.is_empty() {
                check_pos = nl_pos;
                continue;
            }
            return trimmed.contains("transit:function");
        } else {
            return std::str::from_utf8(&region[..check_pos]).unwrap_or("").trim().contains("transit:function");
        }
    }
    false
}

fn resolve_export_tier(has_marker: bool, file_has_transit_file_marker: bool) -> u8 {
    if has_marker {
        3
    } else if file_has_transit_file_marker {
        2
    } else {
        1
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
        for (line_idx, line) in source_str.lines().enumerate() {
            let trimmed = line.trim();
            if trimmed.contains("pub fn ") || trimmed.contains("pub async fn ") {
                // Extract function name
                if let Some(fn_start) = trimmed.find("fn ") {
                    let after_fn = &trimmed[fn_start + 3..];
                    if let Some(paren_pos) = after_fn.find('(') {
                        let fn_name = after_fn[..paren_pos].trim();
                        let signature = trimmed.trim_end_matches('{').trim().to_string();
                        
                        // Check for transit:function marker in preceding lines
                        // by finding the byte offset of this line
                        let mut byte_offset = 0;
                        for (i, l) in source_str.lines().enumerate() {
                            if i == line_idx {
                                break;
                            }
                            byte_offset += l.len() + 1; // +1 for newline
                        }
                        
                        // Create a virtual node position for marker detection
                        // We check the source around this line for the marker
                        let has_marker = check_transit_marker_before_line(source, line_idx);
                        let export_tier = resolve_export_tier(has_marker, file_has_transit_file_marker);
                        
                        entries.push(ManifestEntry {
                            language: lang_name.to_string(),
                            source_file: path.to_string_lossy().to_string(),
                            function_name: fn_name.to_string(),
                            signature,
                            export_tier,
                        });
                    }
                }
            }
        }
        return entries;
    }

    // For Java, use text-based detection (more reliable than tree-sitter queries across versions)
    if lang_name == "java" {
        // Skip transit runtime files — these are framework internals, not user functions
        let path_str = path.to_string_lossy();
        if path_str.contains("transit/java/") || path_str.contains("transit_java") {
            return entries;
        }

        let source_str = std::str::from_utf8(source).unwrap_or("");
        for (line_idx, line) in source_str.lines().enumerate() {
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
                            
                            // Check for transit:function marker in preceding lines
                            let has_marker = check_transit_marker_before_line(source, line_idx);
                            let export_tier = resolve_export_tier(has_marker, file_has_transit_file_marker);
                            
                            entries.push(ManifestEntry {
                                language: lang_name.to_string(),
                                source_file: path.to_string_lossy().to_string(),
                                function_name: method_name.to_string(),
                                signature,
                                export_tier,
                            });
                        }
                    }
                }
            }
        }
        return entries;
    }

    // For C, detect non-static functions (C's native visibility baseline)
    if lang_name == "c" {
        let source_str = std::str::from_utf8(source).unwrap_or("");
        for (line_idx, line) in source_str.lines().enumerate() {
            let trimmed = line.trim();
            // Skip comments and preprocessor directives
            if trimmed.starts_with("//") || trimmed.starts_with("/*") || trimmed.starts_with("#") {
                continue;
            }
            // Match function definitions: type name(params) { or type name(params);
            // Skip static functions (not externally visible)
            if trimmed.contains("static ") {
                continue;
            }
            // Look for function definitions: contains '(' and either '{' or ';'
            // Must not be a variable declaration (no '=' before '(')
            if let Some(paren_pos) = trimmed.find('(') {
                let before_paren = &trimmed[..paren_pos];
                let after_paren = &trimmed[paren_pos..];
                // Check it's a function definition (has closing paren and either { or ;)
                if after_paren.contains(')') && (after_paren.contains('{') || after_paren.contains(';')) {
                    // Check it's not a macro or variable
                    if !before_paren.contains('=') && !before_paren.ends_with("if")
                        && !before_paren.ends_with("while") && !before_paren.ends_with("for")
                        && !before_paren.ends_with("switch") && !before_paren.ends_with("return")
                    {
                        // Extract function name: last identifier before '('
                        let words: Vec<&str> = before_paren.split_whitespace().collect();
                        if let Some(fn_name) = words.last() {
                            // Skip common non-function patterns
                            if *fn_name != "if" && *fn_name != "while" && *fn_name != "for"
                                && *fn_name != "switch" && *fn_name != "return"
                                && !fn_name.starts_with('"') && !fn_name.starts_with('*')
                            {
                                let signature = trimmed.trim_end_matches('{').trim().trim_end_matches(';').trim().to_string();
                                
                                let has_marker = check_transit_marker_before_line(source, line_idx);
                                let export_tier = resolve_export_tier(has_marker, file_has_transit_file_marker);
                                
                                entries.push(ManifestEntry {
                                    language: lang_name.to_string(),
                                    source_file: path.to_string_lossy().to_string(),
                                    function_name: fn_name.to_string(),
                                    signature,
                                    export_tier,
                                });
                            }
                        }
                    }
                }
            }
        }
        return entries;
    }

    // For C++, detect non-static functions (similar to C but with additional patterns)
    if lang_name == "cpp" {
        let source_str = std::str::from_utf8(source).unwrap_or("");
        for (line_idx, line) in source_str.lines().enumerate() {
            let trimmed = line.trim();
            // Skip comments and preprocessor directives
            if trimmed.starts_with("//") || trimmed.starts_with("/*") || trimmed.starts_with("#") {
                continue;
            }
            // Skip static functions
            if trimmed.contains("static ") {
                continue;
            }
            // Look for function definitions
            if let Some(paren_pos) = trimmed.find('(') {
                let before_paren = &trimmed[..paren_pos];
                let after_paren = &trimmed[paren_pos..];
                if after_paren.contains(')') && (after_paren.contains('{') || after_paren.contains(';')) {
                    if !before_paren.contains('=') && !before_paren.ends_with("if")
                        && !before_paren.ends_with("while") && !before_paren.ends_with("for")
                        && !before_paren.ends_with("switch") && !before_paren.ends_with("return")
                        && !before_paren.ends_with("catch")
                    {
                        let words: Vec<&str> = before_paren.split_whitespace().collect();
                        if let Some(fn_name) = words.last() {
                            if *fn_name != "if" && *fn_name != "while" && *fn_name != "for"
                                && *fn_name != "switch" && *fn_name != "return" && *fn_name != "catch"
                                && !fn_name.starts_with('"') && !fn_name.starts_with('*')
                                && !fn_name.starts_with('~') // destructors
                            {
                                let signature = trimmed.trim_end_matches('{').trim().trim_end_matches(';').trim().to_string();
                                
                                let has_marker = check_transit_marker_before_line(source, line_idx);
                                let export_tier = resolve_export_tier(has_marker, file_has_transit_file_marker);
                                
                                entries.push(ManifestEntry {
                                    language: lang_name.to_string(),
                                    source_file: path.to_string_lossy().to_string(),
                                    function_name: fn_name.to_string(),
                                    signature,
                                    export_tier,
                                });
                            }
                        }
                    }
                }
            }
        }
        return entries;
    }

    // For Python, use tree-sitter with class method detection
    if lang_name == "python" {
        // Skip transit runtime files — these are framework internals, not user functions
        let path_str = path.to_string_lossy();
        if path_str.contains("transit_server") || path_str.contains("transit_service") {
            return entries;
        }

        // First, detect top-level functions
        let query_str = python_function_query();
        if let Ok(query) = Query::new(&lang, query_str) {
            let mut cursor = QueryCursor::new();
            let matches = cursor.matches(&query, tree.root_node(), source);

            for mat in matches {
                let mut name = "";
                for cap in mat.captures {
                    if cap.node.kind() == "identifier" && name.is_empty() {
                        name = std::str::from_utf8(
                            &source[cap.node.start_byte()..cap.node.end_byte()],
                        )
                        .unwrap_or("");
                    }
                }

                if name.is_empty() || name.starts_with('_') {
                    continue;
                }

                let func_node = mat.captures.first().map(|c| c.node).unwrap();
                let export_tier = if has_transit_function_marker(source, func_node) {
                    3
                } else if file_has_transit_file_marker {
                    2
                } else {
                    1 // top-level def is natively public
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
        }

        // Then, detect class methods
        let method_query_str = python_method_query();
        if let Ok(method_query) = Query::new(&lang, method_query_str) {
            let mut cursor = QueryCursor::new();
            let matches = cursor.matches(&method_query, tree.root_node(), source);

            for mat in matches {
                let mut class_name = "";
                let mut method_name = "";
                let mut method_node = None;

                // Use cap.index which is the query capture index, not the iteration index
                for cap in mat.captures.iter() {
                    let text = std::str::from_utf8(
                        &source[cap.node.start_byte()..cap.node.end_byte()],
                    )
                    .unwrap_or("");

                    match cap.index {
                        0 => {
                            // @class_name
                            class_name = text;
                        }
                        1 => {
                            // @name (method identifier)
                            method_name = text;
                        }
                        2 => {
                            // @method (function_definition node)
                            method_node = Some(cap.node);
                        }
                        _ => {}
                    }
                }

                if method_name.is_empty() || method_name.starts_with('_') {
                    continue;
                }

                // Skip transit runtime class methods (TransitServer, etc.)
                // These are framework internals, not user functions
                if class_name == "TransitServer" || class_name == "BinaryProtocol" {
                    continue;
                }

                let func_node = method_node.unwrap_or(
                    mat.captures.first().map(|c| c.node).unwrap(),
                );

                let export_tier = if has_transit_function_marker(source, func_node) {
                    3
                } else if file_has_transit_file_marker {
                    2
                } else {
                    1 // public method (no _ prefix)
                };

                let signature = extract_signature(source, func_node);

                // Use ClassName.method_name for class methods
                let qualified_name = format!("{}.{}", class_name, method_name);

                entries.push(ManifestEntry {
                    language: lang_name.to_string(),
                    source_file: path.to_string_lossy().to_string(),
                    function_name: qualified_name,
                    signature,
                    export_tier,
                });
            }
        }

        return entries;
    }

    // For JavaScript, use tree-sitter
    let query_str = js_function_query();
    if let Ok(query) = Query::new(&lang, query_str) {
        let mut cursor = QueryCursor::new();
        let matches = cursor.matches(&query, tree.root_node(), source);

        for mat in matches {
            let mut name = "";
            for cap in mat.captures {
                if cap.node.kind() == "identifier" && name.is_empty() {
                    name = std::str::from_utf8(
                        &source[cap.node.start_byte()..cap.node.end_byte()],
                    )
                    .unwrap_or("");
                }
            }

            if name.is_empty() {
                continue;
            }

            let func_node = mat.captures.first().map(|c| c.node).unwrap();
            let export_tier = if has_transit_function_marker(source, func_node) {
                3
            } else if file_has_transit_file_marker {
                2
            } else {
                1 // exported function
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

/// Scan a directory with caching. Only re-parses files whose mtime has changed.
fn walk_and_scan_cached(root: &Path) -> Vec<ManifestEntry> {
    let mut cache = load_cache(root);
    let mut new_cache = Cache::new();
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

        let path_str = path.to_string_lossy().to_string();
        let mtime = get_mtime(path);

        // Check cache
        if let Some(cached) = cache.files.get(&path_str) {
            if cached.mtime == mtime {
                // File hasn't changed — use cached entries
                entries.extend(cached.entries.clone());
                new_cache.files.insert(
                    path_str,
                    CacheEntry {
                        mtime,
                        entries: cached.entries.clone(),
                    },
                );
                continue;
            }
        }

        // File is new or changed — scan it
        let source = match std::fs::read(path) {
            Ok(s) => s,
            Err(_) => continue,
        };

        let file_entries = scan_file(path, &source);
        new_cache.files.insert(
            path_str,
            CacheEntry {
                mtime,
                entries: file_entries.clone(),
            },
        );
        entries.extend(file_entries);
    }

    // Save updated cache
    save_cache(root, &new_cache);

    entries
}

// ─── NAPI exports ─────────────────────────────────────────────────────────────

/// Scan a directory and return a JSON manifest string.
/// Uses caching — only re-parses files whose mtime has changed.
#[napi]
pub fn scan_directory(root: String) -> String {
    let root_path = PathBuf::from(&root);
    let entries = walk_and_scan_cached(&root_path);

    let manifest = Manifest {
        entries,
        generated_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64,
    };

    serde_json::to_string(&manifest).unwrap_or_else(|_| "{}".to_string())
}

/// Scan a single file and return a JSON array of manifest entries.
/// Used by the file watcher for incremental updates.
#[napi]
pub fn scan_file_path(file_path: String) -> String {
    let path = PathBuf::from(&file_path);
    let source = match std::fs::read(&path) {
        Ok(s) => s,
        Err(_) => return "[]".to_string(),
    };

    let entries = scan_file(&path, &source);
    serde_json::to_string(&entries).unwrap_or_else(|_| "[]".to_string())
}

/// Invalidate the cache for a specific file (e.g. on file delete).
#[napi]
pub fn invalidate_cache(root: String, file_path: String) {
    let root_path = PathBuf::from(&root);
    let mut cache = load_cache(&root_path);
    cache.files.remove(&file_path);
    save_cache(&root_path, &cache);
}

/// Clear the entire cache for a directory.
#[napi]
pub fn clear_cache(root: String) {
    let root_path = PathBuf::from(&root);
    let path = cache_path(&root_path);
    let _ = std::fs::remove_file(path);
}

/// Get the Transit scanner version.
#[napi]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[napi]
pub fn detect_holycc() -> Option<String> {
    use std::process::Command;
    
    Command::new("which")
        .arg("hcc")
        .output()
        .ok()
        .and_then(|output| {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    Some(path)
                } else {
                    None
                }
            } else {
                None
            }
        })
}

#[napi]
pub fn transpile_holycc(hcc_path: String, source_path: String) -> napi::Result<String> {
    use std::process::Command;
    use std::path::Path;
    
    let source = Path::new(&source_path);
    if !source.exists() {
        return Err(napi::Error::from_reason(format!("Source file not found: {}", source_path)));
    }
    
    let output = Command::new(&hcc_path)
        .arg("-transpile")
        .arg(&source_path)
        .output()
        .map_err(|e| napi::Error::from_reason(format!("Failed to execute hcc: {}", e)))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(napi::Error::from_reason(format!("hcc transpilation failed: {}", stderr)));
    }
    
    let c_code = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(c_code)
}
