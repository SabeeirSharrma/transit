use napi_derive::napi;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ─── Data Pipeline Operations ───────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct EtlResult {
    pub records_processed: usize,
    pub aggregates: Vec<Aggregate>,
    pub duration_ms: f64,
}

#[derive(Serialize, Deserialize)]
pub struct Aggregate {
    pub group: String,
    pub sum: f64,
    pub avg: f64,
    pub count: usize,
}

/// Parse CSV-like data, group by key, compute aggregates.
/// Simulates a real ETL pipeline with filtering, grouping, and aggregation.
#[napi]
pub fn etl_pipeline(csv_data: String) -> String {
    let start = std::time::Instant::now();

    // Parse "rows" of key:value pairs separated by newlines
    let mut groups: HashMap<String, Vec<f64>> = HashMap::new();

    for line in csv_data.lines() {
        let parts: Vec<&str> = line.split(',').collect();
        if parts.len() >= 2 {
            let key = parts[0].trim().to_string();
            if let Ok(val) = parts[1].trim().parse::<f64>() {
                groups.entry(key).or_default().push(val);
            }
        }
    }

    let mut aggregates: Vec<Aggregate> = groups
        .into_iter()
        .map(|(group, values)| {
            let sum: f64 = values.iter().sum();
            let count = values.len();
            let avg = if count > 0 { sum / count as f64 } else { 0.0 };
            Aggregate { group, sum, avg, count }
        })
        .collect();

    aggregates.sort_by(|a, b| a.group.cmp(&b.group));

    let result = EtlResult {
        records_processed: aggregates.iter().map(|a| a.count).sum(),
        aggregates,
        duration_ms: start.elapsed().as_secs_f64() * 1000.0,
    };

    serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_string())
}

// ─── Text Analysis Operations ───────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct TextAnalysisResult {
    pub word_count: usize,
    pub char_count: usize,
    pub unique_words: usize,
    pub avg_word_length: f64,
    pub top_words: Vec<WordFrequency>,
    pub bigrams: Vec<WordFrequency>,
    pub readability_score: f64,
    pub duration_ms: f64,
}

#[derive(Serialize, Deserialize)]
pub struct WordFrequency {
    pub word: String,
    pub count: usize,
}

/// Full text analysis: tokenization, frequency counting, n-grams, readability scoring.
#[napi]
pub fn analyze_text_full(text: String) -> String {
    let start = std::time::Instant::now();

    let chars = text.chars().count();
    let words: Vec<&str> = text.split_whitespace().collect();
    let word_count = words.len();

    // Word frequency
    let mut freq: HashMap<String, usize> = HashMap::new();
    for w in &words {
        let clean = w.to_lowercase().chars().filter(|c| c.is_alphanumeric()).collect::<String>();
        if !clean.is_empty() {
            *freq.entry(clean).or_insert(0) += 1;
        }
    }

    let unique_words = freq.len();
    let avg_word_length = if word_count > 0 {
        words.iter().map(|w| w.len() as f64).sum::<f64>() / word_count as f64
    } else {
        0.0
    };

    // Top 10 words
    let mut top_words: Vec<WordFrequency> = freq.iter()
        .map(|(w, c)| WordFrequency { word: w.clone(), count: *c })
        .collect();
    top_words.sort_by(|a, b| b.count.cmp(&a.count));
    top_words.truncate(10);

    // Bigrams
    let clean_words: Vec<String> = words.iter()
        .map(|w| w.to_lowercase().chars().filter(|c| c.is_alphanumeric()).collect::<String>())
        .filter(|w| !w.is_empty())
        .collect();

    let mut bigram_freq: HashMap<String, usize> = HashMap::new();
    for window in clean_words.windows(2) {
        let bigram = format!("{} {}", window[0], window[1]);
        *bigram_freq.entry(bigram).or_insert(0) += 1;
    }

    let mut bigrams: Vec<WordFrequency> = bigram_freq.iter()
        .map(|(w, c)| WordFrequency { word: w.clone(), count: *c })
        .collect();
    bigrams.sort_by(|a, b| b.count.cmp(&a.count));
    bigrams.truncate(10);

    // Flesch-Kincaid-like readability (simplified)
    let sentences = text.matches(|c: char| c == '.' || c == '!' || c == '?').count().max(1);
    let syllable_count: usize = words.iter().map(|w| count_syllables(w)).sum();
    let readability = if sentences > 0 && word_count > 0 {
        206.835 - 1.015 * (word_count as f64 / sentences as f64)
            - 84.6 * (syllable_count as f64 / word_count as f64)
    } else {
        0.0
    };

    let result = TextAnalysisResult {
        word_count,
        char_count: chars,
        unique_words,
        avg_word_length,
        top_words,
        bigrams,
        readability_score: readability,
        duration_ms: start.elapsed().as_secs_f64() * 1000.0,
    };

    serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_string())
}

fn count_syllables(word: &str) -> usize {
    let vowels = "aeiouy";
    let chars: Vec<char> = word.to_lowercase().chars().collect();
    if chars.is_empty() { return 1; }

    let mut count = 0;
    let mut prev_vowel = false;
    for c in &chars {
        let is_vowel = vowels.contains(*c);
        if is_vowel && !prev_vowel {
            count += 1;
        }
        prev_vowel = is_vowel;
    }
    if chars.last() == Some(&'e') && count > 1 { count -= 1; }
    count.max(1)
}

// ─── Matrix Operations ──────────────────────────────────────────────────────

/// Multiply two matrices represented as flat arrays.
/// Returns result as JSON string.
#[napi]
pub fn matrix_multiply(a_flat: Vec<f64>, b_flat: Vec<f64>, m: u32, n: u32, p: u32) -> String {
    let start = std::time::Instant::now();

    let m = m as usize;
    let n = n as usize;
    let p = p as usize;

    let mut result = vec![0.0f64; m * p];

    for i in 0..m {
        for k in 0..n {
            let a_val = a_flat[i * n + k];
            for j in 0..p {
                result[i * p + j] += a_val * b_flat[k * p + j];
            }
        }
    }

    let elapsed = start.elapsed().as_secs_f64() * 1000.0;

    serde_json::to_string(&serde_json::json!({
        "result": result,
        "dimensions": {"m": m, "n": n, "p": p},
        "duration_ms": elapsed
    })).unwrap_or_else(|_| "{}".to_string())
}

/// Compute determinant of a matrix using cofactor expansion (for small matrices).
#[napi]
pub fn matrix_determinant(flat: Vec<f64>, n: u32) -> String {
    let start = std::time::Instant::now();
    let n = n as usize;
    let mat: Vec<Vec<f64>> = (0..n)
        .map(|i| flat[i * n..(i + 1) * n].to_vec())
        .collect();

    let det = determinant_recursive(&mat, n);
    let elapsed = start.elapsed().as_secs_f64() * 1000.0;

    serde_json::to_string(&serde_json::json!({
        "determinant": det,
        "size": n,
        "duration_ms": elapsed
    })).unwrap_or_else(|_| "{}".to_string())
}

fn determinant_recursive(mat: &[Vec<f64>], n: usize) -> f64 {
    if n == 1 { return mat[0][0]; }
    if n == 2 { return mat[0][0] * mat[1][1] - mat[0][1] * mat[1][0]; }

    let mut det = 0.0;
    for j in 0..n {
        let mut sub_matrix: Vec<Vec<f64>> = Vec::new();
        for i in 1..n {
            let mut row = Vec::new();
            for k in 0..n {
                if k != j { row.push(mat[i][k]); }
            }
            sub_matrix.push(row);
        }
        let sign = if j % 2 == 0 { 1.0 } else { -1.0 };
        det += sign * mat[0][j] * determinant_recursive(&sub_matrix, n - 1);
    }
    det
}

// ─── Graph Processing ───────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct GraphResult {
    pub bfs_order: Vec<usize>,
    pub shortest_paths: Vec<ShortestPath>,
    pub page_rank: Vec<PageRankEntry>,
    pub connected_components: usize,
    pub duration_ms: f64,
}

#[derive(Serialize, Deserialize)]
pub struct ShortestPath {
    pub from: usize,
    pub to: usize,
    pub distance: i32,
    pub path: Vec<usize>,
}

#[derive(Serialize, Deserialize)]
pub struct PageRankEntry {
    pub node: usize,
    pub rank: f64,
}

/// Process a graph: BFS, shortest paths, PageRank, connected components.
/// Edges are passed as [from, to, weight] triples.
#[napi]
pub fn process_graph(nodes: u32, edges_flat: Vec<i64>, iterations: u32) -> String {
    let start = std::time::Instant::now();
    let n = nodes as usize;

    // Build adjacency list
    let mut adj: Vec<Vec<(usize, i32)>> = vec![Vec::new(); n];
    let mut in_degree: Vec<usize> = vec![0; n];

    for chunk in edges_flat.chunks(3) {
        if chunk.len() == 3 {
            let from = chunk[0] as usize;
            let to = chunk[1] as usize;
            let weight = chunk[2] as i32;
            if from < n && to < n {
                adj[from].push((to, weight));
                in_degree[to] += 1;
            }
        }
    }

    // BFS from node 0
    let bfs_order = bfs(&adj, 0, n);

    // Shortest paths from node 0 using Dijkstra
    let mut shortest_paths = Vec::new();
    for target in [1, 2, 3, 4, 5].iter().filter(|&&t| t < n) {
        let (dist, path) = dijkstra(&adj, 0, *target, n);
        shortest_paths.push(ShortestPath {
            from: 0,
            to: *target,
            distance: dist,
            path,
        });
    }

    // PageRank
    let damping = 0.85;
    let mut ranks = vec![1.0 / n as f64; n];
    for _ in 0..iterations {
        let mut new_ranks = vec![(1.0 - damping) / n as f64; n];
        for i in 0..n {
            let share = damping * ranks[i] / adj[i].len().max(1) as f64;
            for &(to, _) in &adj[i] {
                new_ranks[to] += share;
            }
        }
        ranks = new_ranks;
    }

    let mut page_rank: Vec<PageRankEntry> = ranks.iter().enumerate()
        .map(|(i, &r)| PageRankEntry { node: i, rank: r })
        .collect();
    page_rank.sort_by(|a, b| b.rank.partial_cmp(&a.rank).unwrap());

    // Connected components (BFS-based)
    let mut visited = vec![false; n];
    let mut components = 0;
    for i in 0..n {
        if !visited[i] {
            components += 1;
            let mut stack = vec![i];
            while let Some(node) = stack.pop() {
                if !visited[node] {
                    visited[node] = true;
                    for &(to, _) in &adj[node] {
                        if !visited[to] { stack.push(to); }
                    }
                }
            }
        }
    }

    let result = GraphResult {
        bfs_order,
        shortest_paths,
        page_rank,
        connected_components: components,
        duration_ms: start.elapsed().as_secs_f64() * 1000.0,
    };

    serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_string())
}

fn bfs(adj: &[Vec<(usize, i32)>], start: usize, n: usize) -> Vec<usize> {
    let mut visited = vec![false; n];
    let mut queue = std::collections::VecDeque::new();
    let mut order = Vec::new();

    visited[start] = true;
    queue.push_back(start);

    while let Some(node) = queue.pop_front() {
        order.push(node);
        for &(to, _) in &adj[node] {
            if !visited[to] {
                visited[to] = true;
                queue.push_back(to);
            }
        }
    }
    order
}

fn dijkstra(adj: &[Vec<(usize, i32)>], start: usize, end: usize, n: usize) -> (i32, Vec<usize>) {
    use std::collections::BinaryHeap;
    use std::cmp::Reverse;

    let mut dist = vec![i32::MAX; n];
    let mut prev = vec![usize::MAX; n];
    let mut heap = BinaryHeap::new();

    dist[start] = 0;
    heap.push(Reverse((0, start)));

    while let Some(Reverse((d, u))) = heap.pop() {
        if d > dist[u] { continue; }
        for &(v, w) in &adj[u] {
            let nd = d + w;
            if nd < dist[v] {
                dist[v] = nd;
                prev[v] = u;
                heap.push(Reverse((nd, v)));
            }
        }
    }

    if dist[end] == i32::MAX { return (i32::MAX, vec![]); }

    let mut path = Vec::new();
    let mut current = end;
    while current != usize::MAX {
        path.push(current);
        current = prev[current];
    }
    path.reverse();
    (dist[end], path)
}

// ─── Benchmark Stress Test ──────────────────────────────────────────────────

/// Compute Fibonacci with memoization — pure CPU stress test.
#[napi]
pub fn fibonacci_memo(n: u32) -> String {
    let start = std::time::Instant::now();
    let mut memo: Vec<u64> = vec![0; (n + 1) as usize];
    let result = fib(n, &mut memo);
    let elapsed = start.elapsed().as_secs_f64() * 1000.0;

    serde_json::to_string(&serde_json::json!({
        "n": n,
        "result": result,
        "duration_ms": elapsed
    })).unwrap_or_else(|_| "{}".to_string())
}

fn fib(n: u32, memo: &mut Vec<u64>) -> u64 {
    if n <= 1 { return n as u64; }
    if memo[n as usize] != 0 { return memo[n as usize]; }
    let result = fib(n - 1, memo) + fib(n - 2, memo);
    memo[n as usize] = result;
    result
}

/// SHA-256 hash simulation — hash data multiple rounds.
#[napi]
pub fn hash_data(data: String, rounds: u32) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let start = std::time::Instant::now();
    let mut current = data.clone();

    for _ in 0..rounds {
        let mut hasher = DefaultHasher::new();
        current.hash(&mut hasher);
        current = format!("{:016x}", hasher.finish());
    }

    let elapsed = start.elapsed().as_secs_f64() * 1000.0;

    serde_json::to_string(&serde_json::json!({
        "hash": current,
        "rounds": rounds,
        "duration_ms": elapsed
    })).unwrap_or_else(|_| "{}".to_string())
}
