package com.demo;

import transit.java.TransitServer;
import java.util.stream.Collectors;
import java.util.List;
import java.util.ArrayList;
import java.util.Map;
import java.util.HashMap;

public class App {

    public String processRecord(String argsJson) {
        // Process a data record: validate, enrich, and return a processed version
        Map<String, Object> input = parseJson(argsJson);
        String id = (String) input.getOrDefault("id", "unknown");
        Object valueObj = input.get("value");
        double value = valueObj instanceof Number ? ((Number) valueObj).doubleValue() : 0.0;

        // Enrich the record
        Map<String, Object> result = new HashMap<>();
        result.put("id", id);
        result.put("original_value", value);
        result.put("processed_value", Math.round(value * 1.1 * 100.0) / 100.0);
        result.put("status", "processed");
        result.put("pipeline", "java-enrichment");
        return toJson(result);
    }

    public String computeStats(String argsJson) {
        // Compute statistics from a batch of values
        Map<String, Object> input = parseJson(argsJson);
        List<Number> values;
        Object rawValues = input.get("values");
        if (rawValues instanceof List<?> list) {
            values = list.stream().map(n -> (Number) n).collect(Collectors.toList());
        } else if (rawValues instanceof String s) {
            values = parseJsonArray(s);
        } else {
            return toJson(Map.of("error", "no values provided"));
        }
        if (values.isEmpty()) {
            return toJson(Map.of("error", "no values provided"));
        }

        double sum = 0;
        double min = Double.MAX_VALUE;
        double max = Double.MIN_VALUE;
        for (Number n : values) {
            double v = n.doubleValue();
            sum += v;
            if (v < min) min = v;
            if (v > max) max = v;
        }
        double mean = sum / values.size();

        double variance = 0;
        for (Number n : values) {
            double diff = n.doubleValue() - mean;
            variance += diff * diff;
        }
        variance /= values.size();

        Map<String, Object> stats = new HashMap<>();
        stats.put("count", values.size());
        stats.put("sum", Math.round(sum * 100.0) / 100.0);
        stats.put("mean", Math.round(mean * 100.0) / 100.0);
        stats.put("min", min);
        stats.put("max", max);
        stats.put("variance", Math.round(variance * 100.0) / 100.0);
        return toJson(stats);
    }

    public String generateId(String argsJson) {
        // Generate a unique ID from a prefix
        Map<String, Object> input = parseJson(argsJson);
        String prefix = (String) input.getOrDefault("prefix", "item");
        long timestamp = System.currentTimeMillis();
        int random = (int) (Math.random() * 10000);
        String id = String.format("%s-%d-%04d", prefix, timestamp, random);
        return toJson(Map.of("id", id));
    }

    // ── Minimal JSON helpers (no external dependencies) ─────────────────────

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseJson(String json) {
        Map<String, Object> map = new HashMap<>();
        // Transit wraps args in an array: [{"key":"val"}] → extract the first object
        String trimmed = json.strip();
        if (trimmed.startsWith("[")) {
            int start = trimmed.indexOf('{');
            int end = trimmed.lastIndexOf('}');
            if (start >= 0 && end > start) {
                trimmed = trimmed.substring(start, end + 1);
            }
        }
        if (trimmed.startsWith("{")) trimmed = trimmed.substring(1);
        if (trimmed.endsWith("}")) trimmed = trimmed.substring(0, trimmed.length() - 1);
        if (trimmed.isEmpty()) return map;

        // Very simple parser for flat JSON objects
        String[] pairs = trimmed.split(",(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)");
        for (String pair : pairs) {
            String[] kv = pair.split(":", 2);
            if (kv.length == 2) {
                String key = kv[0].strip().replace("\"", "");
                String val = kv[1].strip();
                if (val.equals("null")) map.put(key, null);
                else if (val.equals("true")) map.put(key, true);
                else if (val.equals("false")) map.put(key, false);
                else if (val.startsWith("\"") && val.endsWith("\"")) map.put(key, val.substring(1, val.length() - 1));
                else {
                    try { map.put(key, Double.parseDouble(val)); }
                    catch (NumberFormatException e) { map.put(key, val); }
                }
            }
        }
        return map;
    }

    private List<Number> parseJsonArray(String json) {
        List<Number> list = new ArrayList<>();
        String trimmed = json.strip();
        if (trimmed.startsWith("[")) trimmed = trimmed.substring(1);
        if (trimmed.endsWith("]")) trimmed = trimmed.substring(0, trimmed.length() - 1);
        if (trimmed.isEmpty()) return list;
        for (String item : trimmed.split(",")) {
            String val = item.strip().replace("\"", "");
            try { list.add(Double.parseDouble(val)); }
            catch (NumberFormatException ignored) {}
        }
        return list;
    }

    private String toJson(Map<String, Object> map) {
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, Object> entry : map.entrySet()) {
            if (!first) sb.append(",");
            first = false;
            sb.append("\"").append(entry.getKey()).append("\":");
            Object val = entry.getValue();
            if (val == null) sb.append("null");
            else if (val instanceof String) sb.append("\"").append(val).append("\"");
            else if (val instanceof Boolean) sb.append(val);
            else sb.append(val);
        }
        sb.append("}");
        return sb.toString();
    }

    // ── Entry point ─────────────────────────────────────────────────────────

    public static void main(String[] args) throws Exception {
        TransitServer server = new TransitServer();
        App app = new App();
        server.registerFunction("processRecord", app::processRecord);
        server.registerFunction("computeStats", app::computeStats);
        server.registerFunction("generateId", app::generateId);
        server.start();
    }
}
