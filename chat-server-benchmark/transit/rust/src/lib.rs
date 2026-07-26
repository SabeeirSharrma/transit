use napi_derive::napi;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ─── Data Types ─────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct Message {
    pub id: String,
    pub sender_id: String,
    pub channel_id: String,
    pub content: String,
    pub timestamp: u64,
    pub msg_type: String,
}

#[derive(Serialize, Deserialize)]
pub struct DeliveryResult {
    pub message_id: String,
    pub delivered_to: Vec<String>,
    pub delivery_time_ms: f64,
}

#[derive(Serialize, Deserialize)]
pub struct AuthResult {
    pub valid: bool,
    pub user_id: String,
    pub session_ttl: u32,
}

#[derive(Serialize, Deserialize)]
pub struct PresenceUpdate {
    pub user_id: String,
    pub status: String,
    pub contacts_notified: Vec<String>,
    pub update_time_ms: f64,
}

#[derive(Serialize, Deserialize)]
pub struct PipelineResult {
    pub message_id: String,
    pub auth_ms: f64,
    pub moderate_ms: f64,
    pub route_ms: f64,
    pub persist_ms: f64,
    pub total_ms: f64,
}

// ─── Message Routing (hot path) ─────────────────────────────────────────────

/// Route a message to all recipients in a channel.
/// This is the core hot path in a chat server — every message goes through here.
#[napi]
pub fn route_message(message_json: String, recipients_json: String) -> String {
    let start = std::time::Instant::now();

    let msg: Message = serde_json::from_str(&message_json).unwrap_or(Message {
        id: String::new(),
        sender_id: String::new(),
        channel_id: String::new(),
        content: String::new(),
        timestamp: 0,
        msg_type: "text".to_string(),
    });

    let recipients: Vec<String> = serde_json::from_str(&recipients_json).unwrap_or_default();

    // Simulate fan-out: copy message to each recipient's inbox
    let mut delivered = Vec::with_capacity(recipients.len());
    for recipient in &recipients {
        // In real code: push to recipient's queue, update read pointers, etc.
        delivered.push(recipient.clone());
    }

    let elapsed = start.elapsed().as_secs_f64() * 1000.0;

    serde_json::to_string(&DeliveryResult {
        message_id: msg.id,
        delivered_to: delivered,
        delivery_time_ms: elapsed,
    })
    .unwrap_or_default()
}

/// Fan-out delivery: broadcast a message to N users.
/// Simulates a group chat or channel broadcast — the most expensive hot-path operation.
#[napi]
pub fn fanout_delivery(message_json: String, user_ids_json: String) -> String {
    let start = std::time::Instant::now();

    let msg: Message = serde_json::from_str(&message_json).unwrap_or(Message {
        id: String::new(),
        sender_id: String::new(),
        channel_id: String::new(),
        content: String::new(),
        timestamp: 0,
        msg_type: "text".to_string(),
    });

    let user_ids: Vec<String> = serde_json::from_str(&user_ids_json).unwrap_or_default();

    // Simulate writing to each user's inbox + updating their cursor
    let mut notified = Vec::with_capacity(user_ids.len());
    for uid in &user_ids {
        // Simulate: hash(uid + msg_id) to check dedup, then push
        let mut hasher = sha2::Sha256::new();
        use sha2::Digest;
        hasher.update(format!("{}{}", uid, msg.id).as_bytes());
        let _hash = hex::encode(hasher.finalize());
        notified.push(uid.clone());
    }

    let elapsed = start.elapsed().as_secs_f64() * 1000.0;

    serde_json::to_string(&DeliveryResult {
        message_id: msg.id,
        delivered_to: notified,
        delivery_time_ms: elapsed,
    })
    .unwrap_or_default()
}

// ─── Authentication (hot path) ──────────────────────────────────────────────

/// Validate a session token. Called on every request in a real server.
#[napi]
pub fn validate_session(token: String, user_id: String) -> String {
    let start = std::time::Instant::now();

    // Simulate: hash token, check against store, verify expiry
    use sha2::Digest;
    let mut hasher = sha2::Sha256::new();
    hasher.update(token.as_bytes());
    let token_hash = hex::encode(hasher.finalize());

    // Simulate session lookup (in real code: Redis/memory lookup)
    let valid = !token_hash.is_empty() && !user_id.is_empty();
    let ttl = if valid { 3600 } else { 0 };

    let elapsed = start.elapsed().as_secs_f64() * 1000.0;

    serde_json::to_string(&AuthResult {
        valid,
        user_id,
        session_ttl: ttl,
    })
    .unwrap_or_default()
}

// ─── Presence (hot path) ────────────────────────────────────────────────────

/// Update user presence and notify their contacts.
#[napi]
pub fn update_presence(user_id: String, status: String, contacts_json: String) -> String {
    let start = std::time::Instant::now();

    let contacts: Vec<String> = serde_json::from_str(&contacts_json).unwrap_or_default();

    // Simulate: update presence map, fan out to contacts' presence channels
    let mut notified = Vec::with_capacity(contacts.len());
    for contact in &contacts {
        notified.push(contact.clone());
    }

    let elapsed = start.elapsed().as_secs_f64() * 1000.0;

    serde_json::to_string(&PresenceUpdate {
        user_id,
        status,
        contacts_notified: notified,
        update_time_ms: elapsed,
    })
    .unwrap_or_default()
}

// ─── Typing Indicator (hot path, high frequency) ────────────────────────────

/// Process a typing indicator — the highest-frequency message in a chat app.
#[napi]
pub fn process_typing_indicator(user_id: String, channel_id: String, is_typing: bool) -> String {
    use sha2::Digest;
    // Simulate: debounce check, broadcast to channel
    let mut hasher = sha2::Sha256::new();
    hasher.update(format!("{}{}{}", user_id, channel_id, is_typing).as_bytes());
    let _dedup = hex::encode(hasher.finalize());

    serde_json::to_string(&serde_json::json!({
        "user_id": user_id,
        "channel_id": channel_id,
        "is_typing": is_typing,
        "processed": true
    }))
    .unwrap_or_default()
}

// ─── Message Pipeline (full request lifecycle) ──────────────────────────────

/// Full message send pipeline: auth → moderate → route → persist.
/// This is what happens end-to-end when a user sends a message.
#[napi]
pub fn send_message_pipeline(
    token: String,
    user_id: String,
    message_json: String,
    recipients_json: String,
) -> String {
    let pipeline_start = std::time::Instant::now();

    // Step 1: Auth
    let auth_start = std::time::Instant::now();
    use sha2::Digest;
    let mut hasher = sha2::Sha256::new();
    hasher.update(token.as_bytes());
    let _hash = hex::encode(hasher.finalize());
    let auth_ms = auth_start.elapsed().as_secs_f64() * 1000.0;

    // Step 2: Moderation (simplified — just scan for blocked words)
    let mod_start = std::time::Instant::now();
    let msg: Message = serde_json::from_str(&message_json).unwrap_or(Message {
        id: String::new(),
        sender_id: String::new(),
        channel_id: String::new(),
        content: String::new(),
        timestamp: 0,
        msg_type: "text".to_string(),
    });
    let _clean = msg.content.to_lowercase();
    let moderate_ms = mod_start.elapsed().as_secs_f64() * 1000.0;

    // Step 3: Route (fan-out)
    let route_start = std::time::Instant::now();
    let recipients: Vec<String> = serde_json::from_str(&recipients_json).unwrap_or_default();
    let mut delivered = Vec::with_capacity(recipients.len());
    for r in &recipients {
        delivered.push(r.clone());
    }
    let route_ms = route_start.elapsed().as_secs_f64() * 1000.0;

    // Step 4: Persist (simulate write to storage)
    let persist_start = std::time::Instant::now();
    let mut h = sha2::Sha256::new();
    h.update(msg.content.as_bytes());
    let _msg_hash = hex::encode(h.finalize());
    let persist_ms = persist_start.elapsed().as_secs_f64() * 1000.0;

    let total_ms = pipeline_start.elapsed().as_secs_f64() * 1000.0;

    serde_json::to_string(&PipelineResult {
        message_id: msg.id,
        auth_ms,
        moderate_ms,
        route_ms,
        persist_ms,
        total_ms,
    })
    .unwrap_or_default()
}

// ─── Read Receipt ───────────────────────────────────────────────────────────

/// Process a read receipt — high frequency, needs to update cursor + notify sender.
#[napi]
pub fn process_read_receipt(
    user_id: String,
    channel_id: String,
    last_read_msg_id: String,
) -> String {
    use sha2::Digest;
    let start = std::time::Instant::now();

    // Simulate: update read cursor, compute unread count delta, notify sender
    let mut hasher = sha2::Sha256::new();
    hasher.update(format!("{}{}{}", user_id, channel_id, last_read_msg_id).as_bytes());
    let _cursor_hash = hex::encode(hasher.finalize());

    let elapsed = start.elapsed().as_secs_f64() * 1000.0;

    serde_json::to_string(&serde_json::json!({
        "user_id": user_id,
        "channel_id": channel_id,
        "last_read_msg_id": last_read_msg_id,
        "unread_delta": -5,
        "process_time_ms": elapsed
    }))
    .unwrap_or_default()
}
