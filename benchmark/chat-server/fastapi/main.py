"""Chat server benchmark — FastAPI equivalent for comparison."""
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from collections import Counter, defaultdict
import hashlib
import math
import re
import time

app = FastAPI(title="Chat Server Benchmark API")

# ─── In-memory stores ────────────────────────────────────────────────────────

USERS = {f"user_{i}": {"id": f"user_{i}", "name": f"User {i}", "email": f"user{i}@example.com"} for i in range(10000)}
SESSIONS = {f"session_{i}": {"user_id": f"user_{i % 10000}", "ttl": 3600} for i in range(5000)}
MESSAGES = {f"msg_{i}": {"id": f"msg_{i}", "channel": f"ch_{i % 100}", "content": f"Message {i}"} for i in range(50000)}
UNREAD = {f"user_{i % 10000}:ch_{i % 100}": i % 50 for i in range(50000)}

# ─── Request Models ──────────────────────────────────────────────────────────

class RouteMessageRequest(BaseModel):
    message: Dict[str, Any]
    recipients: List[str]

class FanoutRequest(BaseModel):
    message: Dict[str, Any]
    user_ids: List[str]

class AuthRequest(BaseModel):
    token: str
    user_id: str

class PresenceRequest(BaseModel):
    user_id: str
    status: str
    contacts: List[str]

class TypingRequest(BaseModel):
    user_id: str
    channel_id: str
    is_typing: bool

class PipelineRequest(BaseModel):
    token: str
    user_id: str
    message: Dict[str, Any]
    recipients: List[str]

class ReadReceiptRequest(BaseModel):
    user_id: str
    channel_id: str
    last_read_msg_id: str

class ModerateRequest(BaseModel):
    content: str
    sender_id: str
    channel_id: str

class SearchRequest(BaseModel):
    query: str
    channel_id: str
    limit: int = 20
    messages: List[Dict[str, Any]] = []

class AnalyticsRequest(BaseModel):
    events: List[Dict[str, Any]]

class RecommendRequest(BaseModel):
    user_id: str
    user_history: List[Dict[str, Any]]
    all_channels: List[Dict[str, Any]]

class NotifyRequest(BaseModel):
    event_type: str
    payload: Dict[str, Any]
    recipients: List[Dict[str, Any]]

class LookupUserRequest(BaseModel):
    user_id: str

class CreateSessionRequest(BaseModel):
    user_id: str

class PersistMessageRequest(BaseModel):
    id: str
    channel_id: str
    content: str

class ChannelHistoryRequest(BaseModel):
    channel_id: str
    limit: int = 50

class UserSearchRequest(BaseModel):
    query: str
    limit: int = 20


# ─── Toxicity patterns ───────────────────────────────────────────────────────

_TOXIC_PATTERNS = [
    r"\b(spam|scam|phish)\b",
    r"\b(hack|exploit|bypass)\b",
    r"(https?://[^\s]+){3,}",
]

_SPAM_INDICATORS = [
    "buy now", "click here", "free money", "act now",
    "limited time", "congratulations", "you won",
]


# ─── Rust-equivalent endpoints ───────────────────────────────────────────────

@app.post("/route-message")
async def route_message(req: RouteMessageRequest):
    start = time.perf_counter()
    msg = req.message
    delivered = list(req.recipients)
    elapsed = (time.perf_counter() - start) * 1000
    return {"message_id": msg.get("id", ""), "delivered_to": delivered, "delivery_time_ms": elapsed}


@app.post("/fanout-delivery")
async def fanout_delivery(req: FanoutRequest):
    start = time.perf_counter()
    msg = req.message
    notified = []
    for uid in req.user_ids:
        h = hashlib.sha256(f"{uid}{msg.get('id', '')}".encode()).hexdigest()
        notified.append(uid)
    elapsed = (time.perf_counter() - start) * 1000
    return {"message_id": msg.get("id", ""), "delivered_to": notified, "delivery_time_ms": elapsed}


@app.post("/validate-session")
async def validate_session(req: AuthRequest):
    start = time.perf_counter()
    h = hashlib.sha256(req.token.encode()).hexdigest()
    valid = bool(h) and bool(req.user_id)
    elapsed = (time.perf_counter() - start) * 1000
    return {"valid": valid, "user_id": req.user_id, "session_ttl": 3600 if valid else 0}


@app.post("/update-presence")
async def update_presence(req: PresenceRequest):
    start = time.perf_counter()
    notified = list(req.contacts)
    elapsed = (time.perf_counter() - start) * 1000
    return {"user_id": req.user_id, "status": req.status, "contacts_notified": notified, "update_time_ms": elapsed}


@app.post("/process-typing")
async def process_typing(req: TypingRequest):
    h = hashlib.sha256(f"{req.user_id}{req.channel_id}{req.is_typing}".encode()).hexdigest()
    return {"user_id": req.user_id, "channel_id": req.channel_id, "is_typing": req.is_typing, "processed": True}


@app.post("/send-message-pipeline")
async def send_message_pipeline(req: PipelineRequest):
    pipeline_start = time.perf_counter()

    # Step 1: Auth
    auth_start = time.perf_counter()
    hashlib.sha256(req.token.encode()).hexdigest()
    auth_ms = (time.perf_counter() - auth_start) * 1000

    # Step 2: Moderate
    mod_start = time.perf_counter()
    content = req.message.get("content", "").lower()
    mod_ms = (time.perf_counter() - mod_start) * 1000

    # Step 3: Route
    route_start = time.perf_counter()
    delivered = list(req.recipients)
    route_ms = (time.perf_counter() - route_start) * 1000

    # Step 4: Persist
    persist_start = time.perf_counter()
    hashlib.sha256(content.encode()).hexdigest()
    persist_ms = (time.perf_counter() - persist_start) * 1000

    total_ms = (time.perf_counter() - pipeline_start) * 1000

    return {
        "message_id": req.message.get("id", ""),
        "auth_ms": auth_ms,
        "moderate_ms": mod_ms,
        "route_ms": route_ms,
        "persist_ms": persist_ms,
        "total_ms": total_ms,
    }


@app.post("/process-read-receipt")
async def process_read_receipt(req: ReadReceiptRequest):
    start = time.perf_counter()
    key = f"{req.user_id}:{req.channel_id}"
    current = UNREAD.get(key, 0)
    new_count = max(0, current - 5)
    UNREAD[key] = new_count
    elapsed = (time.perf_counter() - start) * 1000
    return {"user_id": req.user_id, "channel_id": req.channel_id, "last_read_msg_id": req.last_read_msg_id, "unread_delta": new_count - current, "process_time_ms": elapsed}


# ─── Python-equivalent endpoints ─────────────────────────────────────────────

@app.post("/moderate-content")
async def moderate_content(req: ModerateRequest):
    start = time.perf_counter()
    content_lower = req.content.lower()
    flags = []
    confidence = 0.0

    for pattern in _TOXIC_PATTERNS:
        if re.search(pattern, content_lower):
            flags.append("toxic_pattern")
            confidence += 0.3

    spam_score = sum(1 for ind in _SPAM_INDICATORS if ind in content_lower)
    if spam_score >= 2:
        flags.append("spam")
        confidence += 0.4

    alpha = [c for c in req.content if c.isalpha()]
    if alpha and sum(1 for c in alpha if c.isupper()) / len(alpha) > 0.7:
        flags.append("excessive_caps")
        confidence += 0.2

    mentions = len(re.findall(r"@\w+", req.content))
    if mentions > 5:
        flags.append("excessive_mentions")
        confidence += 0.2

    if len(req.content) > 5000:
        flags.append("oversized_message")
        confidence += 0.1

    _ = sum(math.sin(i * 0.01) for i in range(len(req.content)))
    confidence = min(confidence, 1.0)
    action = "block" if confidence > 0.7 else ("flag" if confidence > 0.4 else "allow")

    elapsed = (time.perf_counter() - start) * 1000
    return {"action": action, "confidence": confidence, "flags": flags, "process_time_ms": elapsed}


@app.post("/search-messages")
async def search_messages(req: SearchRequest):
    start = time.perf_counter()
    query_terms = req.query.lower().split()
    scored = []

    for msg in req.messages:
        content = msg.get("content", "").lower()
        score = 0.0
        for term in query_terms:
            count = content.count(term)
            if count > 0:
                score += count / (len(content.split()) + 1)
                if term in content:
                    score += 0.1

        if score > 0:
            words = content.split()
            snippet = " ".join(words[:50])
            if len(words) > 50:
                snippet += "..."
            scored.append({"id": msg.get("id", ""), "sender_id": msg.get("sender_id", ""), "content_preview": snippet, "score": round(score, 4)})

    scored.sort(key=lambda x: x["score"], reverse=True)
    elapsed = (time.perf_counter() - start) * 1000
    return {"query": req.query, "results": scored[:req.limit], "total_matches": len(scored), "search_time_ms": elapsed}


@app.post("/process-analytics")
async def process_analytics(req: AnalyticsRequest):
    start = time.perf_counter()
    type_counts = Counter()
    user_activity = Counter()
    hourly_volume = defaultdict(int)

    for event in req.events:
        type_counts[event.get("type", "unknown")] += 1
        user_activity[event.get("user_id", "")] += 1
        hourly_volume[event.get("hour", 0)] += 1

    total = len(req.events)
    unique_users = len(user_activity)
    peak_hour = max(hourly_volume.items(), key=lambda x: x[1])[0] if hourly_volume else 0
    engagement = sum(min(v / 10, 1.0) for v in user_activity.values()) / max(unique_users, 1)
    _ = sum(math.sqrt(i) for i in range(min(total, 1000)))

    elapsed = (time.perf_counter() - start) * 1000
    return {"total_events": total, "unique_users": unique_users, "type_breakdown": dict(type_counts), "peak_hour": peak_hour, "engagement_score": round(engagement, 4), "process_time_ms": elapsed}


@app.post("/recommend-channels")
async def recommend_channels(req: RecommendRequest):
    start = time.perf_counter()
    interest = Counter()
    for a in req.user_history:
        interest[a.get("channel_id", "")] += a.get("engagement_weight", 1.0)

    joined = set(a.get("channel_id", "") for a in req.user_history)
    candidates = [c for c in req.all_channels if c.get("id", "") not in joined]

    scored = []
    for ch in candidates:
        score = ch.get("member_count", 0) / 10000.0 * 0.1
        scored.append({"channel_id": ch.get("id", ""), "name": ch.get("name", ""), "score": round(score, 4), "reason": "based on your activity"})

    scored.sort(key=lambda x: x["score"], reverse=True)
    elapsed = (time.perf_counter() - start) * 1000
    return {"user_id": req.user_id, "recommendations": scored[:10], "process_time_ms": elapsed}


@app.post("/build-notifications")
async def build_notifications(req: NotifyRequest):
    start = time.perf_counter()
    notifications = []

    for user in req.recipients:
        user_id = user.get("user_id", "")
        prefs = user.get("preferences", {})
        title = ""
        body = ""
        priority = "normal"

        if req.event_type == "message":
            sender_name = req.payload.get("sender_name", "Someone")
            channel_name = req.payload.get("channel_name", "a channel")
            title = f"New message in {channel_name}"
            body = f"{sender_name}: {req.payload.get('preview', '')[:100]}"
            priority = "high" if req.payload.get("is_mention") else "normal"
        elif req.event_type == "mention":
            title = "You were mentioned"
            body = req.payload.get("text", "")[:200]
            priority = "high"
        elif req.event_type == "invite":
            title = "Channel invitation"
            body = f"You've been invited to {req.payload.get('channel_name', '')}"

        hashlib.sha256(f"{user_id}{title}".encode()).hexdigest()
        notifications.append({"user_id": user_id, "title": title, "body": body, "priority": priority, "channel": prefs.get("notification_channel", "push")})

    elapsed = (time.perf_counter() - start) * 1000
    return {"notifications_built": len(notifications), "notifications": notifications, "process_time_ms": elapsed}


# ─── Java-equivalent endpoints ───────────────────────────────────────────────

@app.post("/lookup-user")
async def lookup_user(req: LookupUserRequest):
    start = time.perf_counter()
    user = USERS.get(req.user_id)
    if not user:
        return {"error": "User not found", "user_id": req.user_id}
    h = hashlib.sha256(req.user_id.encode()).hexdigest()
    elapsed = (time.perf_counter() - start) * 1000
    return {"user": user, "permission_hash": h, "lookup_time_ms": elapsed}


@app.post("/create-session")
async def create_session(req: CreateSessionRequest):
    start = time.perf_counter()
    token = hashlib.sha256(f"{req.user_id}{time.time_ns()}".encode()).hexdigest()
    SESSIONS[token] = {"user_id": req.user_id, "ttl": 3600}
    elapsed = (time.perf_counter() - start) * 1000
    return {"token": token, "user_id": req.user_id, "ttl": 3600, "create_time_ms": elapsed}


@app.post("/persist-message")
async def persist_message(req: PersistMessageRequest):
    start = time.perf_counter()
    MESSAGES[req.id] = {"id": req.id, "channel": req.channel_id, "content": req.content}
    h = hashlib.sha256(req.id.encode()).hexdigest()
    elapsed = (time.perf_counter() - start) * 1000
    return {"persisted": True, "msg_id": req.id, "storage_ref": h, "persist_time_ms": elapsed}


@app.post("/get-channel-history")
async def get_channel_history(req: ChannelHistoryRequest):
    start = time.perf_counter()
    history = []
    for i in range(min(req.limit, 100)):
        msg_id = f"msg_{i * 100}"
        if msg_id in MESSAGES:
            history.append(MESSAGES[msg_id])
    elapsed = (time.perf_counter() - start) * 1000
    return {"channel_id": req.channel_id, "messages": history, "count": len(history), "fetch_time_ms": elapsed}


@app.post("/search-users")
async def search_users(req: UserSearchRequest):
    start = time.perf_counter()
    query = req.query.lower()
    results = []
    for uid, data in USERS.items():
        if len(results) >= req.limit:
            break
        if query in uid.lower() or query in str(data).lower():
            score = 1.0 if query in uid.lower() else 0.5
            results.append({"user_id": uid, "score": score})
    results.sort(key=lambda x: x["score"], reverse=True)
    elapsed = (time.perf_counter() - start) * 1000
    return {"query": req.query, "results": results, "total": len(results), "search_time_ms": elapsed}


# ─── Health ──────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "chat-benchmark"}
