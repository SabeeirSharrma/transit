# Binary Protocol (Advanced / Contributors)

> **This document is for advanced users and contributors.** Most users do not need to read this — Transit handles all communication automatically. If you are just getting started, see [Getting Started](getting-started.md) instead.

This page describes the wire format Transit uses to communicate between JavaScript and Java/Python. You do not need to read this to use Transit — it is for contributors and advanced users who want to understand how the communication works.

## Overview

When JavaScript calls a Python or Java function, it sends a small binary message over a network connection. Here are the key facts:

- **Transport:** TCP on `127.0.0.1` (your computer only, not the internet)
- **Byte order:** Little-endian (the standard for most computers)
- **Protocol version:** 1
- **Message model:** Request-response (each request gets exactly one response)
- **Shared by:** Java and Python bridges (identical protocol)

## Header Format

Every message starts with a 10-byte header:

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| 0 | 1 | version | Always 1 |
| 1 | 1 | type | Message type (see below) |
| 2 | 4 | request_id | Pairs requests with responses |
| 6 | 4 | payload_len | Length of the payload that follows |

## Message Types

| Byte | Name | Direction | What it does |
|------|------|-----------|--------------|
| 0x01 | CALL_REQUEST | JS -> Java/Python | "Please call this function" |
| 0x02 | CALL_RESPONSE | Java/Python -> JS | "Here is the result" |
| 0x03 | HEALTH_PING | JS -> Java/Python | "Are you still alive?" |
| 0x04 | HEALTH_PONG | Java/Python -> JS | "Yes, I am here" |

## What a Function Call Looks Like

When JavaScript calls `processData({"items": [1, 2, 3]})`:

1. **JavaScript sends:**
   - Header: version=1, type=CALL_REQUEST, request_id=1, payload_len=34
   - Payload: function name "processData" + arguments JSON

2. **Python/Java receives:**
   - Reads the header
   - Finds the function "processData"
   - Calls it with the arguments
   - Gets the result

3. **Python/Java sends back:**
   - Header: version=1, type=CALL_RESPONSE, request_id=1, payload_len=...
   - Payload: status=OK + result JSON

4. **JavaScript receives:**
   - Matches the request_id
   - Returns the result to your code

## Health Checks

Every 5 seconds, JavaScript sends a HEALTH_PING to make sure the Java/Python process is still running. If it does not respond, Transit restarts the process.

## Connection Lifecycle

1. JavaScript starts the Java/Python process
2. The process prints its port number to the console
3. JavaScript connects to that port
4. JavaScript sends a health check to verify the connection
5. Normal operation: function calls and responses
6. If the process crashes, JavaScript restarts it automatically

## Error Handling

- **Connection timeout:** 10 seconds
- **Call timeout:** 30 seconds per call
- **Health check interval:** 5 seconds
- **Max restarts:** 3 attempts with exponential backoff (1s, 2s, 3s)
- **Graceful shutdown:** SIGTERM sent, then SIGKILL after 5 seconds

## Security

- The server binds to `127.0.0.1` only — never exposed to the network
- The server rejects non-loopback connections
- Each call has a unique request ID for response matching
- The protocol is not encrypted (not needed for loopback)
