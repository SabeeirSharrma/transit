#!/usr/bin/env python3
"""Shared computation functions for chat server benchmark operations."""

import hashlib
import re
import time
import uuid
from collections import defaultdict


# ─── Message Send Pipeline (auth + mod + route + persist) ─────────────────────

def send_message_pipeline(data):
    """Full message pipeline: authenticate, moderate, route, persist."""
    message = data.get("message", "")
    sender_id = data.get("sender_id", "user_0")
    channel_id = data.get("channel_id", "channel_0")
    token = data.get("token", "tok_default")

    # Step 1: Auth
    auth_ok = len(token) > 0 and token.startswith("tok_")

    # Step 2: Content moderation
    flagged_words = {"spam", "scam", "hack", "phish"}
    words = message.lower().split()
    moderation_score = sum(1 for w in words if w in flagged_words)
    is_flagged = moderation_score > 0

    # Step 3: Route to channel
    routed = {
        "channel_id": channel_id,
        "priority": "high" if not is_flagged else "review",
    }

    # Step 4: Persist (simulated)
    message_id = f"msg_{abs(hash(message + sender_id)) % 10**8}"

    return {
        "message_id": message_id,
        "auth_ok": auth_ok,
        "flagged": is_flagged,
        "moderation_score": moderation_score,
        "routed_to": routed["channel_id"],
        "priority": routed["priority"],
    }


# ─── Fan-out Delivery (50 recipients) ────────────────────────────────────────

def fanout_delivery(data):
    """Deliver a message to multiple recipients with delivery tracking."""
    message = data.get("message", "default message")
    user_ids = data.get("user_ids", [f"user_{i}" for i in range(50)])

    deliveries = []
    for uid in user_ids:
        delivery_id = f"del_{abs(hash(message + uid)) % 10**8}"
        deliveries.append({
            "user_id": uid,
            "delivery_id": delivery_id,
            "status": "delivered",
        })

    return {
        "total_recipients": len(deliveries),
        "delivered": len([d for d in deliveries if d["status"] == "delivered"]),
        "failed": len([d for d in deliveries if d["status"] != "delivered"]),
    }


# ─── Session Validation ──────────────────────────────────────────────────────

def validate_session(data):
    """Validate a user session token and return session state."""
    token = data.get("token", "tok_default")
    user_id = data.get("user_id", "user_0")

    # Simulate token validation (hash-based)
    token_hash = hashlib.sha256(token.encode()).hexdigest()[:16]
    is_valid = len(token) > 4 and token.startswith("tok_")
    expires_at = time.time() + 3600

    return {
        "valid": is_valid,
        "user_id": user_id,
        "session_id": f"sess_{token_hash}",
        "expires_at": expires_at,
        "permissions": ["read", "write"] if is_valid else [],
    }


# ─── Typing Indicator ────────────────────────────────────────────────────────

def process_typing_indicator(data):
    """Process and broadcast a typing indicator."""
    user_id = data.get("user_id", "user_0")
    channel_id = data.get("channel_id", "channel_0")
    is_typing = data.get("is_typing", True)

    # Simulate processing
    indicator = {
        "user_id": user_id,
        "channel_id": channel_id,
        "status": "typing" if is_typing else "stopped",
        "timestamp": time.time(),
    }

    return {
        "broadcast": True,
        "recipients_notified": 15 if is_typing else 0,
        "indicator": indicator,
    }


# ─── Read Receipt ────────────────────────────────────────────────────────────

def process_read_receipt(data):
    """Process a read receipt for a message."""
    message_id = data.get("message_id", "msg_0")
    user_id = data.get("user_id", "user_0")
    channel_id = data.get("channel_id", "channel_0")

    receipt = {
        "message_id": message_id,
        "user_id": user_id,
        "read_at": time.time(),
        "channel_id": channel_id,
    }

    return {
        "receipt_id": f"rcpt_{abs(hash(message_id + user_id)) % 10**8}",
        "acknowledged": True,
        "sender_notified": True,
    }


# ─── Presence Update (30 contacts) ──────────────────────────────────────────

def update_presence(data):
    """Update presence status and compute online contacts."""
    user_id = data.get("user_id", "user_0")
    status = data.get("status", "online")
    contacts = data.get("contacts", [f"contact_{i}" for i in range(30)])

    # Simulate presence computation
    online_count = sum(1 for c in contacts if hash(c) % 3 != 0)
    offline_count = len(contacts) - online_count

    return {
        "user_id": user_id,
        "status": status,
        "online_contacts": online_count,
        "offline_contacts": offline_count,
        "total_contacts": len(contacts),
        "broadcast": True,
    }


# ─── AI Content Moderation ──────────────────────────────────────────────────

def moderate_content(data):
    """Run AI-based content moderation on text."""
    text = data.get("text", "")
    user_id = data.get("user_id", "user_0")

    # Simulate ML-based moderation (keyword + pattern matching)
    toxic_patterns = ["hate", "abuse", "harass", "bully", "threat"]
    spam_patterns = ["buy now", "click here", "free money", "act fast"]
    nsfw_patterns = ["explicit", "adult", "nsfw"]

    text_lower = text.lower()
    scores = {
        "toxic": sum(1 for p in toxic_patterns if p in text_lower),
        "spam": sum(1 for p in spam_patterns if p in text_lower),
        "nsfw": sum(1 for p in nsfw_patterns if p in text_lower),
    }

    max_score = max(scores.values()) if scores else 0
    is_safe = max_score == 0
    confidence = 0.95 - (max_score * 0.1)

    return {
        "safe": is_safe,
        "confidence": confidence,
        "scores": scores,
        "action": "allow" if is_safe else "flag",
        "user_id": user_id,
    }


# ─── Message Search (1000 messages) ─────────────────────────────────────────

def search_messages(data):
    """Search through messages with relevance scoring."""
    query = data.get("query", "hello")
    messages = data.get("messages", [])

    # Generate 1000 messages if not provided
    if not messages:
        messages = [
            {"id": f"msg_{i}", "text": f"Message {i} about topic {i % 20}", "sender": f"user_{i % 50}"}
            for i in range(1000)
        ]

    query_lower = query.lower()
    results = []
    for msg in messages:
        text = msg.get("text", "").lower()
        # Simple relevance scoring
        score = 0
        if query_lower in text:
            score = 1.0
        elif any(w in text for w in query_lower.split()):
            score = 0.5

        if score > 0:
            results.append({
                "id": msg["id"],
                "score": score,
                "text": msg["text"][:100],
                "sender": msg.get("sender", "unknown"),
            })

    results.sort(key=lambda x: x["score"], reverse=True)

    return {
        "query": query,
        "total_results": len(results),
        "results": results[:10],
        "search_time_ms": 0,
    }


# ─── Analytics Pipeline (500 events) ────────────────────────────────────────

def process_analytics(data):
    """Process analytics events and compute aggregates."""
    events = data.get("events", [])

    # Generate 500 events if not provided
    if not events:
        event_types = ["message_sent", "message_received", "user_joined", "user_left", "channel_created"]
        events = [
            {"type": event_types[i % len(event_types)], "user_id": f"user_{i % 50}", "timestamp": time.time() - i}
            for i in range(500)
        ]

    # Aggregate by type
    type_counts = defaultdict(int)
    user_counts = defaultdict(int)
    for event in events:
        type_counts[event.get("type", "unknown")] += 1
        user_counts[event.get("user_id", "unknown")] += 1

    # Top active users
    top_users = sorted(user_counts.items(), key=lambda x: x[1], reverse=True)[:10]

    return {
        "total_events": len(events),
        "event_types": dict(type_counts),
        "top_users": [{"user_id": u, "count": c} for u, c in top_users],
        "unique_users": len(user_counts),
    }


# ─── Notification Builder (20 users) ────────────────────────────────────────

def build_notifications(data):
    """Build personalized notifications for a batch of users."""
    users = data.get("users", [f"user_{i}" for i in range(20)])
    event_type = data.get("event_type", "new_message")

    notifications = []
    for uid in users:
        notif = {
            "user_id": uid,
            "type": event_type,
            "title": f"New {event_type.replace('_', ' ')}",
            "body": f"You have a new {event_type.replace('_', ' ')}",
            "priority": "normal",
            "created_at": time.time(),
        }
        notifications.append(notif)

    return {
        "total_notifications": len(notifications),
        "notifications": notifications,
        "batch_size": len(users),
    }


# ─── User Lookup ─────────────────────────────────────────────────────────────

def lookup_user(data):
    """Look up user profile information."""
    user_id = data.get("user_id", "user_0")

    # Simulate user profile lookup
    profile = {
        "user_id": user_id,
        "username": f"player_{user_id.split('_')[-1]}",
        "display_name": f"User {user_id.split('_')[-1]}",
        "avatar_url": f"https://cdn.example.com/avatars/{user_id}.png",
        "status": "online",
        "last_seen": time.time(),
        "permissions": ["read", "write", "upload"],
    }

    return {"profile": profile}


# ─── Channel History (50 messages) ──────────────────────────────────────────

def get_channel_history(data):
    """Fetch and format channel message history."""
    channel_id = data.get("channel_id", "channel_0")
    limit = data.get("limit", 50)

    # Simulate fetching messages
    messages = [
        {
            "id": f"msg_{i}",
            "sender": f"user_{i % 10}",
            "text": f"Historical message {i} in {channel_id}",
            "timestamp": time.time() - (limit - i) * 60,
            "reactions": {"thumbsup": i % 3, "heart": i % 5},
        }
        for i in range(limit)
    ]

    return {
        "channel_id": channel_id,
        "message_count": len(messages),
        "messages": messages,
        "has_more": True,
    }


# ─── Function registry ───────────────────────────────────────────────────────

FUNCTIONS = {
    "message_pipeline": send_message_pipeline,
    "fanout_delivery": fanout_delivery,
    "session_validation": validate_session,
    "typing_indicator": process_typing_indicator,
    "read_receipt": process_read_receipt,
    "presence_update": update_presence,
    "content_moderation": moderate_content,
    "message_search": search_messages,
    "analytics_pipeline": process_analytics,
    "notification_builder": build_notifications,
    "user_lookup": lookup_user,
    "channel_history": get_channel_history,
}
