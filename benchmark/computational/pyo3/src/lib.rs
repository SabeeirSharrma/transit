use pyo3::prelude::*;
use pyo3::types::PyDict;
use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize)]
struct ComputeRequest {
    operation: String,
    payload: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
struct ComputeResponse {
    result: serde_json::Value,
    execution_time_ms: f64,
}

#[pyfunction]
fn compute(operation: String, payload: Py<PyDict>) -> PyResult<Py<PyDict>> {
    let start = std::time::Instant::now();
    
    let result = match operation.as_str() {
        "etl_pipeline" => etl_pipeline(payload),
        "text_analysis" => text_analysis(payload),
        "matrix_multiply" => matrix_multiply(payload),
        "matrix_determinant" => matrix_determinant(payload),
        "graph_processing" => graph_processing(payload),
        "fibonacci_memo" => fibonacci_memo(payload),
        "sha256_hashing" => sha256_hashing(payload),
        _ => Err(pyo3::exceptions::PyValueError::new_err(format!("Unknown operation: {}", operation))),
    }?;
    
    let elapsed = start.elapsed();
    let execution_time_ms = elapsed.as_secs_f64() * 1000.0;
    
    Python::with_gil(|py| {
        let response = PyDict::new(py);
        response.set_item("result", result)?;
        response.set_item("execution_time_ms", execution_time_ms)?;
        Ok(response.into())
    })
}

fn etl_pipeline(payload: Py<PyDict>) -> PyResult<Py<PyDict>> {
    Python::with_gil(|py| {
        let payload = payload.bind(py);
        let rows: Vec<Py<PyDict>> = payload.get_item("rows")?
            .ok_or_else(|| pyo3::exceptions::PyValueError::new_err("Missing 'rows'"))?
            .extract()?;
        
        let mut grouped: HashMap<String, Vec<f64>> = HashMap::new();
        
        for row in &rows {
            let row = row.bind(py);
            let category = row.get_item("category")?
                .ok_or_else(|| pyo3::exceptions::PyValueError::new_err("Missing 'category'"))?
                .extract::<String>()?;
            let value = row.get_item("value")?
                .ok_or_else(|| pyo3::exceptions::PyValueError::new_err("Missing 'value'"))?
                .extract::<f64>()?;
            
            grouped.entry(category).or_insert_with(Vec::new).push(value);
        }
        
        let result = PyDict::new(py);
        for (key, values) in &grouped {
            let count = values.len();
            let sum: f64 = values.iter().sum();
            let avg = sum / count as f64;
            
            let group_result = PyDict::new(py);
            group_result.set_item("count", count)?;
            group_result.set_item("sum", sum)?;
            group_result.set_item("avg", avg)?;
            result.set_item(key, group_result)?;
        }
        
        Ok(result.into())
    })
}

fn text_analysis(payload: Py<PyDict>) -> PyResult<Py<PyDict>> {
    Python::with_gil(|py| {
        let payload = payload.bind(py);
        let text = payload.get_item("text")?
            .ok_or_else(|| pyo3::exceptions::PyValueError::new_err("Missing 'text'"))?
            .extract::<String>()?;
        
        let words: Vec<&str> = text.split_whitespace().collect();
        let mut freq: HashMap<String, usize> = HashMap::new();
        
        for word in &words {
            let word_lower = word.to_lowercase();
            *freq.entry(word_lower).or_insert(0) += 1;
        }
        
        let mut bigrams = Vec::new();
        for i in 0..words.len().saturating_sub(1) {
            bigrams.push(format!("{} {}", words[i], words[i + 1]));
        }
        
        let avg_word_length = if words.is_empty() {
            0.0
        } else {
            words.iter().map(|w| w.len() as f64).sum::<f64>() / words.len() as f64
        };
        
        let result = PyDict::new(py);
        result.set_item("word_count", words.len())?;
        result.set_item("unique_words", freq.len())?;
        result.set_item("avg_word_length", avg_word_length)?;
        result.set_item("avg_sentence_length", words.len())?;
        
        let freq_dict = PyDict::new(py);
        let mut sorted_freq: Vec<_> = freq.into_iter().collect();
        sorted_freq.sort_by(|a, b| b.1.cmp(&a.1));
        for (word, count) in sorted_freq.into_iter().take(10) {
            freq_dict.set_item(word, count)?;
        }
        result.set_item("frequency", freq_dict)?;
        
        let bigrams_list: Vec<String> = bigrams.into_iter().take(10).collect();
        result.set_item("bigrams", bigrams_list)?;
        
        Ok(result.into())
    })
}

fn matrix_multiply(payload: Py<PyDict>) -> PyResult<Py<PyDict>> {
    Python::with_gil(|py| {
        let payload = payload.bind(py);
        let a: Vec<Vec<f64>> = payload.get_item("matrix_a")?
            .ok_or_else(|| pyo3::exceptions::PyValueError::new_err("Missing 'matrix_a'"))?
            .extract()?;
        let b: Vec<Vec<f64>> = payload.get_item("matrix_b")?
            .ok_or_else(|| pyo3::exceptions::PyValueError::new_err("Missing 'matrix_b'"))?
            .extract()?;
        
        let n = a.len();
        let mut result = vec![vec![0.0; n]; n];
        
        for i in 0..n {
            for j in 0..n {
                for k in 0..n {
                    result[i][j] += a[i][k] * b[k][j];
                }
            }
        }
        
        let result_dict = PyDict::new(py);
        result_dict.set_item("result", result)?;
        result_dict.set_item("size", n)?;
        
        Ok(result_dict.into())
    })
}

fn matrix_determinant(payload: Py<PyDict>) -> PyResult<Py<PyDict>> {
    Python::with_gil(|py| {
        let payload = payload.bind(py);
        let matrix: Vec<Vec<f64>> = payload.get_item("matrix")?
            .ok_or_else(|| pyo3::exceptions::PyValueError::new_err("Missing 'matrix'"))?
            .extract()?;
        
        let det = compute_determinant(&matrix);
        
        let result = PyDict::new(py);
        result.set_item("determinant", det)?;
        
        Ok(result.into())
    })
}

fn compute_determinant(matrix: &[Vec<f64>]) -> f64 {
    let n = matrix.len();
    
    if n == 1 {
        return matrix[0][0];
    }
    
    if n == 2 {
        return matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0];
    }
    
    let mut det = 0.0;
    for j in 0..n {
        let mut minor = Vec::new();
        for i in 1..n {
            let mut row = Vec::new();
            for k in 0..n {
                if k != j {
                    row.push(matrix[i][k]);
                }
            }
            minor.push(row);
        }
        
        let sign = if j % 2 == 0 { 1.0 } else { -1.0 };
        det += sign * matrix[0][j] * compute_determinant(&minor);
    }
    
    det
}

fn graph_processing(payload: Py<PyDict>) -> PyResult<Py<PyDict>> {
    Python::with_gil(|py| {
        let payload = payload.bind(py);
        let nodes = payload.get_item("nodes")?
            .ok_or_else(|| pyo3::exceptions::PyValueError::new_err("Missing 'nodes'"))?
            .extract::<usize>()?;
        let edges: Vec<(usize, usize)> = payload.get_item("edges")?
            .ok_or_else(|| pyo3::exceptions::PyValueError::new_err("Missing 'edges'"))?
            .extract()?;
        
        // Build adjacency list
        let mut adj: Vec<Vec<usize>> = vec![Vec::new(); nodes];
        for (src, dst) in &edges {
            adj[*src].push(*dst);
            adj[*dst].push(*src);
        }
        
        // BFS from node 0
        let mut visited = vec![false; nodes];
        let mut queue = std::collections::VecDeque::new();
        let mut bfs_order = Vec::new();
        
        visited[0] = true;
        queue.push_back(0);
        
        while let Some(node) = queue.pop_front() {
            bfs_order.push(node);
            for &neighbor in &adj[node] {
                if !visited[neighbor] {
                    visited[neighbor] = true;
                    queue.push_back(neighbor);
                }
            }
        }
        
        // Simple PageRank
        let mut pagerank = vec![1.0 / nodes as f64; nodes];
        for _ in 0..10 {
            let mut new_rank = vec![0.0; nodes];
            for node in 0..nodes {
                let mut rank_sum = 0.0;
                for &neighbor in &adj[node] {
                    if !adj[neighbor].is_empty() {
                        rank_sum += pagerank[neighbor] / adj[neighbor].len() as f64;
                    }
                }
                new_rank[node] = 0.15 / nodes as f64 + 0.85 * rank_sum;
            }
            pagerank = new_rank;
        }
        
        // Connected components
        let mut visited = vec![false; nodes];
        let mut components = 0;
        
        for node in 0..nodes {
            if !visited[node] {
                components += 1;
                let mut stack = vec![node];
                while let Some(n) = stack.pop() {
                    if !visited[n] {
                        visited[n] = true;
                        for &neighbor in &adj[n] {
                            if !visited[neighbor] {
                                stack.push(neighbor);
                            }
                        }
                    }
                }
            }
        }
        
        let result = PyDict::new(py);
        result.set_item("bfs_nodes_visited", bfs_order.len())?;
        
        let mut sorted_pagerank: Vec<(usize, f64)> = pagerank.into_iter().enumerate().collect();
        sorted_pagerank.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
        let top5: Vec<(usize, f64)> = sorted_pagerank.into_iter().take(5).collect();
        result.set_item("pagerank_top5", top5)?;
        
        result.set_item("connected_components", components)?;
        
        Ok(result.into())
    })
}

fn fibonacci_memo(payload: Py<PyDict>) -> PyResult<Py<PyDict>> {
    Python::with_gil(|py| {
        let payload = payload.bind(py);
        let n = payload.get_item("n")?
            .ok_or_else(|| pyo3::exceptions::PyValueError::new_err("Missing 'n'"))?
            .extract::<u64>()?;
        
        let mut memo = HashMap::new();
        let result = fib(n, &mut memo);
        
        let result_dict = PyDict::new(py);
        result_dict.set_item("result", result)?;
        result_dict.set_item("n", n)?;
        
        Ok(result_dict.into())
    })
}

fn fib(n: u64, memo: &mut HashMap<u64, u64>) -> u64 {
    if let Some(&val) = memo.get(&n) {
        return val;
    }
    
    if n <= 1 {
        return n;
    }
    
    let result = fib(n - 1, memo) + fib(n - 2, memo);
    memo.insert(n, result);
    result
}

fn sha256_hashing(payload: Py<PyDict>) -> PyResult<Py<PyDict>> {
    Python::with_gil(|py| {
        let payload = payload.bind(py);
        let rounds = payload.get_item("rounds")?
            .ok_or_else(|| pyo3::exceptions::PyValueError::new_err("Missing 'rounds'"))?
            .extract::<usize>()?;
        let data_str = payload.get_item("data")?
            .ok_or_else(|| pyo3::exceptions::PyValueError::new_err("Missing 'data'"))?
            .extract::<String>()?;
        
        let mut result = data_str.into_bytes();
        for _ in 0..rounds {
            let mut hasher = Sha256::new();
            hasher.update(&result);
            result = hasher.finalize().to_vec();
        }
        
        let hash_hex = hex::encode(&result);
        
        let result_dict = PyDict::new(py);
        result_dict.set_item("hash", hash_hex)?;
        result_dict.set_item("rounds", rounds)?;
        
        Ok(result_dict.into())
    })
}

#[pymodule]
fn pyo3_benchmark(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(compute, m)?)?;
    Ok(())
}
