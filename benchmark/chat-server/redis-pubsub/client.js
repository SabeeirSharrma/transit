#!/usr/bin/env node
/**
 * Redis Pub/Sub client for chat server benchmark.
 * Usage: node redis-client.js <operation> <payload>
 */

const Redis = require('ioredis');

const REDIS_URL = 'redis://localhost:6379';

class RedisPubSubClient {
    constructor() {
        this.publisher = new Redis(REDIS_URL);
        this.subscriber = new Redis(REDIS_URL);
        this.pendingRequests = new Map();
        this.requestId = 0;
    }

    async start() {
        await this.subscriber.subscribe('benchmark.response');
        
        this.subscriber.on('message', (channel, message) => {
            if (channel === 'benchmark.response') {
                try {
                    const response = JSON.parse(message);
                    const pending = this.pendingRequests.get(response.id);
                    if (pending) {
                        pending.resolve(response);
                        this.pendingRequests.delete(response.id);
                    }
                } catch (err) {
                    console.error('Failed to parse response:', err);
                }
            }
        });
    }

    async stop() {
        await this.publisher.quit();
        await this.subscriber.quit();
    }

    async sendRequest(operation, payload) {
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

            // Publish request
            this.publisher.publish('benchmark.request', JSON.stringify(request));
        });
    }
}

// Export for use in benchmark runner
module.exports = { RedisPubSubClient };

// CLI interface
if (require.main === module) {
    const client = new RedisPubSubClient();
    const operation = process.argv[2];
    const payload = JSON.parse(process.argv[3] || '{}');

    client.start()
        .then(() => client.sendRequest(operation, payload))
        .then(result => {
            console.log(JSON.stringify(result, null, 2));
            return client.stop();
        })
        .then(() => process.exit(0))
        .catch(err => {
            console.error('Error:', err.message);
            client.stop().then(() => process.exit(1));
        });
}
