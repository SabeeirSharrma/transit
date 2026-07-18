"""
Example Transit Python service.

This file demonstrates how to create a Python service that can be called from JS.
Copy this file to your project and modify the functions as needed.
"""

import json
from transit_server import TransitServer, register_function


def process_data(args_json):
    """Process data and return a result.

    Args:
        args_json: JSON string with arguments from JS

    Returns:
        JSON string with the result
    """
    args = json.loads(args_json)
    data = args.get("data", [])

    return json.dumps(
        {
            "output": f"Python processed {len(data)} items",
            "processed": True,
            "items": len(data),
        }
    )


def get_version(args_json):
    """Return the service version.

    Args:
        args_json: JSON string (ignored)

    Returns:
        JSON string with version info
    """
    return json.dumps({"version": "1.0.0", "runtime": "python"})


def transform_text(args_json):
    """Transform text data.

    Args:
        args_json: JSON string with "text" and optional "operation" fields

    Returns:
        JSON string with transformed text
    """
    args = json.loads(args_json)
    text = args.get("text", "")
    operation = args.get("operation", "upper")

    if operation == "upper":
        result = text.upper()
    elif operation == "lower":
        result = text.lower()
    elif operation == "reverse":
        result = text[::-1]
    else:
        result = text

    return json.dumps({"result": result, "operation": operation})


# ─── Main entry point ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    server = TransitServer()

    # Register functions
    register_function("processData", process_data)
    register_function("getVersion", get_version)
    register_function("transformText", transform_text)

    # Start the server (blocks until stopped)
    server.start()
