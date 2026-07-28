#!/usr/bin/env python3
"""Transit Python service for chat server benchmark operations."""

import json
import hashlib
import time
from collections import defaultdict

from transit_server import TransitServer, register_function


# ─── Message Send Pipeline ──────────────────────────────────────────────────

def send_message_pipeline(args_json):
    args = json.loads(args_json)
    message = args.get("message", "Hello, world!")
    sender_id = args.get("sender_id", "user_0")
    channel_id = args.get("channel_id", "channel_0")
    token = args.get("token", "tok_default")

    auth_ok = len(token) > 0 and token.startswith("tok_")
    flagged_words = {"spam", "scam", "hack", "phish"}
    words = message.lower().split()
    moderation_score = sum(1 for w in words if w in flagged_words)
    is_flagged = moderation_score > 0
    priority = "high" if not is_flagged else "review"
    message_id = f"msg_{abs(hash(message + sender_id)) % 10**8}"

    return json.dumps({"message_id": message_id, "auth_ok": auth_ok, "flagged": is_flagged,
            "moderation_score": moderation_score, "routed_to": channel_id, "priority": priority})


# ─── Fan-out Delivery ───────────────────────────────────────────────────────

def fanout_delivery(args_json):
    args = json.loads(args_json)
    message = args.get("message", "Broadcast message")
    user_ids = args.get("user_ids", [f"user_{i}" for i in range(50)])
    return json.dumps({"total_recipients": len(user_ids), "delivered": len(user_ids), "failed": 0})


# ─── Session Validation ─────────────────────────────────────────────────────

def validate_session(args_json):
    args = json.loads(args_json)
    token = args.get("token", "tok_default")
    user_id = args.get("user_id", "user_0")
    is_valid = len(token) > 4 and token.startswith("tok_")
    token_hash = hashlib.sha256(token.encode()).hexdigest()[:16]
    permissions = ["read", "write"] if is_valid else []
    return json.dumps({"valid": is_valid, "user_id": user_id, "session_id": f"sess_{token_hash}",
            "expires_at": time.time() + 3600, "permissions": permissions})


# ─── Typing Indicator ───────────────────────────────────────────────────────

def process_typing_indicator(args_json):
    args = json.loads(args_json)
    is_typing = args.get("is_typing", True)
    return json.dumps({"broadcast": True, "recipients_notified": 15 if is_typing else 0})


# ─── Read Receipt ───────────────────────────────────────────────────────────

def process_read_receipt(args_json):
    args = json.loads(args_json)
    message_id = args.get("message_id", "msg_0")
    user_id = args.get("user_id", "user_0")
    receipt_id = f"rcpt_{abs(hash(message_id + user_id)) % 10**8}"
    return json.dumps({"receipt_id": receipt_id, "acknowledged": True, "sender_notified": True})


# ─── Presence Update ────────────────────────────────────────────────────────

def update_presence(args_json):
    args = json.loads(args_json)
    user_id = args.get("user_id", "user_0")
    status = args.get("status", "online")
    contacts = args.get("contacts", [f"contact_{i}" for i in range(30)])
    online = sum(1 for c in contacts if hash(c) % 3 != 0)
    return json.dumps({"user_id": user_id, "status": status, "online_contacts": online,
            "offline_contacts": len(contacts) - online, "total_contacts": len(contacts), "broadcast": True})


# ─── Content Moderation ─────────────────────────────────────────────────────

def moderate_content(args_json):
    args = json.loads(args_json)
    text = args.get("text", "")
    user_id = args.get("user_id", "user_0")
    toxic = ["hate", "abuse", "harass", "bully", "threat"]
    spam = ["buy now", "click here", "free money", "act fast"]
    nsfw = ["explicit", "adult", "nsfw"]
    text_lower = text.lower()
    scores = {"toxic": sum(1 for p in toxic if p in text_lower),
              "spam": sum(1 for p in spam if p in text_lower),
              "nsfw": sum(1 for p in nsfw if p in text_lower)}
    max_score = max(scores.values()) if scores else 0
    return json.dumps({"safe": max_score == 0, "confidence": 0.95 - max_score * 0.1,
            "scores": scores, "action": "allow" if max_score == 0 else "flag", "user_id": user_id})


# ─── Message Search ─────────────────────────────────────────────────────────

def search_messages(args_json):
    args = json.loads(args_json)
    query = args.get("query", "hello")
    messages = args.get("messages", [])
    if not messages:
        messages = [{"id": f"msg_{i}", "text": f"Message {i} about topic {i % 20}", "sender": f"user_{i % 50}"}
                    for i in range(1000)]
    query_lower = query.lower()
    count = sum(1 for m in messages if query_lower in m.get("text", "").lower() or
                any(w in m.get("text", "").lower() for w in query_lower.split()))
    return json.dumps({"query": query, "total_results": count, "search_time_ms": 0})


# ─── Analytics Pipeline ─────────────────────────────────────────────────────

def process_analytics(args_json):
    args = json.loads(args_json)
    events = args.get("events", [])
    if not events:
        types = ["message_sent", "message_received", "user_joined", "user_left", "channel_created"]
        events = [{"type": types[i % len(types)], "user_id": f"user_{i % 50}"} for i in range(500)]
    type_counts = defaultdict(int)
    user_set = set()
    for e in events:
        type_counts[e.get("type", "unknown")] += 1
        user_set.add(e.get("user_id", "unknown"))
    return json.dumps({"total_events": len(events), "event_types": dict(type_counts), "unique_users": len(user_set)})


# ─── Notification Builder ───────────────────────────────────────────────────

def build_notifications(args_json):
    args = json.loads(args_json)
    users = args.get("users", [f"user_{i}" for i in range(20)])
    return json.dumps({"total_notifications": len(users), "batch_size": len(users)})


# ─── User Lookup ────────────────────────────────────────────────────────────

def lookup_user(args_json):
    args = json.loads(args_json)
    user_id = args.get("user_id", "user_0")
    num = user_id.split("_")[-1]
    return json.dumps({"profile": {"user_id": user_id, "username": f"player_{num}",
            "display_name": f"User {num}", "status": "online", "permissions": ["read", "write", "upload"]}})


# ─── Channel History ────────────────────────────────────────────────────────

def get_channel_history(args_json):
    args = json.loads(args_json)
    channel_id = args.get("channel_id", "channel_0")
    limit = args.get("limit", 50)
    return json.dumps({"channel_id": channel_id, "message_count": limit, "has_more": True})


# ─── Register and Start ─────────────────────────────────────────────────────

if __name__ == "__main__":
    server = TransitServer()
    register_function("sendMessagePipeline", send_message_pipeline)
    register_function("fanoutDelivery", fanout_delivery)
    register_function("validateSession", validate_session)
    register_function("processTypingIndicator", process_typing_indicator)
    register_function("processReadReceipt", process_read_receipt)
    register_function("updatePresence", update_presence)
    register_function("moderateContent", moderate_content)
    register_function("searchMessages", search_messages)
    register_function("processAnalytics", process_analytics)
    register_function("buildNotifications", build_notifications)
    register_function("lookupUser", lookup_user)
    register_function("getChannelHistory", get_channel_history)
    server.start()
