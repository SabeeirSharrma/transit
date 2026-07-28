"""Chat server benchmark — Python service for AI/ML heavy operations."""
# ─── orjson shim ─────────────────────────────────────────────────────────────
import os
_use_orjson = os.environ.get("TRANSIT_USE_ORJSON", "") == "1"
if _use_orjson:
    try:
        import orjson
        def _json_dumps(obj):
            return orjson.dumps(obj).decode("utf-8")
        def _json_loads(s):
            if isinstance(s, bytes):
                return orjson.loads(s)
            return orjson.loads(s.encode("utf-8") if isinstance(s, str) else s)
    except ImportError:
        import json as _json
        _json_dumps = _json.dumps
        _json_loads = _json.loads
else:
    import json as _json
    _json_dumps = _json.dumps
    _json_loads = _json.loads

# Alias for downstream code
json = type("json", (), {"dumps": staticmethod(_json_dumps), "loads": staticmethod(_json_loads)})()

import math
import re
import socket
import struct
import sys
import time
import hashlib
import atexit
import signal
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor

# ─── Protocol constants (matching transit binary protocol) ────────────────────

PROTOCOL_VERSION = 1
TYPE_CALL_REQUEST = 0x01
TYPE_CALL_RESPONSE = 0x02
TYPE_HEALTH_PING = 0x03
TYPE_HEALTH_PONG = 0x04
STATUS_OK = 0
STATUS_ERROR = 1
HEADER_SIZE = 10
HEADER_FORMAT = "<BBII"

_functions = {}

def register_function(name, fn):
    _functions[name] = fn
    print(f"[chat-py] Registered function: {name}", file=sys.stderr)


# ─── AI Content Moderation ───────────────────────────────────────────────────

# Simulated toxicity model — in production this would be a real ML model
_TOXIC_PATTERNS = [
    r"\b(spam|scam|phish)\b",
    r"\b(hack|exploit|bypass)\b",
    r"(https?://[^\s]+){3,}",  # multiple links = suspicious
]

_SPAM_INDICATORS = [
    "buy now", "click here", "free money", "act now",
    "limited time", "congratulations", "you won",
]

def moderate_content(args_json):
    """AI content moderation — scan message for toxicity, spam, and policy violations."""
    start = time.perf_counter()
    args = _json_loads(args_json)

    content = args.get("content", "")
    sender_id = args.get("sender_id", "")
    channel_id = args.get("channel_id", "")

    content_lower = content.lower()
    flags = []
    confidence = 0.0

    # Check toxic patterns
    for pattern in _TOXIC_PATTERNS:
        if re.search(pattern, content_lower):
            flags.append("toxic_pattern")
            confidence += 0.3

    # Check spam indicators
    spam_score = sum(1 for indicator in _SPAM_INDICATORS if indicator in content_lower)
    if spam_score >= 2:
        flags.append("spam")
        confidence += 0.4

    # Check excessive caps (shouting)
    alpha_chars = [c for c in content if c.isalpha()]
    if alpha_chars and sum(1 for c in alpha_chars if c.isupper()) / len(alpha_chars) > 0.7:
        flags.append("excessive_caps")
        confidence += 0.2

    # Check excessive mentions
    mentions = len(re.findall(r"@\w+", content))
    if mentions > 5:
        flags.append("excessive_mentions")
        confidence += 0.2

    # Check message length abuse
    if len(content) > 5000:
        flags.append("oversized_message")
        confidence += 0.1

    # Simulate ML model inference time (real model would take 5-50ms)
    # Add small synthetic computation to simulate model overhead
    _ = sum(math.sin(i * 0.01) for i in range(len(content)))

    confidence = min(confidence, 1.0)
    action = "allow"
    if confidence > 0.7:
        action = "block"
    elif confidence > 0.4:
        action = "flag"

    elapsed = (time.perf_counter() - start) * 1000

    return _json_dumps({
        "action": action,
        "confidence": confidence,
        "flags": flags,
        "process_time_ms": elapsed,
    })


# ─── Full-Text Message Search ────────────────────────────────────────────────

def search_messages(args_json):
    """Full-text search across message history with ranking."""
    start = time.perf_counter()
    args = _json_loads(args_json)

    query = args.get("query", "")
    channel_id = args.get("channel_id", "")
    limit = args.get("limit", 20)
    messages = args.get("messages", [])

    query_terms = query.lower().split()

    # Score each message
    scored = []
    for msg in messages:
        content = msg.get("content", "").lower()
        sender = msg.get("sender_id", "")
        msg_id = msg.get("id", "")

        # TF scoring
        score = 0.0
        for term in query_terms:
            count = content.count(term)
            if count > 0:
                # TF component
                score += count / (len(content.split()) + 1)
                # Exact match bonus
                if term in content:
                    score += 0.1

        # Recency bias (newer messages rank higher)
        timestamp = msg.get("timestamp", 0)
        recency_bonus = (timestamp % 1000) / 1000.0
        score += recency_bonus * 0.05

        # Sender reputation (simulated)
        if sender.startswith("admin"):
            score += 0.05

        if score > 0:
            # Simulate snippet extraction
            words = content.split()
            snippet = " ".join(words[:50])
            if len(words) > 50:
                snippet += "..."

            scored.append({
                "id": msg_id,
                "sender_id": sender,
                "content_preview": snippet,
                "score": round(score, 4),
            })

    # Sort by score descending
    scored.sort(key=lambda x: x["score"], reverse=True)
    results = scored[:limit]

    elapsed = (time.perf_counter() - start) * 1000

    return _json_dumps({
        "query": query,
        "results": results,
        "total_matches": len(scored),
        "search_time_ms": elapsed,
    })


# ─── Analytics Pipeline ─────────────────────────────────────────────────────

def process_analytics(args_json):
    """Process chat analytics — message volume, active users, peak hours."""
    start = time.perf_counter()
    args = _json_loads(args_json)

    events = args.get("events", [])

    # Aggregate by type
    type_counts = Counter()
    user_activity = Counter()
    hourly_volume = defaultdict(int)

    for event in events:
        event_type = event.get("type", "unknown")
        user_id = event.get("user_id", "")
        hour = event.get("hour", 0)

        type_counts[event_type] += 1
        user_activity[user_id] += 1
        hourly_volume[hour] += 1

    # Compute stats
    total_events = len(events)
    unique_users = len(user_activity)
    peak_hour = max(hourly_volume.items(), key=lambda x: x[1])[0] if hourly_volume else 0
    avg_events_per_user = total_events / max(unique_users, 1)

    # Engagement score (simulated)
    engagement = sum(min(v / 10, 1.0) for v in user_activity.values()) / max(unique_users, 1)

    # Simulate heavier computation (percentiles, trend analysis)
    _ = sum(math.sqrt(i) for i in range(min(total_events, 1000)))

    elapsed = (time.perf_counter() - start) * 1000

    return _json_dumps({
        "total_events": total_events,
        "unique_users": unique_users,
        "type_breakdown": dict(type_counts),
        "peak_hour": peak_hour,
        "avg_events_per_user": round(avg_events_per_user, 2),
        "engagement_score": round(engagement, 4),
        "process_time_ms": elapsed,
    })


# ─── Recommendation Engine ──────────────────────────────────────────────────

def recommend_channels(args_json):
    """Recommend channels based on user activity and similarity."""
    start = time.perf_counter()
    args = _json_loads(args_json)

    user_id = args.get("user_id", "")
    user_history = args.get("user_history", [])
    all_channels = args.get("all_channels", [])

    # Build user interest profile
    interest_vector = Counter()
    for activity in user_history:
        channel = activity.get("channel_id", "")
        weight = activity.get("engagement_weight", 1.0)
        interest_vector[channel] += weight

    # Score channels user hasn't joined
    joined = set(a.get("channel_id", "") for a in user_history)
    candidates = [c for c in all_channels if c.get("id", "") not in joined]

    scored = []
    for ch in candidates:
        ch_id = ch.get("id", "")
        ch_tags = set(ch.get("tags", []))

        # Compute similarity with user interests
        score = 0.0
        for interest_ch, weight in interest_vector.items():
            # Jaccard similarity on tags
            interest_tags = set()  # would be looked up in real system
            if ch_tags and interest_tags:
                intersection = len(ch_tags & interest_tags)
                union = len(ch_tags | interest_tags)
                score += (intersection / max(union, 1)) * weight

        # Popularity bonus (simulated)
        score += ch.get("member_count", 0) / 10000.0 * 0.1

        scored.append({
            "channel_id": ch_id,
            "name": ch.get("name", ""),
            "score": round(score, 4),
            "reason": "based on your activity",
        })

    scored.sort(key=lambda x: x["score"], reverse=True)
    recommendations = scored[:10]

    elapsed = (time.perf_counter() - start) * 1000

    return _json_dumps({
        "user_id": user_id,
        "recommendations": recommendations,
        "process_time_ms": elapsed,
    })


# ─── Notification Builder ───────────────────────────────────────────────────

def build_notifications(args_json):
    """Build personalized notification payloads for multiple users."""
    start = time.perf_counter()
    args = _json_loads(args_json)

    event_type = args.get("event_type", "")
    payload = args.get("payload", {})
    recipients = args.get("recipients", [])

    notifications = []
    for user in recipients:
        user_id = user.get("user_id", "")
        prefs = user.get("preferences", {})

        # Build notification based on user preferences
        title = ""
        body = ""
        priority = "normal"

        if event_type == "message":
            sender_name = payload.get("sender_name", "Someone")
            channel_name = payload.get("channel_name", "a channel")
            title = f"New message in {channel_name}"
            body = f"{sender_name}: {payload.get('preview', '')[:100]}"
            priority = "high" if payload.get("is_mention") else "normal"

        elif event_type == "mention":
            title = "You were mentioned"
            body = payload.get("text", "")[:200]
            priority = "high"

        elif event_type == "invite":
            title = "Channel invitation"
            body = f"You've been invited to {payload.get('channel_name', '')}"
            priority = "normal"

        # Simulate template rendering
        _ = hashlib.sha256(f"{user_id}{title}".encode()).hexdigest()

        notifications.append({
            "user_id": user_id,
            "title": title,
            "body": body,
            "priority": priority,
            "channel": prefs.get("notification_channel", "push"),
        })

    elapsed = (time.perf_counter() - start) * 1000

    return _json_dumps({
        "notifications_built": len(notifications),
        "notifications": notifications,
        "process_time_ms": elapsed,
    })


# ─── Transit Server ───────────────────────────────────────────────────────────

class TransitServer:
    def __init__(self):
        self._server_socket = None
        self._running = False
        self._executor = ThreadPoolExecutor(max_workers=min(os.cpu_count() or 4, 8))
        self._socket_path = None
        self._write_lock = __import__("threading").Lock()

    def _cleanup_socket_file(self):
        if self._socket_path and os.path.exists(self._socket_path):
            try:
                os.unlink(self._socket_path)
            except OSError:
                pass

    def start(self):
        # Register cleanup
        atexit.register(self._cleanup_socket_file)
        signal.signal(signal.SIGTERM, lambda *_: (self._cleanup_socket_file(), sys.exit(0)))
        signal.signal(signal.SIGINT, lambda *_: (self._cleanup_socket_file(), sys.exit(0)))

        # Try UDS first on Linux/macOS
        if hasattr(socket, "AF_UNIX") and sys.platform != "win32":
            self._socket_path = f"/tmp/transit-{os.getpid()}.sock"
            # Remove stale socket
            if os.path.exists(self._socket_path):
                try:
                    os.unlink(self._socket_path)
                except OSError:
                    pass
            try:
                self._server_socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                self._server_socket.bind(self._socket_path)
                self._server_socket.listen(50)
                self._running = True
                print(f"[chat-py] Server listening on UDS {self._socket_path}", file=sys.stderr)
                print(f"[chat-py] Registered {len(_functions)} functions", file=sys.stderr)
                print(f"SOCKET={self._socket_path}")
                sys.stdout.flush()
                self._accept_loop()
                return
            except Exception as e:
                print(f"[chat-py] UDS failed ({e}), falling back to TCP", file=sys.stderr)
                self._cleanup_socket_file()
                self._socket_path = None

        # Fallback to TCP
        self._server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._server_socket.bind(("127.0.0.1", 0))
        self._server_socket.listen(50)
        self._port = self._server_socket.getsockname()[1]
        self._running = True
        print(f"[chat-py] Server listening on 127.0.0.1:{self._port}", file=sys.stderr)
        print(f"[chat-py] Registered {len(_functions)} functions", file=sys.stderr)
        print(f"PORT={self._port}")
        sys.stdout.flush()
        self._accept_loop()

    def _accept_loop(self):
        while self._running:
            try:
                client, addr = self._server_socket.accept()
                if self._socket_path is None:
                    # TCP — verify loopback
                    if addr[0] != "127.0.0.1":
                        client.close()
                        continue
                self._executor.submit(self._handle_client, client)
            except OSError:
                break

    def _handle_client(self, client):
        try:
            if self._socket_path is None:
                # TCP only
                client.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            with client:
                while self._running:
                    header = self._recv_exact(client, HEADER_SIZE)
                    if header is None:
                        break
                    version, msg_type, request_id, payload_len = struct.unpack(HEADER_FORMAT, header)
                    if version != PROTOCOL_VERSION:
                        break
                    payload = self._recv_exact(client, payload_len) if payload_len > 0 else b""
                    if msg_type == TYPE_CALL_REQUEST:
                        # Handle inline to avoid deadlock: _handle_client runs on
                        # the executor, so submitting _handle_call to the same
                        # executor can deadlock when all workers are occupied by
                        # _handle_client tasks from the connection pool.
                        self._handle_call(payload, request_id, client)
                    elif msg_type == TYPE_HEALTH_PING:
                        resp = struct.pack(HEADER_FORMAT, PROTOCOL_VERSION, TYPE_HEALTH_PONG, request_id, 0)
                        client.sendall(resp)
        except Exception as e:
            if self._running:
                print(f"[chat-py] Client error: {e}", file=sys.stderr)

    def _handle_call(self, payload, request_id, client):
        try:
            buf = memoryview(payload)
            fn_name_len = struct.unpack_from("<H", buf, 0)[0]
            fn_name = bytes(buf[2:2 + fn_name_len]).decode("utf-8")
            args_offset = 2 + fn_name_len
            args_len = struct.unpack_from("<I", buf, args_offset)[0]
            args_json = bytes(buf[args_offset + 4:args_offset + 4 + args_len]).decode("utf-8")

            fn = _functions.get(fn_name)
            if fn is None:
                status = STATUS_ERROR
                result_json = _json_dumps({"error": f"Function '{fn_name}' not found"})
            else:
                try:
                    result_json = fn(args_json)
                    status = STATUS_OK
                except Exception as e:
                    status = STATUS_ERROR
                    result_json = _json_dumps({"error": str(e)})

            result_bytes = result_json.encode("utf-8")
            total_size = HEADER_SIZE + 1 + 4 + len(result_bytes)
            resp = bytearray(total_size)
            struct.pack_into(HEADER_FORMAT, resp, 0,
                             PROTOCOL_VERSION, TYPE_CALL_RESPONSE, request_id, 1 + 4 + len(result_bytes))
            struct.pack_into("<BI", resp, HEADER_SIZE, status, len(result_bytes))
            resp[HEADER_SIZE + 5:] = result_bytes
            client.sendall(resp)
        except Exception as e:
            print(f"[chat-py] Call error: {e}", file=sys.stderr)

    def _recv_exact(self, sock, n):
        buf = bytearray(n)
        mv = memoryview(buf)
        received = 0
        while received < n:
            try:
                got = sock.recv_into(mv[received:], n - received)
            except (OSError, ValueError):
                return None
            if got == 0:
                return None
            received += got
        return bytes(buf)


if __name__ == "__main__":
    register_function("moderateContent", moderate_content)
    register_function("searchMessages", search_messages)
    register_function("processAnalytics", process_analytics)
    register_function("recommendChannels", recommend_channels)
    register_function("buildNotifications", build_notifications)

    server = TransitServer()
    server.start()
