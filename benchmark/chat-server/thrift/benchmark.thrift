namespace py thrift_chatserver

struct SendMessageRequest {
    1: string channel_id,
    2: string user_id,
    3: string content,
    4: i64 timestamp
}

struct SendMessageResponse {
    1: string message_id,
    2: bool delivered,
    3: double execution_time_ms
}

struct ValidateSessionRequest {
    1: string session_token
}

struct ValidateSessionResponse {
    1: bool valid,
    2: string user_id,
    3: double execution_time_ms
}

struct ModerateContentRequest {
    1: string content,
    2: string user_id
}

struct ModerateContentResponse {
    1: bool safe,
    2: float toxicity_score,
    3: string reason,
    4: double execution_time_ms
}

struct RouteMessageRequest {
    1: string message_id,
    2: list<string> recipient_ids
}

struct RouteMessageResponse {
    1: i32 delivered_count,
    2: double execution_time_ms
}

struct SearchMessagesRequest {
    1: string query,
    2: string channel_id,
    3: i32 limit
}

struct SearchResult {
    1: string message_id,
    2: string content,
    3: float score
}

struct SearchMessagesResponse {
    1: list<SearchResult> results,
    2: double execution_time_ms
}

struct GetAnalyticsRequest {
    1: string event_type,
    2: i64 time_range_hours
}

struct GetAnalyticsResponse {
    1: i32 event_count,
    2: map<string, i32> breakdown,
    3: double execution_time_ms
}

struct GetUserRequest {
    1: string user_id
}

struct GetUserResponse {
    1: string user_id,
    2: string username,
    3: string email,
    4: double execution_time_ms
}

struct GetChannelHistoryRequest {
    1: string channel_id,
    2: i32 limit,
    3: string before_message_id
}

struct Message {
    1: string message_id,
    2: string user_id,
    3: string content,
    4: i64 timestamp
}

struct GetChannelHistoryResponse {
    1: list<Message> messages,
    2: double execution_time_ms
}

service ChatService {
    SendMessageResponse sendMessage(1: SendMessageRequest request),
    ValidateSessionResponse validateSession(1: ValidateSessionRequest request),
    ModerateContentResponse moderateContent(1: ModerateContentRequest request),
    RouteMessageResponse routeMessage(1: RouteMessageRequest request),
    SearchMessagesResponse searchMessages(1: SearchMessagesRequest request),
    GetAnalyticsResponse getAnalytics(1: GetAnalyticsRequest request),
    GetUserResponse getUser(1: GetUserRequest request),
    GetChannelHistoryResponse getChannelHistory(1: GetChannelHistoryRequest request)
}
