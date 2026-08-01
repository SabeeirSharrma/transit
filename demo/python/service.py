import json
import math
from transit_server import TransitServer, register_function


def analyze_text(args_json):
    """Analyze text and return word count, character count, and word frequency."""
    args = json.loads(args_json)
    text = args.get("text", "")
    words = text.split()
    word_freq = {}
    for w in words:
        lower = w.lower().strip(".,!?;:'\"")
        word_freq[lower] = word_freq.get(lower, 0) + 1

    top_words = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)[:5]
    return json.dumps({
        "word_count": len(words),
        "char_count": len(text),
        "unique_words": len(word_freq),
        "top_words": dict(top_words),
    })


def transform_data(args_json):
    """Transform a list of numbers: normalize, sort, compute stats."""
    args = json.loads(args_json)
    numbers = args.get("numbers", [])
    if not numbers:
        return json.dumps({"error": "no numbers provided"})

    sorted_nums = sorted(numbers)
    mean = sum(numbers) / len(numbers)
    variance = sum((x - mean) ** 2 for x in numbers) / len(numbers)
    std_dev = math.sqrt(variance)

    # Normalize to 0-1 range
    min_val, max_val = min(numbers), max(numbers)
    span = max_val - min_val if max_val != min_val else 1
    normalized = [(x - min_val) / span for x in numbers]

    return json.dumps({
        "original": numbers,
        "sorted": sorted_nums,
        "normalized": [round(x, 4) for x in normalized],
        "stats": {
            "mean": round(mean, 4),
            "std_dev": round(std_dev, 4),
            "min": min_val,
            "max": max_val,
        },
    })


def format_report(args_json):
    """Format a structured report from data produced by other languages."""
    args = json.loads(args_json)
    title = args.get("title", "Report")
    sections = args.get("sections", [])
    lines = [f"{'=' * 50}", f"  {title}", f"{'=' * 50}", ""]
    for section in sections:
        heading = section.get("heading", "")
        body = section.get("body", "")
        lines.append(f"  {heading}")
        lines.append(f"  {body}")
        lines.append("")
    lines.append(f"{'=' * 50}")
    return json.dumps({"report": "\n".join(lines), "section_count": len(sections)})


if __name__ == "__main__":
    server = TransitServer()
    register_function("analyzeText", analyze_text)
    register_function("transformData", transform_data)
    register_function("formatReport", format_report)
    server.start()
