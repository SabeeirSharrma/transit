#!/usr/bin/env node
/**
 * Unix domain socket client for chat server benchmark.
 * Usage: node unix-client.js <operation> <payload>
 */

const net = require('net');

const SOCKET_PATH = '/tmp/transit_chat_benchmark.sock';

function sendRequest(operation, payload) {
    return new Promise((resolve, reject) => {
        const start = performance.now();
        
        const client = net.createConnection(SOCKET_PATH, () => {
            const request = {
                operation: operation,
                payload: payload
            };
            const requestData = JSON.stringify(request);
            const requestBuffer = Buffer.from(requestData);
            
            // Send length prefix
            const lengthBuffer = Buffer.alloc(4);
            lengthBuffer.writeUInt32BE(requestBuffer.length, 0);
            client.write(lengthBuffer);
            
            // Send data
            client.write(requestBuffer);
        });
        
        let responseData = Buffer.alloc(0);
        let responseLength = 0;
        let responseReceived = 0;
        
        client.on('data', (chunk) => {
            if (responseLength === 0 && chunk.length >= 4) {
                responseLength = chunk.readUInt32BE(0);
                responseData = chunk.slice(4);
                responseReceived = responseData.length;
            } else {
                responseData = Buffer.concat([responseData, chunk]);
                responseReceived = responseData.length;
            }
            
            if (responseReceived >= responseLength) {
                client.end();
                const end = performance.now();
                
                try {
                    const response = JSON.parse(responseData.toString());
                    resolve({
                        result: response.result,
                        execution_time_ms: response.execution_time_ms,
                        total_time_ms: end - start
                    });
                } catch (err) {
                    reject(new Error(`Failed to parse response: ${err.message}`));
                }
            }
        });
        
        client.on('error', (err) => {
            reject(err);
        });
        
        client.on('end', () => {
            if (responseReceived < responseLength) {
                reject(new Error('Connection closed before receiving full response'));
            }
        });
        
        // Set timeout
        setTimeout(() => {
            client.destroy();
            reject(new Error('Request timeout'));
        }, 30000);
    });
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
