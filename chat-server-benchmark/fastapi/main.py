"""FastAPI server for chat server benchmark operations."""
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Optional
import time
import sys
import os

# Add shared module to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared"))
from computations import (
    send_message_pipeline, fanout_delivery, validate_session,
    process_typing_indicator, process_read_receipt, update_presence,
    moderate_content, search_messages, process_analytics,
    build_notifications, lookup_user, get_channel_history,
)

app = FastAPI(title="Chat Server Benchmark API")


# ─── Request Models ──────────────────────────────────────────────────────────

class MessagePipelineRequest(BaseModel):
    message: str = "Hello, world!"
    sender_id: str = "user_0"
    channel_id: str = "channel_0"
    token: str = "tok_default"

class FanoutRequest(BaseModel):
    message: str = "Broadcast message"
    user_ids: List[str] = [f"user_{i}" for i in range(50)]

class SessionRequest(BaseModel):
    token: str = "tok_default"
    user_id: str = "user_0"

class TypingRequest(BaseModel):
    user_id: str = "user_0"
    channel_id: str = "channel_0"
    is_typing: bool = True

class ReadReceiptRequest(BaseModel):
    message_id: str = "msg_0"
    user_id: str = "user_0"
    channel_id: str = "channel_0"

class PresenceRequest(BaseModel):
    user_id: str = "user_0"
    status: str = "online"
    contacts: List[str] = [f"contact_{i}" for i in range(30)]

class ModerationRequest(BaseModel):
    text: str = "This is a normal message"
    user_id: str = "user_0"

class SearchRequest(BaseModel):
    query: str = "hello"
    messages: List[dict] = []

class AnalyticsRequest(BaseModel):
    events: List[dict] = []

class NotificationRequest(BaseModel):
    users: List[str] = [f"user_{i}" for i in range(20)]
    event_type: str = "new_message"

class UserLookupRequest(BaseModel):
    user_id: str = "user_0"

class ChannelHistoryRequest(BaseModel):
    channel_id: str = "channel_0"
    limit: int = 50


# ─── Endpoints ───────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "chat-server-benchmark"}


@app.post("/message-pipeline")
async def api_message_pipeline(req: MessagePipelineRequest):
    start = time.perf_counter()
    result = send_message_pipeline(req.model_dump())
    result["duration_ms"] = (time.perf_counter() - start) * 1000
    return result


@app.post("/fanout-delivery")
async def api_fanout_delivery(req: FanoutRequest):
    start = time.perf_counter()
    result = fanout_delivery(req.model_dump())
    result["duration_ms"] = (time.perf_counter() - start) * 1000
    return result


@app.post("/session-validation")
async def api_session_validation(req: SessionRequest):
    start = time.perf_counter()
    result = validate_session(req.model_dump())
    result["duration_ms"] = (time.perf_counter() - start) * 1000
    return result


@app.post("/typing-indicator")
async def api_typing_indicator(req: TypingRequest):
    start = time.perf_counter()
    result = process_typing_indicator(req.model_dump())
    result["duration_ms"] = (time.perf_counter() - start) * 1000
    return result


@app.post("/read-receipt")
async def api_read_receipt(req: ReadReceiptRequest):
    start = time.perf_counter()
    result = process_read_receipt(req.model_dump())
    result["duration_ms"] = (time.perf_counter() - start) * 1000
    return result


@app.post("/presence-update")
async def api_presence_update(req: PresenceRequest):
    start = time.perf_counter()
    result = update_presence(req.model_dump())
    result["duration_ms"] = (time.perf_counter() - start) * 1000
    return result


@app.post("/content-moderation")
async def api_content_moderation(req: ModerationRequest):
    start = time.perf_counter()
    result = moderate_content(req.model_dump())
    result["duration_ms"] = (time.perf_counter() - start) * 1000
    return result


@app.post("/message-search")
async def api_message_search(req: SearchRequest):
    start = time.perf_counter()
    result = search_messages(req.model_dump())
    result["duration_ms"] = (time.perf_counter() - start) * 1000
    return result


@app.post("/analytics-pipeline")
async def api_analytics_pipeline(req: AnalyticsRequest):
    start = time.perf_counter()
    result = process_analytics(req.model_dump())
    result["duration_ms"] = (time.perf_counter() - start) * 1000
    return result


@app.post("/notification-builder")
async def api_notification_builder(req: NotificationRequest):
    start = time.perf_counter()
    result = build_notifications(req.model_dump())
    result["duration_ms"] = (time.perf_counter() - start) * 1000
    return result


@app.post("/user-lookup")
async def api_user_lookup(req: UserLookupRequest):
    start = time.perf_counter()
    result = lookup_user(req.model_dump())
    result["duration_ms"] = (time.perf_counter() - start) * 1000
    return result


@app.post("/channel-history")
async def api_channel_history(req: ChannelHistoryRequest):
    start = time.perf_counter()
    result = get_channel_history(req.model_dump())
    result["duration_ms"] = (time.perf_counter() - start) * 1000
    return result
