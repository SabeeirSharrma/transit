#!/usr/bin/env python3
"""gRPC server for chat server benchmark."""

import json
import time
import hashlib
import random
import string
import threading
from concurrent import futures

import grpc
from benchmark_pb2 import (
    SendMessageRequest, SendMessageResponse,
    ValidateSessionRequest, ValidateSessionResponse,
    ModerateContentRequest, ModerateContentResponse,
    RouteMessageRequest, RouteMessageResponse,
    SearchMessagesRequest, SearchMessagesResponse,
    GetAnalyticsRequest, GetAnalyticsResponse,
    GetUserRequest, GetUserResponse,
    GetChannelHistoryRequest, GetChannelHistoryResponse,
    SearchResult, Message
)
import benchmark_pb2_grpc as benchmark_pb2_grpc


class ChatServiceServicer(benchmark_pb2_grpc.ChatServiceServicer):
    """gRPC service implementing chat operations."""

    def __init__(self):
        self.lock = threading.Lock()
        self.users = self._init_users()
        self.sessions = self._init_sessions()
        self.messages = self._init_messages()

    def _init_users(self):
        """Initialize mock user data."""
        users = {}
        for i in range(1000):
            user_id = f"user_{i}"
            users[user_id] = {
                "user_id": user_id,
                "username": f"user{i}",
                "email": f"user{i}@example.com"
            }
        return users

    def _init_sessions(self):
        """Initialize mock session data."""
        sessions = {}
        for i in range(100):
            token = f"token_{i}"
            sessions[token] = {
                "user_id": f"user_{i % 1000}",
                "valid": True
            }
        return sessions

    def _init_messages(self):
        """Initialize mock message data."""
        messages = []
        for i in range(10000):
            messages.append({
                "message_id": f"msg_{i}",
                "user_id": f"user_{i % 1000}",
                "channel_id": f"channel_{i % 100}",
                "content": f"Message {i}: " + "".join(random.choices(string.ascii_letters, k=50)),
                "timestamp": int(time.time()) - random.randint(0, 86400)
            })
        return messages

    def SendMessage(self, request, context):
        """Handle message send request."""
        start = time.perf_counter()
        
        # Simulate message processing
        message_id = f"msg_{random.randint(10000, 99999)}"
        
        # Validate session
        # Moderate content
        # Route to recipients
        # Persist message
        
        end = time.perf_counter()
        
        return SendMessageResponse(
            message_id=message_id,
            delivered=True,
            execution_time_ms=(end - start) * 1000
        )

    def ValidateSession(self, request, context):
        """Handle session validation request."""
        start = time.perf_counter()
        
        session = self.sessions.get(request.session_token)
        valid = session is not None and session.get("valid", False)
        user_id = session.get("user_id", "") if session else ""
        
        end = time.perf_counter()
        
        return ValidateSessionResponse(
            valid=valid,
            user_id=user_id,
            execution_time_ms=(end - start) * 1000
        )

    def ModerateContent(self, request, context):
        """Handle content moderation request."""
        start = time.perf_counter()
        
        # Simulate ML model inference
        toxicity_score = random.random() * 0.3
        safe = toxicity_score < 0.2
        
        end = time.perf_counter()
        
        return ModerateContentResponse(
            safe=safe,
            toxicity_score=toxicity_score,
            reason="Safe" if safe else "Toxic content detected",
            execution_time_ms=(end - start) * 1000
        )

    def RouteMessage(self, request, context):
        """Handle message routing request."""
        start = time.perf_counter()
        
        # Simulate routing to recipients
        delivered_count = len(request.recipient_ids)
        
        end = time.perf_counter()
        
        return RouteMessageResponse(
            delivered_count=delivered_count,
            execution_time_ms=(end - start) * 1000
        )

    def SearchMessages(self, request, context):
        """Handle message search request."""
        start = time.perf_counter()
        
        # Simulate full-text search
        results = []
        for msg in self.messages[:100]:
            if request.query.lower() in msg["content"].lower():
                results.append(SearchResult(
                    message_id=msg["message_id"],
                    content=msg["content"][:100],
                    score=random.random()
                ))
                if len(results) >= request.limit:
                    break
        
        end = time.perf_counter()
        
        return SearchMessagesResponse(
            results=results,
            execution_time_ms=(end - start) * 1000
        )

    def GetAnalytics(self, request, context):
        """Handle analytics request."""
        start = time.perf_counter()
        
        # Simulate analytics aggregation
        event_count = random.randint(100, 10000)
        breakdown = {
            "desktop": random.randint(0, event_count),
            "mobile": random.randint(0, event_count),
            "api": random.randint(0, event_count)
        }
        
        end = time.perf_counter()
        
        return GetAnalyticsResponse(
            event_count=event_count,
            breakdown=breakdown,
            execution_time_ms=(end - start) * 1000
        )

    def GetUser(self, request, context):
        """Handle user lookup request."""
        start = time.perf_counter()
        
        user = self.users.get(request.user_id)
        if user:
            response = GetUserResponse(
                user_id=user["user_id"],
                username=user["username"],
                email=user["email"],
                execution_time_ms=0
            )
        else:
            response = GetUserResponse(
                user_id="",
                username="",
                email="",
                execution_time_ms=0
            )
        
        end = time.perf_counter()
        response.execution_time_ms = (end - start) * 1000
        
        return response

    def GetChannelHistory(self, request, context):
        """Handle channel history request."""
        start = time.perf_counter()
        
        # Filter messages by channel
        channel_msgs = [m for m in self.messages if m["channel_id"] == request.channel_id]
        channel_msgs.sort(key=lambda x: x["timestamp"], reverse=True)
        
        # Apply limit
        channel_msgs = channel_msgs[:request.limit]
        
        # Convert to proto messages
        messages = [
            Message(
                message_id=m["message_id"],
                user_id=m["user_id"],
                content=m["content"],
                timestamp=m["timestamp"]
            )
            for m in channel_msgs
        ]
        
        end = time.perf_counter()
        
        return GetChannelHistoryResponse(
            messages=messages,
            execution_time_ms=(end - start) * 1000
        )


def serve():
    """Start the gRPC server."""
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=8))
    benchmark_pb2_grpc.add_ChatServiceServicer_to_server(
        ChatServiceServicer(), server
    )
    server.add_insecure_port("[::]:50052")
    server.start()
    print("gRPC server started on port 50052")
    server.wait_for_termination()


if __name__ == "__main__":
    serve()
