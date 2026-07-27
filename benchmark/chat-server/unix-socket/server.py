#!/usr/bin/env python3
"""Unix domain socket server for chat server benchmark."""

import json
import time
import random
import string
import os
import socket
import threading

SOCKET_PATH = "/tmp/transit_chat_benchmark.sock"


class UnixSocketServer:
    """Unix socket server implementing chat operations."""

    def __init__(self):
        self.lock = threading.Lock()
        self.running = False
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

    def start(self):
        """Start the server."""
        # Remove existing socket file
        if os.path.exists(SOCKET_PATH):
            os.unlink(SOCKET_PATH)
        
        self.running = True
        server_socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        server_socket.bind(SOCKET_PATH)
        server_socket.listen(5)
        
        print(f"Unix socket server started on {SOCKET_PATH}")
        
        while self.running:
            try:
                client_socket, _ = server_socket.accept()
                client_thread = threading.Thread(target=self._handle_client, args=(client_socket,))
                client_thread.daemon = True
                client_thread.start()
            except Exception as e:
                if self.running:
                    print(f"Error accepting connection: {e}")
        
        server_socket.close()

    def _handle_client(self, client_socket):
        """Handle a client connection."""
        try:
            # Read request length
            length_bytes = client_socket.recv(4)
            if not length_bytes:
                return
            
            length = struct.unpack('!I', length_bytes)[0]
            
            # Read request data
            data = b''
            while len(data) < length:
                chunk = client_socket.recv(length - len(data))
                if not chunk:
                    break
                data += chunk
            
            # Parse request
            request = json.loads(data.decode())
            operation = request.get("operation")
            payload = request.get("payload", {})
            
            # Process request
            start = time.perf_counter()
            result = self._process_operation(operation, payload)
            end = time.perf_counter()
            
            # Send response
            response = {
                "result": result,
                "execution_time_ms": (end - start) * 1000
            }
            response_data = json.dumps(response).encode()
            response_length = struct.pack('!I', len(response_data))
            client_socket.sendall(response_length + response_data)
        
        except Exception as e:
            print(f"Error handling client: {e}")
        finally:
            client_socket.close()

    def _process_operation(self, operation, payload):
        """Process a chat operation."""
        if operation == "sendMessage":
            return self._send_message(payload)
        elif operation == "validateSession":
            return self._validate_session(payload)
        elif operation == "moderateContent":
            return self._moderate_content(payload)
        elif operation == "routeMessage":
            return self._route_message(payload)
        elif operation == "searchMessages":
            return self._search_messages(payload)
        elif operation == "getAnalytics":
            return self._get_analytics(payload)
        elif operation == "getUser":
            return self._get_user(payload)
        elif operation == "getChannelHistory":
            return self._get_channel_history(payload)
        else:
            return {"error": f"Unknown operation: {operation}"}

    def _send_message(self, data):
        """Handle message send request."""
        # Simulate message processing
        message_id = f"msg_{random.randint(10000, 99999)}"
        
        # Validate session
        # Moderate content
        # Route to recipients
        # Persist message
        
        return {
            "message_id": message_id,
            "delivered": True
        }

    def _validate_session(self, data):
        """Handle session validation request."""
        session = self.sessions.get(data.get("session_token"))
        valid = session is not None and session.get("valid", False)
        user_id = session.get("user_id", "") if session else ""
        
        return {
            "valid": valid,
            "user_id": user_id
        }

    def _moderate_content(self, data):
        """Handle content moderation request."""
        # Simulate ML model inference
        toxicity_score = random.random() * 0.3
        safe = toxicity_score < 0.2
        
        return {
            "safe": safe,
            "toxicity_score": toxicity_score,
            "reason": "Safe" if safe else "Toxic content detected"
        }

    def _route_message(self, data):
        """Handle message routing request."""
        # Simulate routing to recipients
        delivered_count = len(data.get("recipient_ids", []))
        
        return {
            "delivered_count": delivered_count
        }

    def _search_messages(self, data):
        """Handle message search request."""
        # Simulate full-text search
        results = []
        query = data.get("query", "")
        limit = data.get("limit", 10)
        
        for msg in self.messages[:100]:
            if query.lower() in msg["content"].lower():
                results.append({
                    "message_id": msg["message_id"],
                    "content": msg["content"][:100],
                    "score": random.random()
                })
                if len(results) >= limit:
                    break
        
        return {
            "results": results
        }

    def _get_analytics(self, data):
        """Handle analytics request."""
        # Simulate analytics aggregation
        event_count = random.randint(100, 10000)
        breakdown = {
            "desktop": random.randint(0, event_count),
            "mobile": random.randint(0, event_count),
            "api": random.randint(0, event_count)
        }
        
        return {
            "event_count": event_count,
            "breakdown": breakdown
        }

    def _get_user(self, data):
        """Handle user lookup request."""
        user = self.users.get(data.get("user_id"))
        if user:
            return {
                "user_id": user["user_id"],
                "username": user["username"],
                "email": user["email"]
            }
        else:
            return {
                "user_id": "",
                "username": "",
                "email": ""
            }

    def _get_channel_history(self, data):
        """Handle channel history request."""
        # Filter messages by channel
        channel_id = data.get("channel_id", "")
        limit = data.get("limit", 50)
        
        channel_msgs = [m for m in self.messages if m["channel_id"] == channel_id]
        channel_msgs.sort(key=lambda x: x["timestamp"], reverse=True)
        
        # Apply limit
        channel_msgs = channel_msgs[:limit]
        
        return {
            "messages": channel_msgs
        }


def serve():
    """Start the Unix socket server."""
    server = UnixSocketServer()
    server.start()


if __name__ == "__main__":
    serve()
