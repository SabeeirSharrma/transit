package com.example;

public class App {
    // Public method (should be discovered)
    public String processJob(String argsJson) {
        return "{\"processed\": true}";
    }

    // Public method (should be discovered)
    public String getVersion(String argsJson) {
        return "{\"version\": \"1.0\"}";
    }

    // Private method (should NOT be discovered)
    private String internalHelper() {
        return "";
    }

    // Static public method (should be discovered)
    public static String staticMethod(String argsJson) {
        return "{\"static\": true}";
    }
}
