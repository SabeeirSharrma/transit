namespace py chat_thrift

struct ComputeRequest {
    1: string operation,
    2: binary payload
}

struct ComputeResponse {
    1: binary result,
    2: double execution_time_ms
}

service ChatService {
    ComputeResponse compute(1: ComputeRequest request)
}
