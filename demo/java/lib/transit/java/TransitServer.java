package transit.java;

import java.io.*;
import java.net.*;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.*;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Function;

/**
 * Transit Java Runtime — resident-process server.
 *
 * Listens on a local TCP port (127.0.0.1 only) and dispatches
 * function calls from JS via a compact binary protocol.
 *
 * Protocol (v0.1, little-endian):
 *   Header:  [version:1][type:1][request_id:4][payload_len:4]
 *   CALL_REQUEST payload:  [fn_name_len:2][fn_name:N][args_len:4][args_json:N]
 *   CALL_RESPONSE payload: [status:1][result_len:4][result_json:N]
 *   HEALTH_PING payload:   empty
 *   HEALTH_PONG payload:   empty
 */
public class TransitServer {

    // ─── Protocol constants ───────────────────────────────────────────────

    static final byte PROTOCOL_VERSION = 1;
    static final byte TYPE_CALL_REQUEST  = 0x01;
    static final byte TYPE_CALL_RESPONSE = 0x02;
    static final byte TYPE_HEALTH_PING   = 0x03;
    static final byte TYPE_HEALTH_PONG   = 0x04;

    static final byte STATUS_OK    = 0;
    static final byte STATUS_ERROR = 1;

    static final int HEADER_SIZE = 10; // version(1) + type(1) + request_id(4) + payload_len(4)

    // ─── Function registry ────────────────────────────────────────────────

    @FunctionalInterface
    public interface TransitFunction {
        String apply(String argsJson) throws Exception;
    }

    private final Map<String, TransitFunction> functions = new ConcurrentHashMap<>();
    // Use a cached pool so handleClient threads don't starve handleCall threads
    // (FixedThreadPool of size 8 + 8 connections = deadlock)
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private ServerSocket serverSocket;
    private volatile boolean running = false;
    private int port = -1;

    /**
     * Register a function that can be called from JS.
     */
    public void registerFunction(String name, TransitFunction fn) {
        functions.put(name, fn);
        System.err.println("[transit-java] Registered function: " + name);
    }

    /**
     * Get the port the server is listening on.
     */
    public int getPort() {
        return port;
    }

    // ─── Server lifecycle ─────────────────────────────────────────────────

    /**
     * Start the server on an ephemeral port (127.0.0.1 only).
     */
    public void start() throws IOException {
        // Bind to 127.0.0.1 only — never exposed to the network
        serverSocket = new ServerSocket(0, 50, InetAddress.getLoopbackAddress());
        port = serverSocket.getLocalPort();
        running = true;

        System.err.println("[transit-java] Server listening on 127.0.0.1:" + port);
        System.err.println("[transit-java] Registered " + functions.size() + " functions");

        // Signal readiness: PORT=<port> so the parent process can read it
        System.out.println("PORT=" + port);
        System.out.flush();

        // Accept connections in a loop
        while (running) {
            try {
                var client = serverSocket.accept();
                // Only allow loopback connections
                if (!client.getInetAddress().isLoopbackAddress()) {
                    client.close();
                    continue;
                }
                executor.submit(() -> handleClient(client));
            } catch (IOException e) {
                if (running) {
                    System.err.println("[transit-java] Accept error: " + e.getMessage());
                }
            }
        }
    }

    /**
     * Stop the server gracefully.
     */
    public void stop() {
        running = false;
        try {
            if (serverSocket != null) serverSocket.close();
        } catch (IOException ignored) {}
        executor.shutdownNow();
        System.err.println("[transit-java] Server stopped");
    }

    // ─── Client handling ──────────────────────────────────────────────────

    private void handleClient(Socket client) {
        try (client) {
            client.setTcpNoDelay(true);
            var in = new DataInputStream(new BufferedInputStream(client.getInputStream()));
            var out = new DataOutputStream(new BufferedOutputStream(client.getOutputStream()));

            // Per-client write lock for concurrent response writes
            var writeLock = new ReentrantLock();

            while (running && !client.isClosed()) {
                // Read header
                byte[] header = readExact(in, HEADER_SIZE);
                if (header == null) break; // client disconnected

                ByteBuffer hdr = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN);
                byte version = hdr.get();
                byte type = hdr.get();
                int requestId = hdr.getInt();
                int payloadLen = hdr.getInt();

                if (version != PROTOCOL_VERSION) {
                    System.err.println("[transit-java] Bad version: " + version);
                    break;
                }

                // Read payload
                byte[] payload = payloadLen > 0 ? readExact(in, payloadLen) : new byte[0];
                if (payload == null && payloadLen > 0) break;

                // Dispatch — calls go to the executor for parallel processing
                switch (type) {
                    case TYPE_CALL_REQUEST -> executor.submit(
                        () -> handleCall(payload, requestId, out, writeLock)
                    );
                    case TYPE_HEALTH_PING -> handleHealthPing(requestId, out);
                    default -> System.err.println("[transit-java] Unknown type: " + type);
                }
            }
        } catch (Exception e) {
            if (running) {
                System.err.println("[transit-java] Client error: " + e.getMessage());
            }
        }
    }

    private void handleCall(byte[] payload, int requestId, DataOutputStream out, ReentrantLock writeLock) {
        try {
            ByteBuffer buf = ByteBuffer.wrap(payload).order(ByteOrder.LITTLE_ENDIAN);

            // Read function name
            int fnNameLen = buf.getShort() & 0xFFFF;
            byte[] fnNameBytes = new byte[fnNameLen];
            buf.get(fnNameBytes);
            String fnName = new String(fnNameBytes, StandardCharsets.UTF_8);

            // Read args JSON
            int argsLen = buf.getInt();
            byte[] argsBytes = new byte[argsLen];
            buf.get(argsBytes);
            String argsJson = new String(argsBytes, StandardCharsets.UTF_8);

            // Look up and call the function (no lock held — parallel execution)
            TransitFunction fn = functions.get(fnName);
            String resultJson;
            byte status;

            if (fn == null) {
                status = STATUS_ERROR;
                resultJson = "{\"error\":\"Function '" + fnName + "' not found. Available: " +
                             functions.keySet() + "\"}";
            } else {
                try {
                    resultJson = fn.apply(argsJson);
                    status = STATUS_OK;
                } catch (Exception e) {
                    status = STATUS_ERROR;
                    resultJson = "{\"error\":\"" + escapeJson(e.getMessage()) + "\"}";
                }
            }

            // Build response — single allocation
            byte[] resultBytes = resultJson.getBytes(StandardCharsets.UTF_8);
            ByteBuffer resp = ByteBuffer.allocate(HEADER_SIZE + 1 + 4 + resultBytes.length)
                                        .order(ByteOrder.LITTLE_ENDIAN);
            resp.put(PROTOCOL_VERSION);
            resp.put(TYPE_CALL_RESPONSE);
            resp.putInt(requestId);
            resp.putInt(1 + 4 + resultBytes.length); // payload: status(1) + result_len(4) + result(N)
            resp.put(status);
            resp.putInt(resultBytes.length);
            resp.put(resultBytes);

            // Acquire lock only for the write to prevent interleaved responses
            writeLock.lock();
            try {
                out.write(resp.array());
                out.flush();
            } finally {
                writeLock.unlock();
            }
        } catch (Exception e) {
            System.err.println("[transit-java] Call handler error: " + e.getMessage());
        }
    }

    private void handleHealthPing(int requestId, DataOutputStream out) throws IOException {
        ByteBuffer resp = ByteBuffer.allocate(HEADER_SIZE).order(ByteOrder.LITTLE_ENDIAN);
        resp.put(PROTOCOL_VERSION);
        resp.put(TYPE_HEALTH_PONG);
        resp.putInt(requestId);
        resp.putInt(0); // empty payload

        out.write(resp.array());
        out.flush();
    }

    // ─── Helpers ──────────────────────────────────────────────────────────

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

    private static String escapeJson(String s) {
        if (s == null) return "null";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }

    // ─── Main entry point ─────────────────────────────────────────────────

    public static void main(String[] args) throws Exception {
        TransitServer server = new TransitServer();
        Runtime.getRuntime().addShutdownHook(new Thread(server::stop));
        server.start();
    }
}
