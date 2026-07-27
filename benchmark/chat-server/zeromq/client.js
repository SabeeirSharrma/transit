#!/usr/bin/env node
/**
 * ZeroMQ client for chat server benchmark.
 * Usage: node zeromq-client.js <operation> <payload>
 */

const zmq = require('zeromq');

const PORT = 5556;

async function sendRequest(operation, payload) {
    const sock = new zmq.Request();
    sock.connect(`tcp://127.0.0.1:${PORT}`);
    
    const start = performance.now();
    
    const request = {
        operation: operation,
        payload: payload
    };
    
    await sock.send(JSON.stringify(request));
    const [response] = await sock.recv();
    
    const end = performance.now();
    
    try {
        const result = JSON.parse(response.toString());
        return {
            result: result.result,
            execution_time_ms: result.execution_time_ms,
            total_time_ms: end - start
        };
    } catch (err) {
        throw new Error(`Failed to parse response: ${err.message}`);
    } finally {
        sock.close();
    }
}

// Export for use in benchmark runner
module.exports = { sendRequest };

// CLI interface
if (require.main === module) {
    const operation = process.argv[2];
    const payload = JSON.parse(process.argv[3] || '{}');
    
    sendRequest(operation, payload)
        .then(result => {
            console.log(JSON.stringify(result, null, 2));
            process.exit(0);
        })
        .catch(err => {
            console.error('Error:', err.message);
            process.exit(1);
        });
}
