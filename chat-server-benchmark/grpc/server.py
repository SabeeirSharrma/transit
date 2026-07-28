#!/usr/bin/env python3
"""gRPC server for chat server benchmark operations."""

import json
import os
import sys
import time
import grpc
from concurrent import futures

# Add current directory to path for generated protobuf code
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from shared.computations import FUNCTIONS

# Import generated protobuf code
import chat_pb2
import chat_pb2_grpc


class ChatServiceServicer(chat_pb2_grpc.ChatServiceServicer):
    def _dispatch(self, operation, data):
        fn = FUNCTIONS.get(operation)
        if not fn:
            raise ValueError(f"Unknown operation: {operation}")
        return fn(data)

    def Compute(self, request, context):
        start = time.time()
        operation = request.operation
        data = json.loads(request.payload.decode("utf-8"))
        result = self._dispatch(operation, data)
        elapsed = (time.time() - start) * 1000
        return chat_pb2.ComputeResponse(
            result=json.dumps(result).encode("utf-8"),
            execution_time_ms=elapsed,
        )

    def SendMessagePipeline(self, request, context):
        start = time.time()
        data = {
            "message": request.message,
            "sender_id": request.sender_id,
            "channel_id": request.channel_id,
            "token": request.token,
        }
        result = FUNCTIONS["message_pipeline"](data)
        elapsed = (time.time() - start) * 1000
        return chat_pb2.SendMessageResponse(
            result=json.dumps(result).encode("utf-8"),
            execution_time_ms=elapsed,
        )

    def FanoutDelivery(self, request, context):
        start = time.time()
        data = {
            "message": request.message,
            "user_ids": json.loads(request.user_ids_json),
        }
        result = FUNCTIONS["fanout_delivery"](data)
        elapsed = (time.time() - start) * 1000
        return chat_pb2.FanoutResponse(
            result=json.dumps(result).encode("utf-8"),
            execution_time_ms=elapsed,
        )

    def ValidateSession(self, request, context):
        start = time.time()
        data = {"token": request.token, "user_id": request.user_id}
        result = FUNCTIONS["session_validation"](data)
        elapsed = (time.time() - start) * 1000
        return chat_pb2.SessionResponse(
            result=json.dumps(result).encode("utf-8"),
            execution_time_ms=elapsed,
        )

    def ProcessTypingIndicator(self, request, context):
        start = time.time()
        data = {
            "user_id": request.user_id,
            "channel_id": request.channel_id,
            "is_typing": request.is_typing,
        }
        result = FUNCTIONS["typing_indicator"](data)
        elapsed = (time.time() - start) * 1000
        return chat_pb2.TypingResponse(
            result=json.dumps(result).encode("utf-8"),
            execution_time_ms=elapsed,
        )

    def ProcessReadReceipt(self, request, context):
        start = time.time()
        data = {
            "message_id": request.message_id,
            "user_id": request.user_id,
            "channel_id": request.channel_id,
        }
        result = FUNCTIONS["read_receipt"](data)
        elapsed = (time.time() - start) * 1000
        return chat_pb2.ReadReceiptResponse(
            result=json.dumps(result).encode("utf-8"),
            execution_time_ms=elapsed,
        )

    def UpdatePresence(self, request, context):
        start = time.time()
        data = {
            "user_id": request.user_id,
            "status": request.status,
            "contacts": json.loads(request.contacts_json),
        }
        result = FUNCTIONS["presence_update"](data)
        elapsed = (time.time() - start) * 1000
        return chat_pb2.PresenceResponse(
            result=json.dumps(result).encode("utf-8"),
            execution_time_ms=elapsed,
        )

    def ModerateContent(self, request, context):
        start = time.time()
        data = {"text": request.text, "user_id": request.user_id}
        result = FUNCTIONS["content_moderation"](data)
        elapsed = (time.time() - start) * 1000
        return chat_pb2.ModerateResponse(
            result=json.dumps(result).encode("utf-8"),
            execution_time_ms=elapsed,
        )

    def SearchMessages(self, request, context):
        start = time.time()
        data = {
            "query": request.query,
            "messages": json.loads(request.messages_json) if request.messages_json else [],
        }
        result = FUNCTIONS["message_search"](data)
        elapsed = (time.time() - start) * 1000
        return chat_pb2.SearchResponse(
            result=json.dumps(result).encode("utf-8"),
            execution_time_ms=elapsed,
        )

    def ProcessAnalytics(self, request, context):
        start = time.time()
        data = {"events": json.loads(request.events_json) if request.events_json else []}
        result = FUNCTIONS["analytics_pipeline"](data)
        elapsed = (time.time() - start) * 1000
        return chat_pb2.AnalyticsResponse(
            result=json.dumps(result).encode("utf-8"),
            execution_time_ms=elapsed,
        )

    def BuildNotifications(self, request, context):
        start = time.time()
        data = {
            "users": json.loads(request.users_json) if request.users_json else [],
            "event_type": request.event_type,
        }
        result = FUNCTIONS["notification_builder"](data)
        elapsed = (time.time() - start) * 1000
        return chat_pb2.NotificationResponse(
            result=json.dumps(result).encode("utf-8"),
            execution_time_ms=elapsed,
        )

    def LookupUser(self, request, context):
        start = time.time()
        data = {"user_id": request.user_id}
        result = FUNCTIONS["user_lookup"](data)
        elapsed = (time.time() - start) * 1000
        return chat_pb2.UserLookupResponse(
            result=json.dumps(result).encode("utf-8"),
            execution_time_ms=elapsed,
        )

    def GetChannelHistory(self, request, context):
        start = time.time()
        data = {"channel_id": request.channel_id, "limit": request.limit}
        result = FUNCTIONS["channel_history"](data)
        elapsed = (time.time() - start) * 1000
        return chat_pb2.ChannelHistoryResponse(
            result=json.dumps(result).encode("utf-8"),
            execution_time_ms=elapsed,
        )


def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=8))
    chat_pb2_grpc.add_ChatServiceServicer_to_server(ChatServiceServicer(), server)
    server.add_insecure_port("127.0.0.1:50051")
    server.start()
    print("gRPC server started on port 50051", flush=True)
    server.wait_for_termination()


if __name__ == "__main__":
    serve()
