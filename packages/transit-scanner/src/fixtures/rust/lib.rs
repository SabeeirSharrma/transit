use napi_derive::napi;

// Tier 1: public function (should be discovered)
#[napi]
pub fn greet(name: String) -> String {
    format!("Hello, {}!", name)
}

// Tier 1: public async function (should be discovered)
#[napi]
pub async fn process_async(data: String) -> String {
    data
}

// Not exported: private function (should NOT be discovered)
fn _helper() -> i32 {
    42
}

// Not exported: no #[napi] (should be found by scanner but not callable)
pub fn no_napi() -> i32 {
    0
}
