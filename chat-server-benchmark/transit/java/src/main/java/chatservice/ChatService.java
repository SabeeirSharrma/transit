package chatservice;

import java.io.*;
import java.net.*;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * Chat server benchmark — Java service for persistence and session operations.
 * Simulates: user store, session management, message persistence, read receipts.
 */
public class ChatService {

    // ─── Protocol constants ───────────────────────────────────────────────

    static final byte PROTOCOL_VERSION = 1;
    static final byte TYPE_CALL_REQUEST  = 0x01;
    static final byte TYPE_CALL_RESPONSE = 0x02;
    static final byte TYPE_HEALTH_PING   = 0x03;
    static final byte TYPE_HEALTH_PONG   = 0x04;
    static final int  STATUS_OK   = 0;
    static final int  STATUS_ERROR = 1;
    static final int  HEADER_SIZE = 10;

    // ─── In-memory stores (simulates a real persistence layer) ────────────

    static final ConcurrentHashMap<String, String> users = new ConcurrentHashMap<>();
    static final ConcurrentHashMap<String, String> sessions = new ConcurrentHashMap<>();
    static final ConcurrentHashMap<String, String> messages = new ConcurrentHashMap<>();
    static final ConcurrentHashMap<String, Integer> unreadCounts = new ConcurrentHashMap<>();

    static {
        // Pre-populate with simulated data
        for (int i = 0; i < 10000; i++) {
            users.put("user_" + i, "{\"id\":\"user_" + i + "\",\"name\":\"User " + i + "\",\"email\":\"user" + i + "@example.com\"}");
        }
        for (int i = 0; i < 5000; i++) {
            sessions.put("session_" + i, "{\"user_id\":\"user_" + (i % 10000) + "\",\"ttl\":3600}");
        }
        for (int i = 0; i < 50000; i++) {
            messages.put("msg_" + i, "{\"id\":\"msg_" + i + "\",\"channel\":\"ch_" + (i % 100) + "\",\"content\":\"Message " + i + "\"}");
            unreadCounts.put("user_" + (i % 10000) + ":ch_" + (i % 100), i % 50);
        }
    }

    // ─── User Lookup ──────────────────────────────────────────────────────

    static String lookupUser(String argsJson) throws Exception {
        long start = System.nanoTime();

        // Parse args
        String userId = extractJsonString(argsJson, "user_id");

        // Lookup in store
        String userData = users.get(userId);
        if (userData == null) {
            return "{\"error\":\"User not found\",\"user_id\":\"" + userId + "\"}";
        }

        // Simulate enrichment (fetching additional data, computing permissions)
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        md.update(userId.getBytes(StandardCharsets.UTF_8));
        byte[] hash = md.digest();
        String hashHex = bytesToHex(hash);

        double elapsed = (System.nanoTime() - start) / 1_000_000.0;

        return "{\"user\":" + userData + ",\"permission_hash\":\"" + hashHex + "\",\"lookup_time_ms\":" + elapsed + "}";
    }

    // ─── Session Management ───────────────────────────────────────────────

    static String createSession(String argsJson) throws Exception {
        long start = System.nanoTime();

        String userId = extractJsonString(argsJson, "user_id");

        // Generate session token
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        md.update((userId + System.nanoTime()).getBytes(StandardCharsets.UTF_8));
        String token = bytesToHex(md.digest());

        // Store session
        sessions.put(token, "{\"user_id\":\"" + userId + "\",\"ttl\":3600}");

        double elapsed = (System.nanoTime() - start) / 1_000_000.0;

        return "{\"token\":\"" + token + "\",\"user_id\":\"" + userId + "\",\"ttl\":3600,\"create_time_ms\":" + elapsed + "}";
    }

    static String validateSession(String argsJson) throws Exception {
        long start = System.nanoTime();

        String token = extractJsonString(argsJson, "token");

        String sessionData = sessions.get(token);
        boolean valid = sessionData != null;

        double elapsed = (System.nanoTime() - start) / 1_000_000.0;

        return "{\"valid\":" + valid + ",\"token\":\"" + token + "\",\"validate_time_ms\":" + elapsed + "}";
    }

    // ─── Message Persistence ──────────────────────────────────────────────

    static String persistMessage(String argsJson) throws Exception {
        long start = System.nanoTime();

        String msgId = extractJsonString(argsJson, "id");
        String channelId = extractJsonString(argsJson, "channel_id");
        String content = extractJsonString(argsJson, "content");

        // Simulate writing to storage
        String msgJson = "{\"id\":\"" + msgId + "\",\"channel\":\"" + channelId + "\",\"content\":\"" + content + "\"}";
        messages.put(msgId, msgJson);

        // Update unread counts for channel members (simulated)
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        md.update(msgId.getBytes(StandardCharsets.UTF_8));
        String stored = bytesToHex(md.digest());

        double elapsed = (System.nanoTime() - start) / 1_000_000.0;

        return "{\"persisted\":true,\"msg_id\":\"" + msgId + "\",\"storage_ref\":\"" + stored + "\",\"persist_time_ms\":" + elapsed + "}";
    }

    // ─── Read Receipt Processing ──────────────────────────────────────────

    static String processReadReceipt(String argsJson) throws Exception {
        long start = System.nanoTime();

        String userId = extractJsonString(argsJson, "user_id");
        String channelId = extractJsonString(argsJson, "channel_id");
        String lastReadMsgId = extractJsonString(argsJson, "last_read_msg_id");

        // Update unread count
        String key = userId + ":" + channelId;
        Integer current = unreadCounts.getOrDefault(key, 0);
        int newCount = Math.max(0, current - 5); // simulate reducing unread
        unreadCounts.put(key, newCount);

        // Compute delta
        int delta = newCount - current;

        double elapsed = (System.nanoTime() - start) / 1_000_000.0;

        return "{\"user_id\":\"" + userId + "\",\"channel_id\":\"" + channelId + "\",\"unread_count\":" + newCount + ",\"delta\":" + delta + ",\"process_time_ms\":" + elapsed + "}";
    }

    // ─── Channel History ──────────────────────────────────────────────────

    static String getChannelHistory(String argsJson) throws Exception {
        long start = System.nanoTime();

        String channelId = extractJsonString(argsJson, "channel_id");
        int limit = extractJsonInt(argsJson, "limit", 50);

        // Simulate fetching messages from storage
        List<String> history = new ArrayList<>();
        for (int i = 0; i < Math.min(limit, 100); i++) {
            String msgId = "msg_" + (i * 100);
            String msg = messages.get(msgId);
            if (msg != null) {
                history.add(msg);
            }
        }

        double elapsed = (System.nanoTime() - start) / 1_000_000.0;

        StringBuilder sb = new StringBuilder();
        sb.append("{\"channel_id\":\"").append(channelId).append("\",\"messages\":[");
        for (int i = 0; i < history.size(); i++) {
            if (i > 0) sb.append(",");
            sb.append(history.get(i));
        }
        sb.append("],\"count\":").append(history.size());
        sb.append(",\"fetch_time_ms\":").append(elapsed);
        sb.append("}");

        return sb.toString();
    }

    // ─── User Search ──────────────────────────────────────────────────────

    static String searchUsers(String argsJson) throws Exception {
        long start = System.nanoTime();

        String query = extractJsonString(argsJson, "query").toLowerCase();
        int limit = extractJsonInt(argsJson, "limit", 20);

        // Simulate search with scoring
        List<Map<String, Object>> results = new ArrayList<>();
        int count = 0;

        for (Map.Entry<String, String> entry : users.entrySet()) {
            if (count >= limit) break;

            String userId = entry.getKey();
            String userData = entry.getValue();

            if (userId.toLowerCase().contains(query) || userData.toLowerCase().contains(query)) {
                double score = userId.toLowerCase().contains(query) ? 1.0 : 0.5;
                Map<String, Object> result = new HashMap<>();
                result.put("user_id", userId);
                result.put("score", score);
                results.add(result);
                count++;
            }
        }

        // Sort by score
        results.sort((a, b) -> Double.compare((double) b.get("score"), (double) a.get("score")));

        double elapsed = (System.nanoTime() - start) / 1_000_000.0;

        StringBuilder sb = new StringBuilder();
        sb.append("{\"query\":\"").append(query).append("\",\"results\":[");
        for (int i = 0; i < results.size(); i++) {
            if (i > 0) sb.append(",");
            Map<String, Object> r = results.get(i);
            sb.append("{\"user_id\":\"").append(r.get("user_id")).append("\",\"score\":").append(r.get("score")).append("}");
        }
        sb.append("],\"total\":").append(results.size());
        sb.append(",\"search_time_ms\":").append(elapsed);
        sb.append("}");

        return sb.toString();
    }

    // ─── Helpers ──────────────────────────────────────────────────────────

    static String extractJsonString(String json, String key) {
        String search = "\"" + key + "\":\"";
        int start = json.indexOf(search);
        if (start == -1) return "";
        start += search.length();
        int end = json.indexOf("\"", start);
        if (end == -1) return "";
        return json.substring(start, end);
    }

    static int extractJsonInt(String json, String key, int defaultVal) {
        String search = "\"" + key + "\":";
        int start = json.indexOf(search);
        if (start == -1) return defaultVal;
        start += search.length();
        int end = start;
        while (end < json.length() && Character.isDigit(json.charAt(end))) end++;
        if (end == start) return defaultVal;
        return Integer.parseInt(json.substring(start, end));
    }

    static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }

    // ─── Server ───────────────────────────────────────────────────────────

    public static void main(String[] args) throws Exception {
        ServerSocket serverSocket = new ServerSocket(0);
        int port = serverSocket.getLocalPort();

        System.out.println("PORT=" + port);
        System.out.flush();

        ExecutorService executor = Executors.newFixedThreadPool(32);

        System.err.println("[chat-java] Server listening on 127.0.0.1:" + port);

        while (true) {
            Socket client = serverSocket.accept();
            if (!client.getInetAddress().getHostAddress().equals("127.0.0.1")) {
                client.close();
                continue;
            }
            executor.submit(() -> handleClient(client));
        }
    }

    static void handleClient(Socket client) {
        try {
            client.setTcpNoDelay(true);
            InputStream in = client.getInputStream();
            OutputStream out = client.getOutputStream();

            while (true) {
                // Read header
                byte[] header = readExact(in, HEADER_SIZE);
                if (header == null) break;

                ByteBuffer buf = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN);
                byte version = buf.get();
                byte msgType = buf.get();
                int requestId = buf.getInt();
                int payloadLen = buf.getInt();

                if (version != PROTOCOL_VERSION) break;

                byte[] payload = payloadLen > 0 ? readExact(in, payloadLen) : new byte[0];

                if (msgType == TYPE_CALL_REQUEST) {
                    handleCall(payload, requestId, out);
                } else if (msgType == TYPE_HEALTH_PING) {
                    byte[] resp = ByteBuffer.allocate(HEADER_SIZE).order(ByteOrder.LITTLE_ENDIAN)
                        .put(PROTOCOL_VERSION)
                        .put(TYPE_HEALTH_PONG)
                        .putInt(requestId)
                        .putInt(0)
                        .array();
                    out.write(resp);
                    out.flush();
                }
            }
        } catch (Exception e) {
            // Client disconnected
        } finally {
            try { client.close(); } catch (Exception ignored) {}
        }
    }

    static void handleCall(byte[] payload, int requestId, OutputStream out) throws Exception {
        ByteBuffer buf = ByteBuffer.wrap(payload).order(ByteOrder.LITTLE_ENDIAN);
        short fnNameLen = buf.getShort();
        byte[] fnNameBytes = new byte[fnNameLen];
        buf.get(fnNameBytes);
        String fnName = new String(fnNameBytes, StandardCharsets.UTF_8);

        int argsLen = buf.getInt();
        byte[] argsBytes = new byte[argsLen];
        buf.get(argsBytes);
        String argsJson = new String(argsBytes, StandardCharsets.UTF_8);

        String resultJson;
        int status;

        try {
            resultJson = dispatch(fnName, argsJson);
            status = STATUS_OK;
        } catch (Exception e) {
            resultJson = "{\"error\":\"" + e.getMessage() + "\"}";
            status = STATUS_ERROR;
        }

        byte[] resultBytes = resultJson.getBytes(StandardCharsets.UTF_8);
        byte[] resp = ByteBuffer.allocate(HEADER_SIZE + 1 + 4 + resultBytes.length).order(ByteOrder.LITTLE_ENDIAN)
            .put(PROTOCOL_VERSION)
            .put(TYPE_CALL_RESPONSE)
            .putInt(requestId)
            .putInt(1 + 4 + resultBytes.length)
            .put((byte) status)
            .putInt(resultBytes.length)
            .put(resultBytes)
            .array();
        out.write(resp);
        out.flush();
    }

    static String dispatch(String fnName, String argsJson) throws Exception {
        switch (fnName) {
            case "lookupUser": return lookupUser(argsJson);
            case "createSession": return createSession(argsJson);
            case "validateSession": return validateSession(argsJson);
            case "persistMessage": return persistMessage(argsJson);
            case "processReadReceipt": return processReadReceipt(argsJson);
            case "getChannelHistory": return getChannelHistory(argsJson);
            case "searchUsers": return searchUsers(argsJson);
            default: throw new IllegalArgumentException("Unknown function: " + fnName);
        }
    }

    static byte[] readExact(InputStream in, int n) throws IOException {
        byte[] data = new byte[n];
        int offset = 0;
        while (offset < n) {
            int read = in.read(data, offset, n - offset);
            if (read == -1) return null;
            offset += read;
        }
        return data;
    }
}
