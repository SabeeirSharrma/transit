package transit.java;

/**
 * Sample Transit Java service.
 * User code implements functions that accept/return JSON strings.
 */
public class TransitService {

    /**
     * Example: process a job and return a result.
     * Called from JS via transit.
     */
    public String processSpecialized(String argsJson) {
        // Simple manual JSON construction for zero dependencies
        // In real code, users bring their own JSON library
        return "{\"id\":" + extractField(argsJson, "id") +
               ",\"output\":\"Java processed " + countArrayElements(argsJson) + " bytes\"" +
               ",\"processed\":true}";
    }

    public String getVersion(String argsJson) {
        return "{\"version\":\"0.1.0-java\"}";
    }

    // ─── Minimal JSON helpers (no external deps) ──────────────────────────

    private static String extractField(String json, String field) {
        String key = "\"" + field + "\"";
        int idx = json.indexOf(key);
        if (idx < 0) return "null";
        int colon = json.indexOf(':', idx + key.length());
        if (colon < 0) return "null";
        // Find value start
        int valStart = colon + 1;
        while (valStart < json.length() && json.charAt(valStart) == ' ') valStart++;
        if (json.charAt(valStart) == '"') {
            int valEnd = json.indexOf('"', valStart + 1);
            return json.substring(valStart, valEnd + 1);
        }
        // Number or other literal
        int valEnd = valStart;
        while (valEnd < json.length() && ",}] \n\r\t".indexOf(json.charAt(valEnd)) < 0) valEnd++;
        return json.substring(valStart, valEnd);
    }

    private static int countArrayElements(String json) {
        int idx = json.indexOf("\"bytes\"");
        if (idx < 0) return 0;
        int bracket = json.indexOf('[', idx);
        if (bracket < 0) return 0;
        int close = json.indexOf(']', bracket);
        if (close < 0) return 0;
        String arr = json.substring(bracket + 1, close).trim();
        if (arr.isEmpty()) return 0;
        return arr.split(",").length;
    }

    /**
     * Main entry point — starts the Transit server.
     * Server binds to an ephemeral port on 127.0.0.1 and prints PORT=<port> to stdout.
     */
    public static void main(String[] args) throws Exception {
        TransitServer server = new TransitServer();
        TransitService service = new TransitService();

        // Register functions
        server.registerFunction("processSpecialized", service::processSpecialized);
        server.registerFunction("getVersion", service::getVersion);

        // Start server (blocks until shutdown)
        server.start();
    }
}
