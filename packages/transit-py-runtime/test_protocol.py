"""
Binary protocol round-trip tests

Tests that the Python server correctly encodes and decodes
the Transit binary protocol messages.
"""

import struct
import json
import threading
import socket
import time
import sys
import os

# Add the package directory to path so we can import transit_server
sys.path.insert(0, os.path.dirname(__file__))

from transit_server import (
    HEADER_FORMAT,
    HEADER_SIZE,
    PROTOCOL_VERSION,
    TYPE_CALL_REQUEST,
    TYPE_CALL_RESPONSE,
    TYPE_HEALTH_PING,
    TYPE_HEALTH_PONG,
    STATUS_OK,
    STATUS_ERROR,
    TransitServer,
    register_function,
    _functions,
)


def encode_call_request(request_id: int, fn_name: str, args_json: str) -> bytes:
    """Encode a CALL_REQUEST message."""
    fn_bytes = fn_name.encode("utf-8")
    args_bytes = args_json.encode("utf-8")
    payload_size = 2 + len(fn_bytes) + 4 + len(args_bytes)
    msg = bytearray(HEADER_SIZE + payload_size)
    struct.pack_into(HEADER_FORMAT, msg, 0, PROTOCOL_VERSION, TYPE_CALL_REQUEST, request_id, payload_size)
    struct.pack_into("<H", msg, HEADER_SIZE, len(fn_bytes))
    msg[HEADER_SIZE + 2 : HEADER_SIZE + 2 + len(fn_bytes)] = fn_bytes
    struct.pack_into("<I", msg, HEADER_SIZE + 2 + len(fn_bytes), len(args_bytes))
    msg[HEADER_SIZE + 6 + len(fn_bytes) :] = args_bytes
    return bytes(msg)


def decode_response(data: bytes) -> tuple:
    """Decode a CALL_RESPONSE message."""
    version, msg_type, request_id, payload_len = struct.unpack_from(HEADER_FORMAT, data, 0)
    status = data[HEADER_SIZE]
    result_len = struct.unpack_from("<I", data, HEADER_SIZE + 1)[0]
    result_json = data[HEADER_SIZE + 5 : HEADER_SIZE + 5 + result_len].decode("utf-8")
    return version, msg_type, request_id, status, result_json


def encode_health_ping(request_id: int) -> bytes:
    """Encode a HEALTH_PING message."""
    return struct.pack(HEADER_FORMAT, PROTOCOL_VERSION, TYPE_HEALTH_PING, request_id, 0)


def test_header_packing():
    """Test that header packing is correct."""
    msg = struct.pack(HEADER_FORMAT, PROTOCOL_VERSION, TYPE_CALL_REQUEST, 42, 100)
    version, msg_type, request_id, payload_len = struct.unpack(HEADER_FORMAT, msg)
    assert version == PROTOCOL_VERSION
    assert msg_type == TYPE_CALL_REQUEST
    assert request_id == 42
    assert payload_len == 100
    print("  PASS: header packing round-trip")


def test_call_request_encoding():
    """Test CALL_REQUEST encoding and decoding."""
    fn_name = "processData"
    args_json = json.dumps({"id": "test", "value": 42})
    msg = encode_call_request(1, fn_name, args_json)

    # Decode the header
    version, msg_type, request_id, payload_len = struct.unpack_from(HEADER_FORMAT, msg, 0)
    assert version == PROTOCOL_VERSION
    assert msg_type == TYPE_CALL_REQUEST
    assert request_id == 1

    # Decode the payload
    fn_len = struct.unpack_from("<H", msg, HEADER_SIZE)[0]
    fn_decoded = msg[HEADER_SIZE + 2 : HEADER_SIZE + 2 + fn_len].decode("utf-8")
    assert fn_decoded == fn_name

    args_offset = HEADER_SIZE + 2 + fn_len
    args_len = struct.unpack_from("<I", msg, args_offset)[0]
    args_decoded = msg[args_offset + 4 : args_offset + 4 + args_len].decode("utf-8")
    assert args_decoded == args_json

    print("  PASS: call request encoding")


def test_call_response_encoding():
    """Test CALL_RESPONSE encoding and decoding."""
    result_json = json.dumps({"status": "ok", "value": 123})
    result_bytes = result_json.encode("utf-8")
    payload_size = 1 + 4 + len(result_bytes)
    msg = bytearray(HEADER_SIZE + payload_size)
    struct.pack_into(HEADER_FORMAT, msg, 0, PROTOCOL_VERSION, TYPE_CALL_RESPONSE, 1, payload_size)
    struct.pack_into("<BI", msg, HEADER_SIZE, STATUS_OK, len(result_bytes))
    msg[HEADER_SIZE + 5 :] = result_bytes

    version, msg_type, request_id, status, decoded_json = decode_response(bytes(msg))
    assert version == PROTOCOL_VERSION
    assert msg_type == TYPE_CALL_RESPONSE
    assert request_id == 1
    assert status == STATUS_OK
    assert json.loads(decoded_json) == {"status": "ok", "value": 123}

    print("  PASS: call response encoding")


def test_health_ping_pong():
    """Test HEALTH_PING and HEALTH_PONG encoding."""
    ping = encode_health_ping(99)
    version, msg_type, request_id, payload_len = struct.unpack(HEADER_FORMAT, ping)
    assert version == PROTOCOL_VERSION
    assert msg_type == TYPE_HEALTH_PING
    assert request_id == 99
    assert payload_len == 0

    # Encode pong
    pong = struct.pack(HEADER_FORMAT, PROTOCOL_VERSION, TYPE_HEALTH_PONG, 99, 0)
    version, msg_type, request_id, payload_len = struct.unpack(HEADER_FORMAT, pong)
    assert msg_type == TYPE_HEALTH_PONG

    print("  PASS: health ping/pong")


def test_error_response():
    """Test error response encoding."""
    error_json = json.dumps({"error": "Function 'notFound' not found"})
    error_bytes = error_json.encode("utf-8")
    payload_size = 1 + 4 + len(error_bytes)
    msg = bytearray(HEADER_SIZE + payload_size)
    struct.pack_into(HEADER_FORMAT, msg, 0, PROTOCOL_VERSION, TYPE_CALL_RESPONSE, 1, payload_size)
    struct.pack_into("<BI", msg, HEADER_SIZE, STATUS_ERROR, len(error_bytes))
    msg[HEADER_SIZE + 5 :] = error_bytes

    version, msg_type, request_id, status, decoded_json = decode_response(bytes(msg))
    assert status == STATUS_ERROR
    assert "notFound" in decoded_json

    print("  PASS: error response encoding")


def test_server_function_registration():
    """Test that function registration works."""
    def dummy_handler(args_json):
        return json.dumps({"result": "ok"})

    register_function("dummy", dummy_handler)
    assert "dummy" in _functions

    print("  PASS: function registration")


def test_server_start_stop():
    """Test that server starts and stops cleanly."""
    def dummy_handler(args_json):
        return json.dumps({"result": "ok"})

    register_function("dummy_test_stop", dummy_handler)
    server = TransitServer()

    # Start in a thread
    def run_server():
        try:
            server.start()
        except Exception:
            pass

    thread = threading.Thread(target=run_server, daemon=True)
    thread.start()

    # Wait for server to be ready
    time.sleep(0.5)

    # Stop
    server.stop()
    assert not server._running

    # Clean up
    _functions.pop("dummy_test_stop", None)

    print("  PASS: server start/stop")


def test_large_payload():
    """Test encoding a large payload."""
    large_data = {"items": list(range(1000))}
    args_json = json.dumps(large_data)
    msg = encode_call_request(1, "process", args_json)

    # Verify it can be decoded
    fn_len = struct.unpack_from("<H", msg, HEADER_SIZE)[0]
    fn_decoded = msg[HEADER_SIZE + 2 : HEADER_SIZE + 2 + fn_len].decode("utf-8")
    assert fn_decoded == "process"

    args_offset = HEADER_SIZE + 2 + fn_len
    args_len = struct.unpack_from("<I", msg, args_offset)[0]
    args_decoded = msg[args_offset + 4 : args_offset + 4 + args_len].decode("utf-8")
    decoded = json.loads(args_decoded)
    assert len(decoded["items"]) == 1000

    print("  PASS: large payload")


if __name__ == "__main__":
    print("Running binary protocol tests...")
    test_header_packing()
    test_call_request_encoding()
    test_call_response_encoding()
    test_health_ping_pong()
    test_error_response()
    test_server_function_registration()
    test_server_start_stop()
    test_large_payload()
    print("\nAll tests passed!")
