use pyo3::prelude::*;
use pyo3::types::PyDict;
use sha2::{Sha256, Digest};
use std::collections::HashMap;

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
        let csv_data: String = payload.get_item("csv_data")?
            .ok_or_else(|| pyo3::exceptions::PyValueError::new_err("Missing 'csv_data'"))?
            .extract()?;
        
        let mut grouped: HashMap<String, Vec<f64>> = HashMap::new();
        
        for line in csv_data.lines() {
            let parts: Vec<&str> = line.split(',').collect();
            if parts.len() >= 2 {
                let key = parts[0].trim().to_string();
                if let Ok(val) = parts[1].trim().parse::<f64>() {
                    grouped.entry(key).or_insert_with(Vec::new).push(val);
                }
            }
        }
        
        let mut aggregates = Vec::new();
        let mut records = 0usize;
        let mut sorted_keys: Vec<String> = grouped.keys().cloned().collect();
        sorted_keys.sort();
        for key in &sorted_keys {
            let values = &grouped[key];
            let count = values.len();
            let sum: f64 = values.iter().sum();
            let avg = sum / count as f64;
            records += count;

            let group_result = PyDict::new(py);
            group_result.set_item("group", key)?;
            group_result.set_item("sum", sum)?;
            group_result.set_item("avg", avg)?;
            group_result.set_item("count", count)?;
            aggregates.push(group_result);
        }

        let result = PyDict::new(py);
        result.set_item("records_processed", records)?;
        result.set_item("aggregates", aggregates)?;
        
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
            let clean: String = word.to_lowercase().chars().filter(|c| c.is_alphanumeric()).collect();
            if !clean.is_empty() {
                *freq.entry(clean).or_insert(0) += 1;
            }
        }
        
        // Build bigrams with counts
        let mut bigram_freq: HashMap<String, usize> = HashMap::new();
        let clean_words: Vec<String> = words.iter()
            .map(|w| w.to_lowercase().chars().filter(|c| c.is_alphanumeric()).collect())
            .filter(|w: &String| !w.is_empty())
            .collect();
        for i in 0..clean_words.len().saturating_sub(1) {
            let bigram = format!("{} {}", clean_words[i], clean_words[i + 1]);
            *bigram_freq.entry(bigram).or_insert(0) += 1;
        }
        let mut sorted_bigrams: Vec<_> = bigram_freq.into_iter().collect();
        sorted_bigrams.sort_by(|a, b| b.1.cmp(&a.1));
        
        let avg_word_length = if words.is_empty() {
            0.0
        } else {
            words.iter().map(|w| w.len() as f64).sum::<f64>() / words.len() as f64
        };
        
        let result = PyDict::new(py);
        result.set_item("word_count", words.len())?;
        result.set_item("unique_words", freq.len())?;
        result.set_item("avg_word_length", avg_word_length)?;
        
        let freq_dict = PyDict::new(py);
        let mut sorted_freq: Vec<_> = freq.into_iter().collect();
        sorted_freq.sort_by(|a, b| b.1.cmp(&a.1));
        for (word, count) in sorted_freq.into_iter().take(10) {
            freq_dict.set_item(word, count)?;
        }
        result.set_item("frequency", freq_dict)?;
        
        let bigrams_list = PyDict::new(py);
        let mut bigram_idx = 0usize;
        for (word, count) in sorted_bigrams.into_iter().take(10) {
            let entry = PyDict::new(py);
            entry.set_item("word", word)?;
            entry.set_item("count", count)?;
            bigrams_list.set_item(bigram_idx, entry)?;
            bigram_idx += 1;
        }
        result.set_item("bigrams", bigrams_list)?;
        
        Ok(result.into())
    })
}

fn matrix_multiply(payload: Py<PyDict>) -> PyResult<Py<PyDict>> {
    Python::with_gil(|py| {
        let payload = payload.bind(py);
        let a: Vec<f64> = payload.get_item("a")?
            .ok_or_else(|| pyo3::exceptions::PyValueError::new_err("Missing 'a'"))?
            .extract()?;
        let b: Vec<f64> = payload.get_item("b")?
            .ok_or_else(|| pyo3::exceptions::PyValueError::new_err("Missing 'b'"))?
            .extract()?;
        let m: usize = payload.get_item("m")?
            .ok_or_else(|| pyo3::exceptions::PyValueError::new_err("Missing 'm'"))?
            .extract()?;
        let n: usize = payload.get_item("n")?
            .ok_or_else(|| pyo3::exceptions::PyValueError::new_err("Missing 'n'"))?
            .extract()?;
        let p: usize = payload.get_item("p")?
            .ok_or_else(|| pyo3::exceptions::PyValueError::new_err("Missing 'p'"))?
            .extract()?;
        
        let mut result = vec![0.0; m * p];
        
        for i in 0..m {
            for k in 0..n {
                let a_val = a[i * n + k];
                for j in 0..p {
                    result[i * p + j] += a_val * b[k * p + j];
                }
            }
        }
        
        let result_dict = PyDict::new(py);
        result_dict.set_item("result", result)?;
        result_dict.set_item("dimensions", {
            let dims = PyDict::new(py);
            dims.set_item("m", m)?;
            dims.set_item("n", n)?;
            dims.set_item("p", p)?;
            dims
        })?;
        
        Ok(result_dict.into())
    })
}

fn matrix_determinant(payload: Py<PyDict>) -> PyResult<Py<PyDict>> {
    Python::with_gil(|py| {
        let payload = payload.bind(py);
        let flat: Vec<f64> = payload.get_item("flat")?
            .ok_or_else(|| pyo3::exceptions::PyValueError::new_err("Missing 'flat'"))?
            .extract()?;
        let n: usize = payload.get_item("n")?
            .ok_or_else(|| pyo3::exceptions::PyValueError::new_err("Missing 'n'"))?
            .extract()?;
        
        // Convert flat array to 2D matrix
        let mut matrix = Vec::new();
        for i in 0..n {
            matrix.push(flat[i * n..(i + 1) * n].to_vec());
        }
        
        let det = compute_determinant(&matrix);
        
        let result = PyDict::new(py);
        result.set_item("determinant", det)?;
        result.set_item("size", n)?;
        
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
        let edges_flat: Vec<usize> = payload.get_item("edges_flat")?
            .ok_or_else(|| pyo3::exceptions::PyValueError::new_err("Missing 'edges_flat'"))?
            .extract()?;
        let iterations: usize = payload.get_item("iterations")?
            .ok_or_else(|| pyo3::exceptions::PyValueError::new_err("Missing 'iterations'"))?
            .extract()?;
        
        // Build adjacency list from flat edge array [src1, dst1, weight1, src2, dst2, weight2, ...]
        let mut adj: Vec<Vec<(usize, usize)>> = vec![Vec::new(); nodes];
        for i in (0..edges_flat.len()).step_by(3) {
            if i + 2 < edges_flat.len() {
                let src = edges_flat[i];
                let dst = edges_flat[i + 1];
                let weight = edges_flat[i + 2];
                if src < nodes && dst < nodes {
                    adj[src].push((dst, weight));
                }
            }
        }
        
        // BFS from node 0
        let mut visited = vec![false; nodes];
        let mut queue = std::collections::VecDeque::new();
        let mut bfs_order = Vec::new();
        
        visited[0] = true;
        queue.push_back(0);
        
        while let Some(node) = queue.pop_front() {
            bfs_order.push(node);
            for &(neighbor, _) in &adj[node] {
                if !visited[neighbor] {
                    visited[neighbor] = true;
                    queue.push_back(neighbor);
                }
            }
        }
        
        // PageRank (matching FastAPI format)
        let damping = 0.85f64;
        let mut ranks = vec![1.0 / nodes as f64; nodes];
        for _ in 0..iterations {
            let mut new_ranks = vec![(1.0 - damping) / nodes as f64; nodes];
            for i in 0..nodes {
                let share = damping * ranks[i] / adj[i].len().max(1) as f64;
                for &(to, _) in &adj[i] {
                    new_ranks[to] += share;
                }
            }
            ranks = new_ranks;
        }

        // Build page_rank sorted by rank descending
        let mut page_rank_pairs: Vec<(usize, f64)> = ranks.into_iter().enumerate().collect();
        page_rank_pairs.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
        
        let page_rank = PyDict::new(py);
        let mut pr_idx = 0usize;
        for (node, rank) in page_rank_pairs.iter() {
            let entry = PyDict::new(py);
            entry.set_item("node", *node)?;
            entry.set_item("rank", *rank)?;
            page_rank.set_item(pr_idx, entry)?;
            pr_idx += 1;
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
                        for &(neighbor, _) in &adj[n] {
                            if !visited[neighbor] {
                                stack.push(neighbor);
                            }
                        }
                    }
                }
            }
        }
        
        let result = PyDict::new(py);
        // Convert bfs_order to Python list
        let bfs_list = pyo3::types::PyList::empty(py);
        for &node in &bfs_order {
            bfs_list.append(node)?;
        }
        result.set_item("bfs_order", bfs_list)?;
        result.set_item("page_rank", page_rank)?;
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
