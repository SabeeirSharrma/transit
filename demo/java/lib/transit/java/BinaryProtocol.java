package transit.java;

import java.io.*;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;

/**
 * Transit Binary Protocol codec.
 *
 * Used by both the server (Java) and client (JS) to encode/decode messages.
 * Protocol is little-endian, version 1.
 *
 * Wire format:
 *   Header:  [version:1][type:1][request_id:4][payload_len:4]
 *   CALL_REQUEST payload:  [fn_name_len:2][fn_name:N][args_len:4][args_json:N]
 *   CALL_RESPONSE payload: [status:1][result_len:4][result_json:N]
 *   HEALTH_PING payload:   empty
 *   HEALTH_PONG payload:   empty
 */
public class BinaryProtocol {

    public static final byte VERSION = 1;

    public static final byte TYPE_CALL_REQUEST  = 0x01;
    public static final byte TYPE_CALL_RESPONSE = 0x02;
    public static final byte TYPE_HEALTH_PING   = 0x03;
    public static final byte TYPE_HEALTH_PONG   = 0x04;

    public static final byte STATUS_OK    = 0;
    public static final byte STATUS_ERROR = 1;

    public static final int HEADER_SIZE = 10;

    /**
     * Encode a CALL_REQUEST message.
     */
    public static byte[] encodeCallRequest(int requestId, String functionName, String argsJson) {
        byte[] fnBytes = functionName.getBytes(StandardCharsets.UTF_8);
        byte[] argsBytes = argsJson.getBytes(StandardCharsets.UTF_8);

        int payloadSize = 2 + fnBytes.length + 4 + argsBytes.length;
        ByteBuffer buf = ByteBuffer.allocate(HEADER_SIZE + payloadSize).order(ByteOrder.LITTLE_ENDIAN);

        // Header
        buf.put(VERSION);
        buf.put(TYPE_CALL_REQUEST);
        buf.putInt(requestId);
        buf.putInt(payloadSize);

        // Payload
        buf.putShort((short) fnBytes.length);
        buf.put(fnBytes);
        buf.putInt(argsBytes.length);
        buf.put(argsBytes);

        return buf.array();
    }

    /**
     * Encode a HEALTH_PING message.
     */
    public static byte[] encodeHealthPing(int requestId) {
        ByteBuffer buf = ByteBuffer.allocate(HEADER_SIZE).order(ByteOrder.LITTLE_ENDIAN);
        buf.put(VERSION);
        buf.put(TYPE_HEALTH_PING);
        buf.putInt(requestId);
        buf.putInt(0);
        return buf.array();
    }

    /**
     * Decode a message header. Returns null if not enough bytes.
     */
    public static MessageHeader decodeHeader(DataInputStream in) throws IOException {
        byte[] header = readExact(in, HEADER_SIZE);
        if (header == null) return null;

        ByteBuffer hdr = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN);
        return new MessageHeader(
            hdr.get(),   // version
            hdr.get(),   // type
            hdr.getInt(), // requestId
            hdr.getInt()  // payloadLen
        );
    }

    /**
     * Read payload bytes after header.
     */
    public static byte[] readPayload(DataInputStream in, int payloadLen) throws IOException {
        return payloadLen > 0 ? readExact(in, payloadLen) : new byte[0];
    }

    /**
     * Decode a CALL_REQUEST payload.
     */
    public static CallRequest decodeCallRequest(byte[] payload) {
        ByteBuffer buf = ByteBuffer.wrap(payload).order(ByteOrder.LITTLE_ENDIAN);
        int fnNameLen = buf.getShort() & 0xFFFF;
        byte[] fnNameBytes = new byte[fnNameLen];
        buf.get(fnNameBytes);
        int argsLen = buf.getInt();
        byte[] argsBytes = new byte[argsLen];
        buf.get(argsBytes);
        return new CallRequest(
            new String(fnNameBytes, StandardCharsets.UTF_8),
            new String(argsBytes, StandardCharsets.UTF_8)
        );
    }

    // ─── Data classes ─────────────────────────────────────────────────────

    public record MessageHeader(byte version, byte type, int requestId, int payloadLen) {}
    public record CallRequest(String functionName, String argsJson) {}

    private static byte[] readExact(DataInputStream in, int len) throws IOException {
        byte[] buf = new byte[len];
        int read = 0;
        while (read < len) {
            int n = in.read(buf, read, len - read);
            if (n < 0) return null;
            read += n;
        }
        return buf;
    }
}
