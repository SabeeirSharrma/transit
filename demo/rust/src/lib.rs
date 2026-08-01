use napi_derive::napi;

/// Greet someone by name — returns a friendly greeting.
#[napi]
pub fn greet(name: String) -> String {
    format!("Hello from Rust, {name}! 🦀")
}

/// Compute the nth Fibonacci number iteratively.
#[napi]
pub fn fibonacci(n: u32) -> i64 {
    if n == 0 {
        return 0;
    }
    let mut a: i64 = 0;
    let mut b: i64 = 1;
    for _ in 1..n {
        let tmp = b;
        b = a + b;
        a = tmp;
    }
    b
}

/// Multiply two square matrices (flat vec of f64).
/// Expects `a` and `b` to be flat vectors of length `size*size`.
#[napi]
pub fn matrix_multiply(a: Vec<f64>, b: Vec<f64>, size: u32) -> Vec<f64> {
    let s = size as usize;
    let mut result = vec![0.0f64; s * s];
    for i in 0..s {
        for k in 0..s {
            let aik = a[i * s + k];
            for j in 0..s {
                result[i * s + j] += aik * b[k * s + j];
            }
        }
    }
    result
}

/// Run a compute-heavy benchmark: sum of prime counts up to `limit`.
#[napi]
pub fn count_primes(limit: u32) -> u32 {
    if limit < 2 {
        return 0;
    }
    let mut sieve = vec![true; limit as usize];
    sieve[0] = false;
    sieve[1] = false;
    let mut i = 2;
    while i * i < limit as usize {
        if sieve[i] {
            let mut j = i * i;
            while j < limit as usize {
                sieve[j] = false;
                j += i;
            }
        }
        i += 1;
    }
    sieve.iter().filter(|&&x| x).count() as u32
}
