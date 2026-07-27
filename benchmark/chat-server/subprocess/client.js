#!/usr/bin/env node
/**
 * Subprocess client for chat server benchmark.
 * Spawns a Python subprocess and communicates via stdin/stdout.
 */

const { spawn } = require('child_process');
const path = require('path');

const SERVER_PATH = path.join(__dirname, 'server.py');

class SubprocessClient {
    constructor() {
        this.process = null;
        this.requestId = 0;
        this.pendingRequests = new Map();
    }

    start() {
        return new Promise((resolve, reject) => {
            this.process = spawn('python3', [SERVER_PATH], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            this.process.on('error', (err) => {
                reject(err);
            });

            this.process.on('exit', (code) => {
                if (code !== 0) {
                    reject(new Error(`Server exited with code ${code}`));
                }
            });

            // Handle stdout (responses)
            let buffer = '';
            this.process.stdout.on('data', (data) => {
                buffer += data.toString();
                
                // Process complete lines
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const response = JSON.parse(line);
                            const pending = this.pendingRequests.get(response.id);
                            if (pending) {
                                pending.resolve(response);
                                this.pendingRequests.delete(response.id);
                            }
                        } catch (err) {
                            console.error('Failed to parse response:', err);
                        }
                    }
                }
            });

            // Handle stderr (errors)
            this.process.stderr.on('data', (data) => {
                console.error('Server stderr:', data.toString());
            });

            // Wait a bit for server to start
            setTimeout(resolve, 100);
        });
    }

    stop() {
        if (this.process) {
            this.process.stdin.end();
            this.process.kill();
            this.process = null;
        }
    }

    sendRequest(operation, payload) {
        return new Promise((resolve, reject) => {
            const start = performance.now();
            const requestId = ++this.requestId;

            const request = {
                id: requestId,
                operation: operation,
                payload: payload
            };

            this.pendingRequests.set(requestId, {
                resolve: (response) => {
                    const end = performance.now();
                    resolve({
                        result: response.result,
                        execution_time_ms: response.execution_time_ms,
                        total_time_ms: end - start
                    });
                },
                reject: reject
            });

            // Send request to stdin
            this.process.stdin.write(JSON.stringify(request) + '\n');
        });
    }
}

// Export for use in benchmark runner
module.exports = { SubprocessClient };

// CLI interface
if (require.main === module) {
    const client = new SubprocessClient();
    const operation = process.argv[2];
    const payload = JSON.parse(process.argv[3] || '{}');

    client.start()
        .then(() => client.sendRequest(operation, payload))
        .then(result => {
            console.log(JSON.stringify(result, null, 2));
            client.stop();
            process.exit(0);
        })
        .catch(err => {
            console.error('Error:', err.message);
            client.stop();
            process.exit(1);
        });
}
