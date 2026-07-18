# Binary Protocol

The wire format for communication between the Node.js bridge and Java/Python resident processes.

## Overview

- **Transport:** TCP on `127.0.0.1` (loopback only, ephemeral port)
- **Byte order:** Little-endian
- **Protocol version:** 1
- **Message model:** Request-response (each request gets exactly one response)
- **Shared by:** Java and Python bridges (identical protocol)

## Header Format

Every message starts with a 10-byte header:

```
Offset  Size  Field
0       1     version     (always 1)
1       1     type        (message type byte)
2       4     request_id  (uint32 LE — pairs requests with responses)
6       4     payload_len (uint32 LE — byte length of the payload that follows)
```

## Message Types

| Byte | Name | Direction | Payload |
|------|------|-----------|---------|
| `0x01` | CALL_REQUEST | JS → Java/Python | Function call |
| `0x02` | CALL_RESPONSE | Java/Python → JS | Function result |
| `0x03` | HEALTH_PING | JS → Java/Python | Empty |
| `0x04` | HEALTH_PONG | Java/Python → JS | Empty |

## Payload Formats

### CALL_REQUEST (0x01)

```
Offset  Size  Field
0       2     fn_name_len  (uint16 LE — length of function name in bytes)
2       N     fn_name      (UTF-8 function name string)
N+2     4     args_len     (uint32 LE — length of args JSON in bytes)
N+6     M     args_json    (UTF-8 JSON string of arguments)
```

Example — calling `processSpecialized({"id":"test","bytes":[1,2,3]})`:

```
Header (10 bytes):
  01          version = 1
  01          type = CALL_REQUEST
  01 00 00 00 request_id = 1
  22 00 00 00 payload_len = 34

Payload (34 bytes):
  11 00       fn_name_len = 17
  70 72 6F 63 65 73 73 53 70 65 63 69 61 6C 69 7A 65 64
              fn_name = "processSpecialized"
  14 00 00 00 args_len = 20
  7B 22 69 64 22 3A 22 74 65 73 74 22 7D
              args_json = '{"id":"test"}'
```

### CALL_RESPONSE (0x02)

```
Offset  Size  Field
0       1     status      (0 = OK, 1 = error)
1       4     result_len  (int32 LE — length of result string in bytes)
5       N     result      (UTF-8 JSON string — success result or error object)
```

On success:
```json
{"id":"test-001","output":"Java processed 3 bytes","processed":true}
```

On error:
```json
{"error":"Function 'nonexistent' not found. Available: [processSpecialized, getVersion]"}
```

### HEALTH_PING (0x03)

No payload (payload_len = 0).

### HEALTH_PONG (0x04)

No payload (payload_len = 0).

## Complete Message Example

A health check (JS → Java → JS):

**Request:**
```
01 03 00 00 00 00 00 00 00 00
│  │  └────────┘ └────────┘
│  │  request_id=0  payload_len=0
│  type=HEALTH_PING
version=1
```

**Response:**
```
01 04 00 00 00 00 00 00 00 00
│  │  └────────┘ └────────┘
│  │  request_id=0  payload_len=0
│  type=HEALTH_PONG
version=1
```

## Connection Lifecycle

1. Node.js spawns the Java process with `java -cp <classpath> transit.java.TransitService`
2. Java prints `PORT=<port>` to stdout
3. Node.js reads the port and opens a TCP connection to `127.0.0.1:<port>`
4. Node.js sends HEALTH_PING to verify the connection
5. Java responds with HEALTH_PONG
6. Normal operation: CALL_REQUEST/CALL_RESPONSE pairs
7. Health checks run every 5 seconds (configurable)
8. If a health check fails or the connection drops, the Java process auto-restarts

## Error Handling

- **Connection timeout:** 10 seconds (configurable via `connectTimeout`)
- **Call timeout:** 30 seconds per call
- **Health check interval:** 5 seconds (configurable via `healthCheckInterval`)
- **Max restarts:** 3 attempts with exponential backoff (1s, 2s, 3s)
- **Graceful shutdown:** SIGTERM sent, then SIGKILL after 5 seconds

## Security

- The server binds to `127.0.0.1` only — never exposed to the network
- The server rejects non-loopback connections
- Each call has a unique request ID for response matching
- The protocol is not encrypted (not needed for loopback)

## Implementation Notes

### Node.js side (JavaProcessManager)

- Uses `node:net` `createConnection` for TCP
- Binary encoding via `Buffer.writeUInt8/16LE/32LE`
- Response handler processes a buffered stream, reading complete messages
- Pending calls tracked in a `Map<number, PendingCall>` with timeout timers

### Java side (TransitServer)

- Uses `java.net.ServerSocket` and `java.net.Socket`
- Binary decoding via `java.nio.ByteBuffer` with `LITTLE_ENDIAN` order
- One thread per client connection (via `ExecutorService`)
- Functions registered in a `ConcurrentHashMap`
- Shutdown hook calls `server.stop()` on JVM exit

### Python side (transit_server.py)

- Uses stdlib `socket`, `struct`, `json`, `threading`
- Binary decoding via `struct.unpack` with little-endian format
- One thread per client connection (via `concurrent.futures.ThreadPoolExecutor`)
- Functions registered in a plain `dict`
- Same protocol as Java — identical message format and flow
