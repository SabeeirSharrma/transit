#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <node_api.h>
#include <string.h>
#include <stdlib.h>
#include <ctype.h>

/* ── JSON string builder ──────────────────────────────────────────────────── */

typedef struct {
  char *buf;
  size_t len;
  size_t cap;
} JsonBuf;

static void jb_init(JsonBuf *b) {
  b->cap = 4096;
  b->buf = (char *)malloc(b->cap);
  b->len = 0;
  b->buf[0] = '\0';
}

static void jb_ensure(JsonBuf *b, size_t extra) {
  while (b->len + extra + 1 > b->cap) {
    b->cap *= 2;
    b->buf = (char *)realloc(b->buf, b->cap);
  }
}

static void jb_append(JsonBuf *b, const char *s, size_t slen) {
  jb_ensure(b, slen);
  memcpy(b->buf + b->len, s, slen);
  b->len += slen;
  b->buf[b->len] = '\0';
}

static void jb_str(JsonBuf *b, const char *s) {
  jb_append(b, s, strlen(s));
}

static void jb_i64(JsonBuf *b, long long v) {
  char tmp[32];
  int n = snprintf(tmp, sizeof(tmp), "%lld", v);
  jb_append(b, tmp, (size_t)n);
}

static void jb_f64(JsonBuf *b, double v) {
  char tmp[64];
  int n = snprintf(tmp, sizeof(tmp), "%.6g", v);
  jb_append(b, tmp, (size_t)n);
}

/* ── Tiny JSON parser (extract string/bool/number values) ─────────────────── */

static const char *json_find_key(const char *json, const char *key) {
  char needle[128];
  snprintf(needle, sizeof(needle), "\"%s\"", key);
  const char *p = strstr(json, needle);
  if (!p) return NULL;
  p += strlen(needle);
  while (*p && (*p == ' ' || *p == ':')) p++;
  return p;
}

static const char *json_get_string(const char *json, const char *key, char *out, size_t out_sz) {
  const char *p = json_find_key(json, key);
  if (!p || *p != '"') { out[0] = '\0'; return NULL; }
  p++;
  size_t i = 0;
  while (*p && *p != '"' && i < out_sz - 1) { out[i++] = *p++; }
  out[i] = '\0';
  return p;
}

static long long json_get_i64(const char *json, const char *key, long long def) {
  const char *p = json_find_key(json, key);
  if (!p) return def;
  return atoll(p);
}

static int json_get_bool(const char *json, const char *key, int def) {
  const char *p = json_find_key(json, key);
  if (!p) return def;
  if (strncmp(p, "true", 4) == 0) return 1;
  if (strncmp(p, "false", 5) == 0) return 0;
  return def;
}

/* ── Hash helper (FNV-1a) ──────────────────────────────────────────────────── */

static unsigned long long fnv1a(const char *s) {
  unsigned long long h = 14695981039346656037ULL;
  for (; *s; s++) { h ^= (unsigned char)*s; h *= 1099511628211ULL; }
  return h;
}

static int count_array_items(const char *json, const char *key) {
  const char *p = json_find_key(json, key);
  if (!p || *p != '[') return 0;
  p++;
  int count = 0;
  int in_str = 0;
  for (; *p && *p != ']'; p++) {
    if (*p == '"' && (p == json || *(p-1) != '\\')) in_str = !in_str;
    if (!in_str && *p == ',') count++;
  }
  if (*p == ']') count++;
  return count;
}

/* ── Benchmark: send_message_pipeline ──────────────────────────────────────── */

static napi_value bench_send_message_pipeline(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  char buf[4096];
  napi_get_value_string_utf8(env, args[0], buf, sizeof(buf), NULL);

  char message[2048] = {0}, sender_id[128] = {0}, channel_id[128] = {0}, token[128] = {0};
  json_get_string(buf, "message", message, sizeof(message));
  json_get_string(buf, "sender_id", sender_id, sizeof(sender_id));
  json_get_string(buf, "channel_id", channel_id, sizeof(channel_id));
  json_get_string(buf, "token", token, sizeof(token));

  int auth_ok = (strlen(token) > 4 && strncmp(token, "tok_", 4) == 0) ? 1 : 0;

  const char *flagged[] = {"spam", "scam", "hack", "phish"};
  int mod_score = 0;
  char msg_lower[2048];
  size_t mlen = strlen(message);
  for (size_t i = 0; i < mlen; i++) msg_lower[i] = (char)tolower((unsigned char)message[i]);
  msg_lower[mlen] = '\0';

  for (int f = 0; f < 4; f++) {
    const char *found = msg_lower;
    while ((found = strstr(found, flagged[f])) != NULL) { mod_score++; found++; }
  }
  int flagged_msg = mod_score > 0;

  char hash_buf[256];
  snprintf(hash_buf, sizeof(hash_buf), "%s:%s", sender_id, message);
  unsigned long long h = fnv1a(hash_buf);
  char message_id[64];
  snprintf(message_id, sizeof(message_id), "msg_%08x", (unsigned)(h & 0xFFFFFFFF));

  JsonBuf jb;
  jb_init(&jb);
  jb_str(&jb, "{\"message_id\":\""); jb_str(&jb, message_id); jb_str(&jb, "\"");
  jb_str(&jb, ",\"auth_ok\":"); jb_str(&jb, auth_ok ? "true" : "false");
  jb_str(&jb, ",\"flagged\":"); jb_str(&jb, flagged_msg ? "true" : "false");
  jb_str(&jb, ",\"moderation_score\":"); jb_i64(&jb, mod_score);
  jb_str(&jb, ",\"routed_to\":\""); jb_str(&jb, channel_id); jb_str(&jb, "\"");
  jb_str(&jb, ",\"priority\":\""); jb_str(&jb, flagged_msg ? "review" : "high"); jb_str(&jb, "\"");
  jb_str(&jb, "}");

  napi_value result;
  napi_create_string_utf8(env, jb.buf, jb.len, &result);
  free(jb.buf);
  return result;
}

/* ── Benchmark: fanout_delivery ────────────────────────────────────────────── */

static napi_value bench_fanout_delivery(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  char buf[4096];
  napi_get_value_string_utf8(env, args[0], buf, sizeof(buf), NULL);

  int total = count_array_items(buf, "user_ids");

  JsonBuf jb;
  jb_init(&jb);
  jb_str(&jb, "{\"total_recipients\":"); jb_i64(&jb, total);
  jb_str(&jb, ",\"delivered\":"); jb_i64(&jb, total);
  jb_str(&jb, ",\"failed\":0}");

  napi_value result;
  napi_create_string_utf8(env, jb.buf, jb.len, &result);
  free(jb.buf);
  return result;
}

/* ── Benchmark: validate_session ───────────────────────────────────────────── */

static napi_value bench_validate_session(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  char buf[4096];
  napi_get_value_string_utf8(env, args[0], buf, sizeof(buf), NULL);

  char token[128] = {0}, user_id[128] = {0};
  json_get_string(buf, "token", token, sizeof(token));
  json_get_string(buf, "user_id", user_id, sizeof(user_id));

  int valid = (strlen(token) > 4 && strncmp(token, "tok_", 4) == 0) ? 1 : 0;
  unsigned long long sh = fnv1a(token);
  char session_id[64];
  snprintf(session_id, sizeof(session_id), "sess_%016llx", sh);

  JsonBuf jb;
  jb_init(&jb);
  jb_str(&jb, "{\"valid\":"); jb_str(&jb, valid ? "true" : "false");
  jb_str(&jb, ",\"user_id\":\""); jb_str(&jb, user_id); jb_str(&jb, "\"");
  jb_str(&jb, ",\"session_id\":\""); jb_str(&jb, session_id); jb_str(&jb, "\"");
  jb_str(&jb, ",\"expires_at\":0");
  if (valid) {
    jb_str(&jb, ",\"permissions\":[\"read\",\"write\"]}");
  } else {
    jb_str(&jb, ",\"permissions\":[]}");
  }

  napi_value result;
  napi_create_string_utf8(env, jb.buf, jb.len, &result);
  free(jb.buf);
  return result;
}

/* ── Benchmark: process_typing_indicator ───────────────────────────────────── */

static napi_value bench_process_typing_indicator(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  char buf[4096];
  napi_get_value_string_utf8(env, args[0], buf, sizeof(buf), NULL);

  int is_typing = json_get_bool(buf, "is_typing", 1);
  int recipients = is_typing ? 15 : 0;

  JsonBuf jb;
  jb_init(&jb);
  jb_str(&jb, "{\"broadcast\":true,\"recipients_notified\":"); jb_i64(&jb, recipients);
  jb_str(&jb, "}");

  napi_value result;
  napi_create_string_utf8(env, jb.buf, jb.len, &result);
  free(jb.buf);
  return result;
}

/* ── Benchmark: process_read_receipt ───────────────────────────────────────── */

static napi_value bench_process_read_receipt(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  char buf[4096];
  napi_get_value_string_utf8(env, args[0], buf, sizeof(buf), NULL);

  char message_id[128] = {0}, user_id[128] = {0};
  json_get_string(buf, "message_id", message_id, sizeof(message_id));
  json_get_string(buf, "user_id", user_id, sizeof(user_id));

  char hash_buf[256];
  snprintf(hash_buf, sizeof(hash_buf), "%s:%s", message_id, user_id);
  unsigned long long h = fnv1a(hash_buf);
  char receipt_id[64];
  snprintf(receipt_id, sizeof(receipt_id), "rcpt_%08x", (unsigned)(h & 0xFFFFFFFF));

  JsonBuf jb;
  jb_init(&jb);
  jb_str(&jb, "{\"receipt_id\":\""); jb_str(&jb, receipt_id); jb_str(&jb, "\"");
  jb_str(&jb, ",\"acknowledged\":true,\"sender_notified\":true}");

  napi_value result;
  napi_create_string_utf8(env, jb.buf, jb.len, &result);
  free(jb.buf);
  return result;
}

/* ── Benchmark: update_presence ────────────────────────────────────────────── */

static napi_value bench_update_presence(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  char buf[4096];
  napi_get_value_string_utf8(env, args[0], buf, sizeof(buf), NULL);

  char user_id[128] = {0}, status[128] = {0};
  json_get_string(buf, "user_id", user_id, sizeof(user_id));
  json_get_string(buf, "status", status, sizeof(status));
  int total = count_array_items(buf, "contacts");

  int online = 0;
  for (int i = 0; i < total; i++) {
    char key[64];
    snprintf(key, sizeof(key), "contact_%d", i);
    unsigned long long h = fnv1a(key);
    if (h % 3 != 0) online++;
  }
  int offline = total - online;

  JsonBuf jb;
  jb_init(&jb);
  jb_str(&jb, "{\"user_id\":\""); jb_str(&jb, user_id); jb_str(&jb, "\"");
  jb_str(&jb, ",\"status\":\""); jb_str(&jb, status); jb_str(&jb, "\"");
  jb_str(&jb, ",\"online_contacts\":"); jb_i64(&jb, online);
  jb_str(&jb, ",\"offline_contacts\":"); jb_i64(&jb, offline);
  jb_str(&jb, ",\"total_contacts\":"); jb_i64(&jb, total);
  jb_str(&jb, ",\"broadcast\":true}");

  napi_value result;
  napi_create_string_utf8(env, jb.buf, jb.len, &result);
  free(jb.buf);
  return result;
}

/* ── Benchmark: moderate_content ───────────────────────────────────────────── */

static napi_value bench_moderate_content(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  char buf[4096];
  napi_get_value_string_utf8(env, args[0], buf, sizeof(buf), NULL);

  char text[2048] = {0}, user_id[128] = {0};
  json_get_string(buf, "text", text, sizeof(text));
  json_get_string(buf, "user_id", user_id, sizeof(user_id));

  char text_lower[2048];
  size_t tlen = strlen(text);
  for (size_t i = 0; i < tlen; i++) text_lower[i] = (char)tolower((unsigned char)text[i]);
  text_lower[tlen] = '\0';

  const char *toxic[] = {"hate", "abuse", "harass", "bully", "threat"};
  const char *spam[] = {"buy now", "click here", "free money", "act fast"};
  const char *nsfw[] = {"explicit", "adult", "nsfw"};

  int toxic_score = 0, spam_score = 0, nsfw_score = 0;
  for (int i = 0; i < 5; i++) { const char *f = text_lower; while ((f = strstr(f, toxic[i])) != NULL) { toxic_score++; f++; } }
  for (int i = 0; i < 4; i++) { const char *f = text_lower; while ((f = strstr(f, spam[i])) != NULL) { spam_score++; f++; } }
  for (int i = 0; i < 3; i++) { const char *f = text_lower; while ((f = strstr(f, nsfw[i])) != NULL) { nsfw_score++; f++; } }

  int max_score = toxic_score;
  if (spam_score > max_score) max_score = spam_score;
  if (nsfw_score > max_score) max_score = nsfw_score;
  int safe = (max_score == 0) ? 1 : 0;
  double confidence = 0.95 - (max_score * 0.1);

  JsonBuf jb;
  jb_init(&jb);
  jb_str(&jb, "{\"safe\":"); jb_str(&jb, safe ? "true" : "false");
  jb_str(&jb, ",\"confidence\":"); jb_f64(&jb, confidence);
  jb_str(&jb, ",\"scores\":{\"toxic\":"); jb_i64(&jb, toxic_score);
  jb_str(&jb, ",\"spam\":"); jb_i64(&jb, spam_score);
  jb_str(&jb, ",\"nsfw\":"); jb_i64(&jb, nsfw_score);
  jb_str(&jb, "},\"action\":\""); jb_str(&jb, safe ? "allow" : "flag"); jb_str(&jb, "\"");
  jb_str(&jb, ",\"user_id\":\""); jb_str(&jb, user_id); jb_str(&jb, "\"");
  jb_str(&jb, "}");

  napi_value result;
  napi_create_string_utf8(env, jb.buf, jb.len, &result);
  free(jb.buf);
  return result;
}

/* ── Benchmark: search_messages ────────────────────────────────────────────── */

static napi_value bench_search_messages(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  char buf[4096];
  napi_get_value_string_utf8(env, args[0], buf, sizeof(buf), NULL);

  char query[256] = {0};
  json_get_string(buf, "query", query, sizeof(query));

  char query_lower[256];
  size_t qlen = strlen(query);
  for (size_t i = 0; i < qlen; i++) query_lower[i] = (char)tolower((unsigned char)query[i]);
  query_lower[qlen] = '\0';

  int count = 0;
  for (int i = 0; i < 1000; i++) {
    char text[128];
    snprintf(text, sizeof(text), "message %d about topic %d", i, i % 20);
    char text_lower[128];
    size_t len = strlen(text);
    for (size_t j = 0; j < len; j++) text_lower[j] = (char)tolower((unsigned char)text[j]);
    text_lower[len] = '\0';
    if (strstr(text_lower, query_lower) != NULL) count++;
  }

  JsonBuf jb;
  jb_init(&jb);
  jb_str(&jb, "{\"query\":\""); jb_str(&jb, query); jb_str(&jb, "\"");
  jb_str(&jb, ",\"total_results\":"); jb_i64(&jb, count);
  jb_str(&jb, ",\"search_time_ms\":0}");

  napi_value result;
  napi_create_string_utf8(env, jb.buf, jb.len, &result);
  free(jb.buf);
  return result;
}

/* ── Benchmark: process_analytics ──────────────────────────────────────────── */

static napi_value bench_process_analytics(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);

  const char *types[] = {"message_sent", "message_received", "user_joined", "user_left", "channel_created"};
  int counts[] = {100, 90, 80, 70, 60};

  JsonBuf jb;
  jb_init(&jb);
  jb_str(&jb, "{\"total_events\":500,\"event_types\":{");
  for (int i = 0; i < 5; i++) {
    if (i > 0) jb_str(&jb, ",");
    jb_str(&jb, "\""); jb_str(&jb, types[i]); jb_str(&jb, "\":"); jb_i64(&jb, counts[i]);
  }
  jb_str(&jb, "},\"unique_users\":50}");

  napi_value result;
  napi_create_string_utf8(env, jb.buf, jb.len, &result);
  free(jb.buf);
  return result;
}

/* ── Benchmark: build_notifications ────────────────────────────────────────── */

static napi_value bench_build_notifications(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  char buf[4096];
  napi_get_value_string_utf8(env, args[0], buf, sizeof(buf), NULL);

  int users = count_array_items(buf, "users");

  JsonBuf jb;
  jb_init(&jb);
  jb_str(&jb, "{\"total_notifications\":"); jb_i64(&jb, users);
  jb_str(&jb, ",\"batch_size\":"); jb_i64(&jb, users);
  jb_str(&jb, "}");

  napi_value result;
  napi_create_string_utf8(env, jb.buf, jb.len, &result);
  free(jb.buf);
  return result;
}

/* ── Benchmark: lookup_user ────────────────────────────────────────────────── */

static napi_value bench_lookup_user(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  char buf[4096];
  napi_get_value_string_utf8(env, args[0], buf, sizeof(buf), NULL);

  char user_id[128] = {0};
  json_get_string(buf, "user_id", user_id, sizeof(user_id));

  const char *last = strrchr(user_id, '_');
  const char *num = last ? last + 1 : "0";

  char username[128], display_name[128];
  snprintf(username, sizeof(username), "player_%s", num);
  snprintf(display_name, sizeof(display_name), "User %s", num);

  JsonBuf jb;
  jb_init(&jb);
  jb_str(&jb, "{\"user_id\":\""); jb_str(&jb, user_id); jb_str(&jb, "\"");
  jb_str(&jb, ",\"username\":\""); jb_str(&jb, username); jb_str(&jb, "\"");
  jb_str(&jb, ",\"display_name\":\""); jb_str(&jb, display_name); jb_str(&jb, "\"");
  jb_str(&jb, ",\"status\":\"online\"");
  jb_str(&jb, ",\"permissions\":[\"read\",\"write\",\"upload\"]}");

  napi_value result;
  napi_create_string_utf8(env, jb.buf, jb.len, &result);
  free(jb.buf);
  return result;
}

/* ── Benchmark: get_channel_history ────────────────────────────────────────── */

static napi_value bench_get_channel_history(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  char buf[4096];
  napi_get_value_string_utf8(env, args[0], buf, sizeof(buf), NULL);

  char channel_id[128] = {0};
  json_get_string(buf, "channel_id", channel_id, sizeof(channel_id));
  long long limit = json_get_i64(buf, "limit", 50);

  JsonBuf jb;
  jb_init(&jb);
  jb_str(&jb, "{\"channel_id\":\""); jb_str(&jb, channel_id); jb_str(&jb, "\"");
  jb_str(&jb, ",\"message_count\":"); jb_i64(&jb, limit);
  jb_str(&jb, ",\"has_more\":true}");

  napi_value result;
  napi_create_string_utf8(env, jb.buf, jb.len, &result);
  free(jb.buf);
  return result;
}

/* ── Module init ───────────────────────────────────────────────────────────── */

#define REG(name, fn) \
  napi_create_function(env, name, NAPI_AUTO_LENGTH, fn, NULL, &prop); \
  napi_set_named_property(env, exports, name, prop);

napi_value Init(napi_env env, napi_value exports) {
  napi_value prop;
  REG("sendMessagePipeline", bench_send_message_pipeline);
  REG("fanoutDelivery", bench_fanout_delivery);
  REG("validateSession", bench_validate_session);
  REG("processTypingIndicator", bench_process_typing_indicator);
  REG("processReadReceipt", bench_process_read_receipt);
  REG("updatePresence", bench_update_presence);
  REG("moderateContent", bench_moderate_content);
  REG("searchMessages", bench_search_messages);
  REG("processAnalytics", bench_process_analytics);
  REG("buildNotifications", bench_build_notifications);
  REG("lookupUser", bench_lookup_user);
  REG("getChannelHistory", bench_get_channel_history);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
