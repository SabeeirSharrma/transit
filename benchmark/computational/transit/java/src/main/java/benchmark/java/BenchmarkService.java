package benchmark.java;

import java.io.*;
import java.net.*;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.concurrent.locks.ReentrantLock;

public class BenchmarkService {

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

    // ─── ETL Pipeline ─────────────────────────────────────────────────────

    public String etlPipeline(String argsJson) {
        long start = System.nanoTime();
        // Minimal JSON extract
        String csvData = extractStringField(argsJson, "csv_data");

        Map<String, List<Double>> groups = new TreeMap<>();
        for (String line : csvData.split("\n")) {
            String[] parts = line.split(",");
            if (parts.length >= 2) {
                String key = parts[0].trim();
                try {
                    double val = Double.parseDouble(parts[1].trim());
                    groups.computeIfAbsent(key, k -> new ArrayList<>()).add(val);
                } catch (NumberFormatException ignored) {}
            }
        }

        List<Map<String, Object>> aggregates = new ArrayList<>();
        int records = 0;
        for (var entry : groups.entrySet()) {
            List<Double> values = entry.getValue();
            double sum = 0;
            for (double v : values) sum += v;
            int count = values.size();
            records += count;
            Map<String, Object> agg = new LinkedHashMap<>();
            agg.put("group", entry.getKey());
            agg.put("sum", sum);
            agg.put("avg", count > 0 ? sum / count : 0);
            agg.put("count", count);
            aggregates.add(agg);
        }

        double elapsed = (System.nanoTime() - start) / 1_000_000.0;

        return "{\"records_processed\":" + records +
               ",\"aggregates\":" + toJson(aggregates) +
               ",\"duration_ms\":" + elapsed + "}";
    }

    // ─── Text Analysis ────────────────────────────────────────────────────

    public String analyzeTextFull(String argsJson) {
        long start = System.nanoTime();
        String text = extractStringField(argsJson, "text");

        int chars = text.length();
        String[] words = text.trim().split("\\s+");
        int wordCount = words.length;

        Map<String, Integer> freq = new LinkedHashMap<>();
        for (String w : words) {
            String clean = w.toLowerCase().replaceAll("[^a-z0-9]", "");
            if (!clean.isEmpty()) {
                freq.merge(clean, 1, Integer::sum);
            }
        }

        int uniqueWords = freq.size();
        double avgWordLength = 0;
        for (String w : words) avgWordLength += w.length();
        avgWordLength = wordCount > 0 ? avgWordLength / wordCount : 0;

        // Top words
        List<Map<String, Object>> topWords = freq.entrySet().stream()
            .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
            .limit(10)
            .map(e -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("word", e.getKey());
                m.put("count", e.getValue());
                return m;
            })
            .toList();

        // Bigrams
        List<String> cleanWords = new ArrayList<>();
        for (String w : words) {
            String c = w.toLowerCase().replaceAll("[^a-z0-9]", "");
            if (!c.isEmpty()) cleanWords.add(c);
        }
        Map<String, Integer> bigramFreq = new LinkedHashMap<>();
        for (int i = 0; i < cleanWords.size() - 1; i++) {
            String bigram = cleanWords.get(i) + " " + cleanWords.get(i + 1);
            bigramFreq.merge(bigram, 1, Integer::sum);
        }
        List<Map<String, Object>> bigrams = bigramFreq.entrySet().stream()
            .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
            .limit(10)
            .map(e -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("word", e.getKey());
                m.put("count", e.getValue());
                return m;
            })
            .toList();

        // Readability
        int sentences = 0;
        for (char c : text.toCharArray()) if (c == '.' || c == '!' || c == '?') sentences++;
        sentences = Math.max(sentences, 1);
        int syllables = 0;
        for (String w : words) syllables += countSyllables(w);
        double readability = wordCount > 0 ?
            206.835 - 1.015 * ((double) wordCount / sentences) - 84.6 * ((double) syllables / wordCount) : 0;

        double elapsed = (System.nanoTime() - start) / 1_000_000.0;

        return "{\"word_count\":" + wordCount +
               ",\"char_count\":" + chars +
               ",\"unique_words\":" + uniqueWords +
               ",\"avg_word_length\":" + avgWordLength +
               ",\"top_words\":" + toJson(topWords) +
               ",\"bigrams\":" + toJson(bigrams) +
               ",\"readability_score\":" + readability + "}";
    }

    private int countSyllables(String word) {
        String w = word.toLowerCase();
        String vowels = "aeiouy";
        if (w.isEmpty()) return 1;
        int count = 0;
        boolean prevVowel = false;
        for (char c : w.toCharArray()) {
            boolean isVowel = vowels.indexOf(c) >= 0;
            if (isVowel && !prevVowel) count++;
            prevVowel = isVowel;
        }
        if (w.endsWith("e") && count > 1) count--;
        return Math.max(count, 1);
    }

    // ─── Matrix Operations ────────────────────────────────────────────────

    public String matrixMultiply(String argsJson) {
        long start = System.nanoTime();
        // Extract arrays — simplified parsing for benchmark
        List<Double> a = extractDoubleArray(argsJson, "a");
        List<Double> b = extractDoubleArray(argsJson, "b");
        int m = extractIntField(argsJson, "m");
        int n = extractIntField(argsJson, "n");
        int p = extractIntField(argsJson, "p");

        double[] result = new double[m * p];
        for (int i = 0; i < m; i++) {
            for (int k = 0; k < n; k++) {
                double aVal = a.get(i * n + k);
                for (int j = 0; j < p; j++) {
                    result[i * p + j] += aVal * b.get(k * p + j);
                }
            }
        }

        double elapsed = (System.nanoTime() - start) / 1_000_000.0;
        return "{\"result\":" + toDoubleArrayJson(result) +
               ",\"dimensions\":{\"m\":" + m + ",\"n\":" + n + ",\"p\":" + p + "}" +
               ",\"duration_ms\":" + elapsed + "}";
    }

    public String matrixDeterminant(String argsJson) {
        long start = System.nanoTime();
        List<Double> flat = extractDoubleArray(argsJson, "flat");
        int n = extractIntField(argsJson, "n");

        double[][] mat = new double[n][n];
        for (int i = 0; i < n; i++)
            for (int j = 0; j < n; j++)
                mat[i][j] = flat.get(i * n + j);

        double det = determinant(mat, n);
        double elapsed = (System.nanoTime() - start) / 1_000_000.0;

        return "{\"determinant\":" + det + ",\"size\":" + n + ",\"duration_ms\":" + elapsed + "}";
    }

    private double determinant(double[][] mat, int n) {
        if (n == 1) return mat[0][0];
        if (n == 2) return mat[0][0] * mat[1][1] - mat[0][1] * mat[1][0];

        double det = 0;
        for (int j = 0; j < n; j++) {
            double[][] sub = new double[n-1][n-1];
            for (int i = 1; i < n; i++) {
                int col = 0;
                for (int k = 0; k < n; k++) {
                    if (k != j) sub[i-1][col++] = mat[i][k];
                }
            }
            double sign = (j % 2 == 0) ? 1 : -1;
            det += sign * mat[0][j] * determinant(sub, n - 1);
        }
        return det;
    }

    // ─── Graph Processing ─────────────────────────────────────────────────

    public String processGraph(String argsJson) {
        long start = System.nanoTime();
        int nodes = extractIntField(argsJson, "nodes");
        List<Long> edgesFlat = extractLongArray(argsJson, "edges_flat");
        int iterations = extractIntField(argsJson, "iterations");

        List<int[]>[] adj = new List[nodes];
        for (int i = 0; i < nodes; i++) adj[i] = new ArrayList<>();

        for (int i = 0; i + 2 < edgesFlat.size(); i += 3) {
            int from = (int) (long) edgesFlat.get(i);
            int to = (int) (long) edgesFlat.get(i + 1);
            int weight = (int) (long) edgesFlat.get(i + 2);
            if (from < nodes && to < nodes) adj[from].add(new int[]{to, weight});
        }

        // BFS
        boolean[] visited = new boolean[nodes];
        List<Integer> bfsOrder = new ArrayList<>();
        Queue<Integer> queue = new LinkedList<>();
        visited[0] = true;
        queue.add(0);
        while (!queue.isEmpty()) {
            int node = queue.poll();
            bfsOrder.add(node);
            for (int[] edge : adj[node]) {
                if (!visited[edge[0]]) {
                    visited[edge[0]] = true;
                    queue.add(edge[0]);
                }
            }
        }

        // Dijkstra
        List<Map<String, Object>> shortestPaths = new ArrayList<>();
        for (int target = 1; target < Math.min(6, nodes); target++) {
            int[] result = dijkstra(adj, 0, target, nodes);
            Map<String, Object> sp = new LinkedHashMap<>();
            sp.put("from", 0);
            sp.put("to", target);
            sp.put("distance", result[0] == Integer.MAX_VALUE ? -1 : result[0]);
            sp.put("path", Arrays.copyOfRange(result, 1, result.length));
            shortestPaths.add(sp);
        }

        // PageRank
        double damping = 0.85;
        double[] ranks = new double[nodes];
        Arrays.fill(ranks, 1.0 / nodes);
        for (int iter = 0; iter < iterations; iter++) {
            double[] newRanks = new double[nodes];
            Arrays.fill(newRanks, (1.0 - damping) / nodes);
            for (int i = 0; i < nodes; i++) {
                double share = damping * ranks[i] / Math.max(adj[i].size(), 1);
                for (int[] edge : adj[i]) {
                    newRanks[edge[0]] += share;
                }
            }
            ranks = newRanks;
        }

        List<Map<String, Object>> pageRank = new ArrayList<>();
        for (int i = 0; i < nodes; i++) {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("node", i);
            entry.put("rank", ranks[i]);
            pageRank.add(entry);
        }
        pageRank.sort((a, b) -> Double.compare((double) b.get("rank"), (double) a.get("rank")));

        // Connected components
        visited = new boolean[nodes];
        int components = 0;
        for (int i = 0; i < nodes; i++) {
            if (!visited[i]) {
                components++;
                Stack<Integer> stack = new Stack<>();
                stack.push(i);
                while (!stack.isEmpty()) {
                    int node = stack.pop();
                    if (!visited[node]) {
                        visited[node] = true;
                        for (int[] edge : adj[node]) {
                            if (!visited[edge[0]]) stack.push(edge[0]);
                        }
                    }
                }
            }
        }

        double elapsed = (System.nanoTime() - start) / 1_000_000.0;

        return "{\"bfs_order\":" + bfsOrder +
               ",\"shortest_paths\":" + toJson(shortestPaths) +
               ",\"page_rank\":" + toJson(pageRank) +
               ",\"connected_components\":" + components + "}";
    }

    private int[] dijkstra(List<int[]>[] adj, int start, int end, int n) {
        int[] dist = new int[n];
        int[] prev = new int[n];
        Arrays.fill(dist, Integer.MAX_VALUE);
        Arrays.fill(prev, -1);
        dist[start] = 0;

        // Simple priority queue using TreeMap
        TreeMap<Integer, List<Integer>> pq = new TreeMap<>();
        pq.computeIfAbsent(0, k -> new ArrayList<>()).add(start);

        while (!pq.isEmpty()) {
            int d = pq.firstKey();
            List<Integer> nodes = pq.pollFirstEntry().getValue();
            int u = nodes.remove(0);
            if (nodes.isEmpty()) pq.remove(d);
            if (d > dist[u]) continue;
            for (int[] edge : adj[u]) {
                int v = edge[0], w = edge[1];
                int nd = d + w;
                if (nd < dist[v]) {
                    dist[v] = nd;
                    prev[v] = u;
                    pq.computeIfAbsent(nd, k -> new ArrayList<>()).add(v);
                }
            }
        }

        if (dist[end] == Integer.MAX_VALUE) {
            return new int[]{Integer.MAX_VALUE};
        }
        List<Integer> path = new ArrayList<>();
        int cur = end;
        while (cur != -1) {
            path.add(cur);
            cur = prev[cur];
        }
        Collections.reverse(path);
        int[] result = new int[1 + path.size()];
        result[0] = dist[end];
        for (int i = 0; i < path.size(); i++) result[i + 1] = path.get(i);
        return result;
    }

    // ─── Fibonacci & Hash ─────────────────────────────────────────────────

    public String fibonacciMemo(String argsJson) {
        long start = System.nanoTime();
        int n = extractIntField(argsJson, "n");
        long[] memo = new long[n + 1];
        Arrays.fill(memo, -1);
        long result = fib(n, memo);
        double elapsed = (System.nanoTime() - start) / 1_000_000.0;

        return "{\"n\":" + n + ",\"result\":" + result + ",\"duration_ms\":" + elapsed + "}";
    }

    private long fib(int n, long[] memo) {
        if (n <= 1) return n;
        if (memo[n] != -1) return memo[n];
        memo[n] = fib(n - 1, memo) + fib(n - 2, memo);
        return memo[n];
    }

    public String hashData(String argsJson) {
        long start = System.nanoTime();
        String data = extractStringField(argsJson, "data");
        int rounds = extractIntField(argsJson, "rounds");

        byte[] current = data.getBytes(StandardCharsets.UTF_8);
        for (int i = 0; i < rounds; i++) {
            try {
                java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
                current = md.digest(current);
            } catch (Exception e) { break; }
        }

        StringBuilder hex = new StringBuilder();
        for (byte b : current) hex.append(String.format("%02x", b));

        double elapsed = (System.nanoTime() - start) / 1_000_000.0;
        return "{\"hash\":\"" + hex + "\",\"rounds\":" + rounds + ",\"duration_ms\":" + elapsed + "}";
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
        return (int) Long.parseLong(extractStringField(json, field).replace("\"", ""));
    }

    private static List<Double> extractDoubleArray(String json, String field) {
        String key = "\"" + field + "\"";
        int start = json.indexOf(key);
        if (start < 0) return List.of();
        int bracketStart = json.indexOf('[', start);
        int bracketEnd = json.indexOf(']', bracketStart);
        String content = json.substring(bracketStart + 1, bracketEnd);
        if (content.isBlank()) return List.of();
        List<Double> result = new ArrayList<>();
        for (String s : content.split(",")) {
            result.add(Double.parseDouble(s.trim()));
        }
        return result;
    }

    private static List<Long> extractLongArray(String json, String field) {
        String key = "\"" + field + "\"";
        int start = json.indexOf(key);
        if (start < 0) return List.of();
        int bracketStart = json.indexOf('[', start);
        int bracketEnd = json.indexOf(']', bracketStart);
        String content = json.substring(bracketStart + 1, bracketEnd);
        if (content.isBlank()) return List.of();
        List<Long> result = new ArrayList<>();
        for (String s : content.split(",")) {
            result.add(Long.parseLong(s.trim()));
        }
        return result;
    }

    private static String toJson(List<Map<String, Object>> list) {
        StringBuilder sb = new StringBuilder("[");
        boolean first = true;
        for (Map<String, Object> map : list) {
            if (!first) sb.append(",");
            first = false;
            sb.append("{");
            boolean f2 = true;
            for (var entry : map.entrySet()) {
                if (!f2) sb.append(",");
                f2 = false;
                sb.append("\"").append(entry.getKey()).append("\":");
                Object v = entry.getValue();
                if (v instanceof String) sb.append("\"").append(v).append("\"");
                else if (v instanceof Number) sb.append(v);
                else if (v instanceof int[] arr) {
                    sb.append("[");
                    for (int i = 0; i < arr.length; i++) {
                        if (i > 0) sb.append(",");
                        sb.append(arr[i]);
                    }
                    sb.append("]");
                }
                else sb.append(v);
            }
            sb.append("}");
        }
        sb.append("]");
        return sb.toString();
    }

    private static String toJson(Object obj) {
        if (obj instanceof List<?> list) {
            StringBuilder sb = new StringBuilder("[");
            boolean first = true;
            for (Object item : list) {
                if (!first) sb.append(",");
                first = false;
                sb.append(toJson(item));
            }
            sb.append("]");
            return sb.toString();
        }
        if (obj instanceof Map<?, ?> map) {
            StringBuilder sb = new StringBuilder("{");
            boolean first = true;
            for (var entry : map.entrySet()) {
                if (!first) sb.append(",");
                first = false;
                sb.append("\"").append(entry.getKey()).append("\":").append(toJson(entry.getValue()));
            }
            sb.append("}");
            return sb.toString();
        }
        if (obj instanceof String s) return "\"" + s + "\"";
        if (obj instanceof Number) return obj.toString();
        if (obj instanceof int[] arr) {
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < arr.length; i++) {
                if (i > 0) sb.append(",");
                sb.append(arr[i]);
            }
            return sb.append("]").toString();
        }
        return obj == null ? "null" : obj.toString();
    }

    private static String toDoubleArrayJson(double[] arr) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < arr.length; i++) {
            if (i > 0) sb.append(",");
            sb.append(arr[i]);
        }
        return sb.append("]").toString();
    }

    // ─── Main ─────────────────────────────────────────────────────────────

    public static void main(String[] args) throws Exception {
        BenchmarkService svc = new BenchmarkService();
        svc.functions.put("etlPipeline", svc::etlPipeline);
        svc.functions.put("analyzeTextFull", svc::analyzeTextFull);
        svc.functions.put("matrixMultiply", svc::matrixMultiply);
        svc.functions.put("matrixDeterminant", svc::matrixDeterminant);
        svc.functions.put("processGraph", svc::processGraph);
        svc.functions.put("fibonacciMemo", svc::fibonacciMemo);
        svc.functions.put("hashData", svc::hashData);

        // Start server
        ServerSocket ss = new ServerSocket(0, 50, InetAddress.getLoopbackAddress());
        int port = ss.getLocalPort();
        System.err.println("[benchmark-java] Listening on 127.0.0.1:" + port);
        System.out.println("PORT=" + port);
        System.out.flush();

        ExecutorService exec = Executors.newFixedThreadPool(Math.min(Runtime.getRuntime().availableProcessors(), 8));
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
                if (running.get()) System.err.println("[benchmark-java] " + e.getMessage());
            }
        }
    }

    private static void handleClient(Socket client, BenchmarkService svc, AtomicBoolean running, ExecutorService exec) {
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
                    // Dispatch to thread pool for pipelining
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
                            if (running.get()) System.err.println("[benchmark-java] Call error: " + e.getMessage());
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
            if (running.get()) System.err.println("[benchmark-java] Client error: " + e.getMessage());
        }
    }

    private static byte[] readExact(DataInputStream in, int len) throws IOException {
        byte[] buf = new byte[len]; int r = 0;
        while (r < len) { int n = in.read(buf, r, len - r); if (n < 0) return null; r += n; }
        return buf;
    }
}
