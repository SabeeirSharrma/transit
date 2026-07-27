#!/usr/bin/env node
/**
 * gRPC client for computational benchmark.
 * Usage: node grpc-client.js <operation> <payload>
 */

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const PROTO_PATH = path.join(__dirname, 'proto', 'benchmark.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const computational = protoDescriptor.computational;

const client = new computational.BenchmarkService(
    'localhost:50051',
    grpc.credentials.createInsecure()
);

function compute(operation, payload) {
    return new Promise((resolve, reject) => {
        const start = performance.now();
        
        client.Compute({
            operation: operation,
            payload: Buffer.from(JSON.stringify(payload))
        }, (err, response) => {
            if (err) {
                reject(err);
                return;
            }
            
            const end = performance.now();
            const result = JSON.parse(response.result.toString());
            
            resolve({
                result: result,
                execution_time_ms: response.execution_time_ms,
                total_time_ms: end - start
            });
        });
    });
}

function computeBatch(requests) {
    return new Promise((resolve, reject) => {
        const start = performance.now();
        
        client.ComputeBatch({
            requests: requests.map(req => ({
                operation: req.operation,
                payload: Buffer.from(JSON.stringify(req.payload))
            }))
        }, (err, response) => {
            if (err) {
                reject(err);
                return;
            }
            
            const end = performance.now();
            const results = response.responses.map(resp => ({
                result: JSON.parse(resp.result.toString()),
                execution_time_ms: resp.execution_time_ms
            }));
            
            resolve({
                results: results,
                total_time_ms: response.total_time_ms,
                client_time_ms: end - start
            });
        });
    });
}

// Export for use in benchmark runner
module.exports = { compute, computeBatch };

// CLI interface
if (require.main === module) {
    const operation = process.argv[2];
    const payload = JSON.parse(process.argv[3] || '{}');
    
    compute(operation, payload)
        .then(result => {
            console.log(JSON.stringify(result, null, 2));
            process.exit(0);
        })
        .catch(err => {
            console.error('Error:', err.message);
            process.exit(1);
        });
}
