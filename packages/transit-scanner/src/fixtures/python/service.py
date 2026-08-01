# transit:function
def process_data(args_json):
    """User function with transit:function marker."""
    return '{"status": "ok"}'

# No marker, but starts with underscore (should NOT be discovered)
def _private_helper():
    return None

# No marker, top-level (should be discovered as tier 1)
def get_version():
    return '{"version": "1.0"}'

# transit:file marker should export everything
