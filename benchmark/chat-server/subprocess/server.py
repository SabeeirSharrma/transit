#!/usr/bin/env python3
"""Subprocess server for chat server benchmark.
Reads from stdin and writes to stdout.
"""

import json
import sys
import time
import random
import string


class SubprocessServer:
    """Subprocess server implementing chat operations."""

    def __init__(self):
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

    def process_request(self, request):
        """Process a chat request."""
        operation = request.get("operation")
        payload = request.get("payload", {})
        
        start = time.perf_counter()
        result = self._process_operation(operation, payload)
        end = time.perf_counter()
        
        return {
            "result": result,
            "execution_time_ms": (end - start) * 1000
        }

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


def main():
    """Main loop: read from stdin, process, write to stdout."""
    server = SubprocessServer()
    
    while True:
        try:
            # Read line from stdin
            line = sys.stdin.readline()
            if not line:
                break
            
            line = line.strip()
            if not line:
                continue
            
            # Parse request
            request = json.loads(line)
            
            # Process request
            response = server.process_request(request)
            
            # Write response to stdout
            sys.stdout.write(json.dumps(response) + '\n')
            sys.stdout.flush()
        
        except json.JSONDecodeError as e:
            error_response = {"error": f"Invalid JSON: {e}"}
            sys.stdout.write(json.dumps(error_response) + '\n')
            sys.stdout.flush()
        
        except Exception as e:
            error_response = {"error": str(e)}
            sys.stdout.write(json.dumps(error_response) + '\n')
            sys.stdout.flush()


if __name__ == "__main__":
    main()
