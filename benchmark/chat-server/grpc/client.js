#!/usr/bin/env node
/**
 * gRPC client for chat server benchmark.
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
const chatserver = protoDescriptor.chatserver;

const client = new chatserver.ChatService(
    'localhost:50052',
    grpc.credentials.createInsecure()
);

function sendMessage(channelId, userId, content, timestamp) {
    return new Promise((resolve, reject) => {
        const start = performance.now();
        
        client.SendMessage({
            channel_id: channelId,
            user_id: userId,
            content: content,
            timestamp: timestamp || Date.now()
        }, (err, response) => {
            if (err) {
                reject(err);
                return;
            }
            
            const end = performance.now();
            
            resolve({
                message_id: response.message_id,
                delivered: response.delivered,
                execution_time_ms: response.execution_time_ms,
                total_time_ms: end - start
            });
        });
    });
}

function validateSession(sessionToken) {
    return new Promise((resolve, reject) => {
        const start = performance.now();
        
        client.ValidateSession({
            session_token: sessionToken
        }, (err, response) => {
            if (err) {
                reject(err);
                return;
            }
            
            const end = performance.now();
            
            resolve({
                valid: response.valid,
                user_id: response.user_id,
                execution_time_ms: response.execution_time_ms,
                total_time_ms: end - start
            });
        });
    });
}

function moderateContent(content, userId) {
    return new Promise((resolve, reject) => {
        const start = performance.now();
        
        client.ModerateContent({
            content: content,
            user_id: userId
        }, (err, response) => {
            if (err) {
                reject(err);
                return;
            }
            
            const end = performance.now();
            
            resolve({
                safe: response.safe,
                toxicity_score: response.toxicity_score,
                reason: response.reason,
                execution_time_ms: response.execution_time_ms,
                total_time_ms: end - start
            });
        });
    });
}

function routeMessage(messageId, recipientIds) {
    return new Promise((resolve, reject) => {
        const start = performance.now();
        
        client.RouteMessage({
            message_id: messageId,
            recipient_ids: recipientIds
        }, (err, response) => {
            if (err) {
                reject(err);
                return;
            }
            
            const end = performance.now();
            
            resolve({
                delivered_count: response.delivered_count,
                execution_time_ms: response.execution_time_ms,
                total_time_ms: end - start
            });
        });
    });
}

function searchMessages(query, channelId, limit) {
    return new Promise((resolve, reject) => {
        const start = performance.now();
        
        client.SearchMessages({
            query: query,
            channel_id: channelId,
            limit: limit || 10
        }, (err, response) => {
            if (err) {
                reject(err);
                return;
            }
            
            const end = performance.now();
            
            resolve({
                results: response.results,
                execution_time_ms: response.execution_time_ms,
                total_time_ms: end - start
            });
        });
    });
}

function getAnalytics(eventType, timeRangeHours) {
    return new Promise((resolve, reject) => {
        const start = performance.now();
        
        client.GetAnalytics({
            event_type: eventType,
            time_range_hours: timeRangeHours || 24
        }, (err, response) => {
            if (err) {
                reject(err);
                return;
            }
            
            const end = performance.now();
            
            resolve({
                event_count: response.event_count,
                breakdown: response.breakdown,
                execution_time_ms: response.execution_time_ms,
                total_time_ms: end - start
            });
        });
    });
}

function getUser(userId) {
    return new Promise((resolve, reject) => {
        const start = performance.now();
        
        client.GetUser({
            user_id: userId
        }, (err, response) => {
            if (err) {
                reject(err);
                return;
            }
            
            const end = performance.now();
            
            resolve({
                user_id: response.user_id,
                username: response.username,
                email: response.email,
                execution_time_ms: response.execution_time_ms,
                total_time_ms: end - start
            });
        });
    });
}

function getChannelHistory(channelId, limit, beforeMessageId) {
    return new Promise((resolve, reject) => {
        const start = performance.now();
        
        client.GetChannelHistory({
            channel_id: channelId,
            limit: limit || 50,
            before_message_id: beforeMessageId || ""
        }, (err, response) => {
            if (err) {
                reject(err);
                return;
            }
            
            const end = performance.now();
            
            resolve({
                messages: response.messages,
                execution_time_ms: response.execution_time_ms,
                total_time_ms: end - start
            });
        });
    });
}

// Export for use in benchmark runner
module.exports = {
    sendMessage,
    validateSession,
    moderateContent,
    routeMessage,
    searchMessages,
    getAnalytics,
    getUser,
    getChannelHistory
};

// CLI interface
if (require.main === module) {
    const operation = process.argv[2];
    const payload = JSON.parse(process.argv[3] || '{}');
    
    let promise;
    switch (operation) {
        case 'sendMessage':
            promise = sendMessage(payload.channel_id, payload.user_id, payload.content, payload.timestamp);
            break;
        case 'validateSession':
            promise = validateSession(payload.session_token);
            break;
        case 'moderateContent':
            promise = moderateContent(payload.content, payload.user_id);
            break;
        case 'routeMessage':
            promise = routeMessage(payload.message_id, payload.recipient_ids);
            break;
        case 'searchMessages':
            promise = searchMessages(payload.query, payload.channel_id, payload.limit);
            break;
        case 'getAnalytics':
            promise = getAnalytics(payload.event_type, payload.time_range_hours);
            break;
        case 'getUser':
            promise = getUser(payload.user_id);
            break;
        case 'getChannelHistory':
            promise = getChannelHistory(payload.channel_id, payload.limit, payload.before_message_id);
            break;
        default:
            console.error('Unknown operation:', operation);
            process.exit(1);
    }
    
    promise
        .then(result => {
            console.log(JSON.stringify(result, null, 2));
            process.exit(0);
        })
        .catch(err => {
            console.error('Error:', err.message);
            process.exit(1);
        });
}
