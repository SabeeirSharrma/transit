use napi_derive::napi;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::hash::{Hash, Hasher};

// ─── Message Send Pipeline ──────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct PipelineResult {
    pub message_id: String,
    pub auth_ok: bool,
    pub flagged: bool,
    pub moderation_score: usize,
    pub routed_to: String,
    pub priority: String,
}

#[napi]
pub fn send_message_pipeline(json_str: String) -> String {
    let args: HashMap<String, serde_json::Value> = serde_json::from_str(&json_str).unwrap_or_default();
    let message = args.get("message").and_then(|v| v.as_str()).unwrap_or("Hello, world!");
    let sender_id = args.get("sender_id").and_then(|v| v.as_str()).unwrap_or("user_0");
    let channel_id = args.get("channel_id").and_then(|v| v.as_str()).unwrap_or("channel_0");
    let token = args.get("token").and_then(|v| v.as_str()).unwrap_or("tok_default");

    let auth_ok = !token.is_empty() && token.starts_with("tok_");
    let flagged_words = ["spam", "scam", "hack", "phish"];
    let words: Vec<&str> = message.split_whitespace().collect();
    let moderation_score = words.iter()
        .filter(|w| flagged_words.iter().any(|fw| w.eq_ignore_ascii_case(fw)))
        .count();
    let is_flagged = moderation_score > 0;
    let priority = if is_flagged { "review" } else { "high" };

    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    message.hash(&mut hasher);
    sender_id.hash(&mut hasher);
    let hash_val = format!("{:x}", hasher.finish());
    let message_id = format!("msg_{}", &hash_val[..std::cmp::min(8, hash_val.len())]);

    serde_json::to_string(&PipelineResult {
        message_id,
        auth_ok,
        flagged: is_flagged,
        moderation_score,
        routed_to: channel_id.to_string(),
        priority: priority.to_string(),
    }).unwrap_or_else(|_| "{}".to_string())
}

// ─── Fan-out Delivery ───────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct FanoutResult {
    pub total_recipients: usize,
    pub delivered: usize,
    pub failed: usize,
}

#[napi]
pub fn fanout_delivery(json_str: String) -> String {
    let args: HashMap<String, serde_json::Value> = serde_json::from_str(&json_str).unwrap_or_default();
    let user_ids = args.get("user_ids")
        .and_then(|v| v.as_array())
        .map(|arr| arr.len())
        .unwrap_or(50);

    serde_json::to_string(&FanoutResult {
        total_recipients: user_ids,
        delivered: user_ids,
        failed: 0,
    }).unwrap_or_else(|_| "{}".to_string())
}

// ─── Session Validation ─────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct SessionResult {
    pub valid: bool,
    pub user_id: String,
    pub session_id: String,
    pub expires_at: f64,
    pub permissions: Vec<String>,
}

#[napi]
pub fn validate_session(json_str: String) -> String {
    let args: HashMap<String, serde_json::Value> = serde_json::from_str(&json_str).unwrap_or_default();
    let token = args.get("token").and_then(|v| v.as_str()).unwrap_or("tok_default");
    let user_id = args.get("user_id").and_then(|v| v.as_str()).unwrap_or("user_0");

    let is_valid = token.len() > 4 && token.starts_with("tok_");
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    token.hash(&mut hasher);
    let session_hash = format!("{:x}", hasher.finish());

    let permissions = if is_valid {
        vec!["read".to_string(), "write".to_string()]
    } else {
        vec![]
    };

    serde_json::to_string(&SessionResult {
        valid: is_valid,
        user_id: user_id.to_string(),
        session_id: format!("sess_{}", &session_hash[..std::cmp::min(16, session_hash.len())]),
        expires_at: 0.0,
        permissions,
    }).unwrap_or_else(|_| "{}".to_string())
}

// ─── Typing Indicator ───────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct TypingResult {
    pub broadcast: bool,
    pub recipients_notified: usize,
}

#[napi]
pub fn process_typing_indicator(json_str: String) -> String {
    let args: HashMap<String, serde_json::Value> = serde_json::from_str(&json_str).unwrap_or_default();
    let is_typing = args.get("is_typing").and_then(|v| v.as_bool()).unwrap_or(true);
    let recipients = if is_typing { 15 } else { 0 };

    serde_json::to_string(&TypingResult {
        broadcast: true,
        recipients_notified: recipients,
    }).unwrap_or_else(|_| "{}".to_string())
}

// ─── Read Receipt ───────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct ReadReceiptResult {
    pub receipt_id: String,
    pub acknowledged: bool,
    pub sender_notified: bool,
}

#[napi]
pub fn process_read_receipt(json_str: String) -> String {
    let args: HashMap<String, serde_json::Value> = serde_json::from_str(&json_str).unwrap_or_default();
    let message_id = args.get("message_id").and_then(|v| v.as_str()).unwrap_or("msg_0");
    let user_id = args.get("user_id").and_then(|v| v.as_str()).unwrap_or("user_0");

    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    message_id.hash(&mut hasher);
    user_id.hash(&mut hasher);
    let hash_val = format!("{:x}", hasher.finish());

    serde_json::to_string(&ReadReceiptResult {
        receipt_id: format!("rcpt_{}", &hash_val[..std::cmp::min(8, hash_val.len())]),
        acknowledged: true,
        sender_notified: true,
    }).unwrap_or_else(|_| "{}".to_string())
}

// ─── Presence Update ────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct PresenceResult {
    pub user_id: String,
    pub status: String,
    pub online_contacts: usize,
    pub offline_contacts: usize,
    pub total_contacts: usize,
    pub broadcast: bool,
}

#[napi]
pub fn update_presence(json_str: String) -> String {
    let args: HashMap<String, serde_json::Value> = serde_json::from_str(&json_str).unwrap_or_default();
    let user_id = args.get("user_id").and_then(|v| v.as_str()).unwrap_or("user_0");
    let status = args.get("status").and_then(|v| v.as_str()).unwrap_or("online");
    let contacts: Vec<String> = args.get("contacts")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();

    let total = contacts.len();
    let online = contacts.iter().filter(|c| {
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        c.hash(&mut hasher);
        hasher.finish() % 3 != 0
    }).count();
    let offline = total - online;

    serde_json::to_string(&PresenceResult {
        user_id: user_id.to_string(),
        status: status.to_string(),
        online_contacts: online,
        offline_contacts: offline,
        total_contacts: total,
        broadcast: true,
    }).unwrap_or_else(|_| "{}".to_string())
}

// ─── Content Moderation ─────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct ModerationResult {
    pub safe: bool,
    pub confidence: f64,
    pub scores: HashMap<String, usize>,
    pub action: String,
    pub user_id: String,
}

#[napi]
pub fn moderate_content(json_str: String) -> String {
    let args: HashMap<String, serde_json::Value> = serde_json::from_str(&json_str).unwrap_or_default();
    let text = args.get("text").and_then(|v| v.as_str()).unwrap_or("");
    let user_id = args.get("user_id").and_then(|v| v.as_str()).unwrap_or("user_0");

    let toxic_patterns = ["hate", "abuse", "harass", "bully", "threat"];
    let spam_patterns = ["buy now", "click here", "free money", "act fast"];
    let nsfw_patterns = ["explicit", "adult", "nsfw"];

    let text_lower = text.to_lowercase();
    let toxic_score = toxic_patterns.iter().filter(|p| text_lower.contains(*p)).count();
    let spam_score = spam_patterns.iter().filter(|p| text_lower.contains(*p)).count();
    let nsfw_score = nsfw_patterns.iter().filter(|p| text_lower.contains(*p)).count();

    let mut scores = HashMap::new();
    scores.insert("toxic".to_string(), toxic_score);
    scores.insert("spam".to_string(), spam_score);
    scores.insert("nsfw".to_string(), nsfw_score);

    let max_score = *[toxic_score, spam_score, nsfw_score].iter().max().unwrap_or(&0);
    let is_safe = max_score == 0;
    let confidence = 0.95 - (max_score as f64 * 0.1);

    serde_json::to_string(&ModerationResult {
        safe: is_safe,
        confidence,
        scores,
        action: if is_safe { "allow" } else { "flag" }.to_string(),
        user_id: user_id.to_string(),
    }).unwrap_or_else(|_| "{}".to_string())
}

// ─── Message Search ─────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct SearchResult {
    pub query: String,
    pub total_results: usize,
    pub search_time_ms: f64,
}

#[napi]
pub fn search_messages(json_str: String) -> String {
    let args: HashMap<String, serde_json::Value> = serde_json::from_str(&json_str).unwrap_or_default();
    let query = args.get("query").and_then(|v| v.as_str()).unwrap_or("hello");

    let query_lower = query.to_lowercase();
    let mut count = 0;
    for i in 0..1000 {
        let text = format!("Message {} about topic {}", i, i % 20);
        if text.to_lowercase().contains(&query_lower) {
            count += 1;
        }
    }

    serde_json::to_string(&SearchResult {
        query: query.to_string(),
        total_results: count,
        search_time_ms: 0.0,
    }).unwrap_or_else(|_| "{}".to_string())
}

// ─── Analytics Pipeline ─────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct AnalyticsResult {
    pub total_events: usize,
    pub event_types: HashMap<String, usize>,
    pub unique_users: usize,
}

#[napi]
pub fn process_analytics(json_str: String) -> String {
    let _args: HashMap<String, serde_json::Value> = serde_json::from_str(&json_str).unwrap_or_default();
    let mut type_counts = HashMap::new();
    let types = ["message_sent", "message_received", "user_joined", "user_left", "channel_created"];
    for (i, t) in types.iter().enumerate() {
        type_counts.insert(t.to_string(), 100 - i * 10);
    }

    serde_json::to_string(&AnalyticsResult {
        total_events: 500,
        event_types: type_counts,
        unique_users: 50,
    }).unwrap_or_else(|_| "{}".to_string())
}

// ─── Notification Builder ───────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct NotificationBatch {
    pub total_notifications: usize,
    pub batch_size: usize,
}

#[napi]
pub fn build_notifications(json_str: String) -> String {
    let args: HashMap<String, serde_json::Value> = serde_json::from_str(&json_str).unwrap_or_default();
    let users = args.get("users")
        .and_then(|v| v.as_array())
        .map(|arr| arr.len())
        .unwrap_or(20);

    serde_json::to_string(&NotificationBatch {
        total_notifications: users,
        batch_size: users,
    }).unwrap_or_else(|_| "{}".to_string())
}

// ─── User Lookup ────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct UserProfile {
    pub user_id: String,
    pub username: String,
    pub display_name: String,
    pub status: String,
    pub permissions: Vec<String>,
}

#[napi]
pub fn lookup_user(json_str: String) -> String {
    let args: HashMap<String, serde_json::Value> = serde_json::from_str(&json_str).unwrap_or_default();
    let user_id = args.get("user_id").and_then(|v| v.as_str()).unwrap_or("user_0");
    let parts: Vec<&str> = user_id.split('_').collect();
    let num = parts.last().unwrap_or(&"0");

    serde_json::to_string(&UserProfile {
        user_id: user_id.to_string(),
        username: format!("player_{}", num),
        display_name: format!("User {}", num),
        status: "online".to_string(),
        permissions: vec!["read".to_string(), "write".to_string(), "upload".to_string()],
    }).unwrap_or_else(|_| "{}".to_string())
}

// ─── Channel History ────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct ChannelHistoryResult {
    pub channel_id: String,
    pub message_count: usize,
    pub has_more: bool,
}

#[napi]
pub fn get_channel_history(json_str: String) -> String {
    let args: HashMap<String, serde_json::Value> = serde_json::from_str(&json_str).unwrap_or_default();
    let channel_id = args.get("channel_id").and_then(|v| v.as_str()).unwrap_or("channel_0");
    let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(50) as usize;

    serde_json::to_string(&ChannelHistoryResult {
        channel_id: channel_id.to_string(),
        message_count: limit,
        has_more: true,
    }).unwrap_or_else(|_| "{}".to_string())
}
