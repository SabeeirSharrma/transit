package chatservice;

import java.io.*;
import java.net.*;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.concurrent.locks.ReentrantLock;

public class ChatService {

    // ─── Protocol constants ───────────────────────────────────────────────

    static final byte PROTOCOL_VERSION = 1;
    static final byte TYPE_CALL_REQUEST  = 0x01;
    static final byte TYPE_CALL_RESPONSE = 0x02;
    static final byte TYPE_HEALTH_PING   = 0x03;
    static final byte TYPE_HEALTH_PONG   = 0x04;
    static final byte STATUS_OK = 0, STATUS_ERROR = 1;
    static final int HEADER_SIZE = 10;

    @FunctionalInterface
    interface TransitFunction {
        String apply(String argsJson) throws Exception;
    }

    private final Map<String, TransitFunction> functions = new ConcurrentHashMap<>();

    // ─── Message Send Pipeline ─────────────────────────────────────────────

    public String sendMessagePipeline(String argsJson) {
        String message = extractStringField(argsJson, "message");
        String senderId = extractStringField(argsJson, "sender_id");
        String channelId = extractStringField(argsJson, "channel_id");
        String token = extractStringField(argsJson, "token");

        boolean authOk = !token.isEmpty() && token.startsWith("tok_");
        String[] flaggedWords = {"spam", "scam", "hack", "phish"};
        String[] words = message.toLowerCase().split("\\s+");
        int modScore = 0;
        for (String w : words) {
            for (String fw : flaggedWords) {
                if (w.equals(fw)) modScore++;
            }
        }
        boolean flagged = modScore > 0;
        String priority = flagged ? "review" : "high";
        long hash = message.hashCode() ^ senderId.hashCode();
        String hex = Long.toHexString(Math.abs(hash));
        String msgId = "msg_" + hex.substring(0, Math.min(8, hex.length()));

        return "{\"message_id\":\"" + msgId + "\",\"auth_ok\":" + authOk + ",\"flagged\":" + flagged +
               ",\"moderation_score\":" + modScore + ",\"routed_to\":\"" + channelId + "\",\"priority\":\"" + priority + "\"}";
    }

    // ─── Fan-out Delivery ──────────────────────────────────────────────────

    public String fanoutDelivery(String argsJson) {
        String message = extractStringField(argsJson, "message");
        // Extract user_ids array length (simplified - count commas in array)
        String key = "\"user_ids\"";
        int idx = argsJson.indexOf(key);
        int count = 1;
        if (idx >= 0) {
            int bracketStart = argsJson.indexOf('[', idx);
            int bracketEnd = argsJson.indexOf(']', bracketStart);
            if (bracketEnd > bracketStart) {
                String content = argsJson.substring(bracketStart + 1, bracketEnd).trim();
                if (!content.isEmpty()) {
                    count = content.split(",").length;
                }
            }
        }

        return "{\"total_recipients\":" + count + ",\"delivered\":" + count + ",\"failed\":0}";
    }

    // ─── Session Validation ────────────────────────────────────────────────

    public String validateSession(String argsJson) {
        String token = extractStringField(argsJson, "token");
        String userId = extractStringField(argsJson, "user_id");
        boolean valid = token.length() > 4 && token.startsWith("tok_");
        long hash = token.hashCode();
        String hex = Long.toHexString(Math.abs(hash));
        String perms = valid ? "[\"read\",\"write\"]" : "[]";

        return "{\"valid\":" + valid + ",\"user_id\":\"" + userId + "\",\"session_id\":\"sess_" + hex +
               "\",\"permissions\":" + perms + "}";
    }

    // ─── Typing Indicator ──────────────────────────────────────────────────

    public String processTypingIndicator(String argsJson) {
        String userId = extractStringField(argsJson, "user_id");
        String channelId = extractStringField(argsJson, "channel_id");
        boolean isTyping = extractBoolField(argsJson, "is_typing");
        int notified = isTyping ? 15 : 0;

        return "{\"broadcast\":true,\"recipients_notified\":" + notified + "}";
    }

    // ─── Read Receipt ──────────────────────────────────────────────────────

    public String processReadReceipt(String argsJson) {
        String messageId = extractStringField(argsJson, "message_id");
        String userId = extractStringField(argsJson, "user_id");
        long hash = messageId.hashCode() ^ userId.hashCode();
        String hex = Long.toHexString(Math.abs(hash));
        String rcptId = "rcpt_" + hex.substring(0, Math.min(8, hex.length()));

        return "{\"receipt_id\":\"" + rcptId + "\",\"acknowledged\":true,\"sender_notified\":true}";
    }

    // ─── Presence Update ───────────────────────────────────────────────────

    public String updatePresence(String argsJson) {
        String userId = extractStringField(argsJson, "user_id");
        String status = extractStringField(argsJson, "status");
        int count = extractArrayLength(argsJson, "contacts");
        int online = 0;
        for (int i = 0; i < count; i++) {
            long h = ("contact_" + i).hashCode();
            if (Math.abs(h) % 3 != 0) online++;
        }

        return "{\"user_id\":\"" + userId + "\",\"status\":\"" + status +
               "\",\"online_contacts\":" + online + ",\"offline_contacts\":" + (count - online) +
               ",\"total_contacts\":" + count + ",\"broadcast\":true}";
    }

    // ─── Content Moderation ────────────────────────────────────────────────

    public String moderateContent(String argsJson) {
        String text = extractStringField(argsJson, "text");
        String userId = extractStringField(argsJson, "user_id");
        String lower = text.toLowerCase();
        int toxic = containsAny(lower, "hate", "abuse", "harass", "bully", "threat");
        int spam = containsAny(lower, "buy now", "click here", "free money", "act fast");
        int nsfw = containsAny(lower, "explicit", "adult", "nsfw");
        int maxScore = Math.max(toxic, Math.max(spam, nsfw));
        double confidence = 0.95 - maxScore * 0.1;

        return "{\"safe\":" + (maxScore == 0) + ",\"confidence\":" + confidence +
               ",\"scores\":{\"toxic\":" + toxic + ",\"spam\":" + spam + ",\"nsfw\":" + nsfw +
               "},\"action\":\"" + (maxScore == 0 ? "allow" : "flag") + "\",\"user_id\":\"" + userId + "\"}";
    }

    // ─── Message Search ────────────────────────────────────────────────────

    public String searchMessages(String argsJson) {
        String query = extractStringField(argsJson, "query");
        String lower = query.toLowerCase();
        // Simulate search over 1000 messages
        int count = 0;
        for (int i = 0; i < 1000; i++) {
            String text = "Message " + i + " about topic " + (i % 20);
            if (text.toLowerCase().contains(lower)) count++;
        }

        return "{\"query\":\"" + query + "\",\"total_results\":" + count + ",\"search_time_ms\":0}";
    }

    // ─── Analytics Pipeline ────────────────────────────────────────────────

    public String processAnalytics(String argsJson) {
        int count = extractArrayLength(argsJson, "events");
        if (count == 0) count = 500;
        return "{\"total_events\":" + count + ",\"unique_users\":" + (count / 10) + "}";
    }

    // ─── Notification Builder ──────────────────────────────────────────────

    public String buildNotifications(String argsJson) {
        String eventType = extractStringField(argsJson, "event_type");
        int count = extractArrayLength(argsJson, "users");
        if (count == 0) count = 20;

        return "{\"total_notifications\":" + count + ",\"batch_size\":" + count + "}";
    }

    // ─── User Lookup ───────────────────────────────────────────────────────

    public String lookupUser(String argsJson) {
        String userId = extractStringField(argsJson, "user_id");
        String[] parts = userId.split("_");
        String num = parts[parts.length - 1];

        return "{\"profile\":{\"user_id\":\"" + userId + "\",\"username\":\"player_" + num +
               "\",\"display_name\":\"User " + num + "\",\"status\":\"online\"," +
               "\"permissions\":[\"read\",\"write\",\"upload\"]}}";
    }

    // ─── Channel History ───────────────────────────────────────────────────

    public String getChannelHistory(String argsJson) {
        String channelId = extractStringField(argsJson, "channel_id");
        int limit = extractIntField(argsJson, "limit");
        if (limit == 0) limit = 50;

        return "{\"channel_id\":\"" + channelId + "\",\"message_count\":" + limit + ",\"has_more\":true}";
    }

    // ─── JSON Helpers ─────────────────────────────────────────────────────

    private static String extractStringField(String json, String field) {
        String key = "\"" + field + "\"";
        int idx = json.indexOf(key);
        if (idx < 0) return "";
        int colon = json.indexOf(':', idx + key.length());
        if (colon < 0) return "";
        int valStart = colon + 1;
        while (valStart < json.length() && json.charAt(valStart) == ' ') valStart++;
        if (json.charAt(valStart) == '"') {
            int valEnd = json.indexOf('"', valStart + 1);
            return json.substring(valStart + 1, valEnd);
        }
        int valEnd = valStart;
        while (valEnd < json.length() && ",}] \n\r\t".indexOf(json.charAt(valEnd)) < 0) valEnd++;
        return json.substring(valStart, valEnd);
    }

    private static int extractIntField(String json, String field) {
        String val = extractStringField(json, field);
        if (val.isEmpty()) return 0;
        try { return (int) Long.parseLong(val.replace("\"", "")); }
        catch (NumberFormatException e) { return 0; }
    }

    private static boolean extractBoolField(String json, String field) {
        String val = extractStringField(json, field);
        return "true".equals(val);
    }

    private static int extractArrayLength(String json, String field) {
        String key = "\"" + field + "\"";
        int idx = json.indexOf(key);
        if (idx < 0) return 0;
        int bracketStart = json.indexOf('[', idx);
        int bracketEnd = json.indexOf(']', bracketStart);
        if (bracketEnd <= bracketStart) return 0;
        String content = json.substring(bracketStart + 1, bracketEnd).trim();
        if (content.isEmpty()) return 0;
        return content.split(",").length;
    }

    private static int containsAny(String text, String... patterns) {
        int count = 0;
        for (String p : patterns) {
            if (text.contains(p)) count++;
        }
        return count;
    }

    // ─── Main (Transit Binary Protocol Server) ─────────────────────────────

    public static void main(String[] args) throws Exception {
        ChatService svc = new ChatService();

        // Register all functions
        svc.functions.put("message_pipeline", svc::sendMessagePipeline);
        svc.functions.put("fanout_delivery", svc::fanoutDelivery);
        svc.functions.put("session_validation", svc::validateSession);
        svc.functions.put("typing_indicator", svc::processTypingIndicator);
        svc.functions.put("read_receipt", svc::processReadReceipt);
        svc.functions.put("presence_update", svc::updatePresence);
        svc.functions.put("content_moderation", svc::moderateContent);
        svc.functions.put("message_search", svc::searchMessages);
        svc.functions.put("analytics_pipeline", svc::processAnalytics);
        svc.functions.put("notification_builder", svc::buildNotifications);
        svc.functions.put("user_lookup", svc::lookupUser);
        svc.functions.put("channel_history", svc::getChannelHistory);

        // Start server
        ServerSocket ss = new ServerSocket(0, 50, InetAddress.getLoopbackAddress());
        int port = ss.getLocalPort();
        System.err.println("[chat-java] Listening on 127.0.0.1:" + port);
        System.out.println("PORT=" + port);
        System.out.flush();

        ExecutorService exec = Executors.newCachedThreadPool();
        AtomicBoolean running = new AtomicBoolean(true);

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            running.set(false);
            try { ss.close(); } catch (IOException ignored) {}
            exec.shutdownNow();
        }));

        while (running.get()) {
            try {
                Socket client = ss.accept();
                if (!client.getInetAddress().isLoopbackAddress()) { client.close(); continue; }
                exec.submit(() -> handleClient(client, svc, running, exec));
            } catch (IOException e) {
                if (running.get()) System.err.println("[chat-java] " + e.getMessage());
            }
        }
    }

    private static void handleClient(Socket client, ChatService svc, AtomicBoolean running, ExecutorService exec) {
        try (client) {
            client.setTcpNoDelay(true);
            var in = new DataInputStream(new BufferedInputStream(client.getInputStream()));
            var out = new DataOutputStream(new BufferedOutputStream(client.getOutputStream()));
            var writeLock = new ReentrantLock();

            while (running.get() && !client.isClosed()) {
                byte[] header = readExact(in, HEADER_SIZE);
                if (header == null) break;

                ByteBuffer hdr = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN);
                byte version = hdr.get(), type = hdr.get();
                int requestId = hdr.getInt(), payloadLen = hdr.getInt();
                if (version != PROTOCOL_VERSION) break;

                byte[] payload = payloadLen > 0 ? readExact(in, payloadLen) : new byte[0];
                if (payload == null && payloadLen > 0) break;

                if (type == TYPE_CALL_REQUEST) {
                    final byte[] p = payload;
                    final int rid = requestId;
                    exec.submit(() -> {
                        try {
                            ByteBuffer buf = ByteBuffer.wrap(p).order(ByteOrder.LITTLE_ENDIAN);
                            int fnNameLen = buf.getShort() & 0xFFFF;
                            byte[] fnBytes = new byte[fnNameLen]; buf.get(fnBytes);
                            String fnName = new String(fnBytes, StandardCharsets.UTF_8);
                            int argsLen = buf.getInt();
                            byte[] argsBytes = new byte[argsLen]; buf.get(argsBytes);
                            String argsJson = new String(argsBytes, StandardCharsets.UTF_8);

                            TransitFunction fn = svc.functions.get(fnName);
                            String resultJson; byte status;
                            if (fn == null) {
                                status = STATUS_ERROR;
                                resultJson = "{\"error\":\"Function '" + fnName + "' not found\"}";
                            } else {
                                try { resultJson = fn.apply(argsJson); status = STATUS_OK; }
                                catch (Exception e) { status = STATUS_ERROR; resultJson = "{\"error\":\"" + e.getMessage() + "\"}"; }
                            }
                            byte[] rb = resultJson.getBytes(StandardCharsets.UTF_8);
                            ByteBuffer resp = ByteBuffer.allocate(HEADER_SIZE + 1 + 4 + rb.length).order(ByteOrder.LITTLE_ENDIAN);
                            resp.put(PROTOCOL_VERSION).put(TYPE_CALL_RESPONSE).putInt(rid)
                                .putInt(1 + 4 + rb.length).put(status).putInt(rb.length).put(rb);
                            writeLock.lock();
                            try { out.write(resp.array()); out.flush(); }
                            finally { writeLock.unlock(); }
                        } catch (Exception e) {
                            if (running.get()) System.err.println("[chat-java] Call error: " + e.getMessage());
                        }
                    });
                } else if (type == TYPE_HEALTH_PING) {
                    ByteBuffer resp = ByteBuffer.allocate(HEADER_SIZE).order(ByteOrder.LITTLE_ENDIAN);
                    resp.put(PROTOCOL_VERSION).put(TYPE_HEALTH_PONG).putInt(requestId).putInt(0);
                    writeLock.lock();
                    try { out.write(resp.array()); out.flush(); }
                    finally { writeLock.unlock(); }
                }
            }
        } catch (Exception e) {
            if (running.get()) System.err.println("[chat-java] Client error: " + e.getMessage());
        }
    }

    private static byte[] readExact(DataInputStream in, int len) throws IOException {
        byte[] buf = new byte[len]; int r = 0;
        while (r < len) { int n = in.read(buf, r, len - r); if (n < 0) return null; r += n; }
        return buf;
    }
}
