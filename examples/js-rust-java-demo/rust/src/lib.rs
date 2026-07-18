// transit:file
//
// Example Rust functions callable from JS via Transit.
// These demonstrate the three tiers of export visibility.

use napi_derive::napi;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
#[napi(object)]
pub struct FileJob {
    pub id: String,
    pub bytes: Vec<u8>,
    pub priority: i32,
}

#[derive(Serialize, Deserialize)]
#[napi(object)]
pub struct ProcessResult {
    pub id: String,
    pub output: String,
    pub processed: bool,
}

/// Tier 1: natively public function — discoverable without markers.
/// Marked with #[napi] so it's callable from Node.js via the native addon.
#[napi]
pub fn process_general(job: FileJob) -> ProcessResult {
    ProcessResult {
        id: job.id,
        output: format!("Processed {} bytes", job.bytes.len()),
        processed: true,
    }
}

/// Tier 3: transit:function marker allows exporting private helpers too.
// transit:function
fn internal_helper(data: &[u8]) -> String {
    format!("Internal: {} bytes", data.len())
}

/// Also marked with #[napi] to be callable from Node.js.
#[napi]
pub fn process_with_helper(job: FileJob) -> ProcessResult {
    let hint = internal_helper(&job.bytes);
    ProcessResult {
        id: job.id,
        output: hint,
        processed: true,
    }
}

/// Get the demo version.
#[napi]
pub fn version() -> String {
    "0.1.0-demo".to_string()
}
