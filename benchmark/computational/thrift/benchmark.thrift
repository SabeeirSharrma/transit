namespace py thrift_computational

struct ComputeRequest {
    1: string operation,
    2: binary payload
}

struct ComputeResponse {
    1: binary result,
    2: double execution_time_ms
}

struct ComputeBatchRequest {
    1: list<ComputeRequest> requests
}

struct ComputeBatchResponse {
    1: list<ComputeResponse> responses,
    2: double total_time_ms
}

service BenchmarkService {
    ComputeResponse compute(1: ComputeRequest request),
    ComputeBatchResponse computeBatch(1: ComputeBatchRequest request)
}
