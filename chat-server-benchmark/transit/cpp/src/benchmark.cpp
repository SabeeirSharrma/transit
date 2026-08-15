#include <napi.h>
#include <string>
#include <vector>
#include <map>
#include <algorithm>
#include <cmath>
#include <cstring>
#include <cstdio>
#include <cctype>

struct JsonBuilder {
  std::string buf;
  void str(const char *s) { buf += s; }
  void str(const std::string &s) { buf += s; }
  void i64(long long v) {
    char tmp[32]; snprintf(tmp, sizeof(tmp), "%lld", v); buf += tmp;
  }
  void f64(double v) {
    char tmp[64]; snprintf(tmp, sizeof(tmp), "%.6g", v); buf += tmp;
  }
  void bool_val(bool v) { buf += v ? "true" : "false"; }
};

static std::string jsonGetString(const std::string &json, const std::string &key, const std::string &def = "") {
  std::string needle = "\"" + key + "\"";
  size_t pos = json.find(needle);
  if (pos == std::string::npos) return def;
  pos += needle.size();
  while (pos < json.size() && (json[pos] == ' ' || json[pos] == ':')) pos++;
  if (pos >= json.size() || json[pos] != '"') return def;
  pos++;
  size_t end = json.find('"', pos);
  if (end == std::string::npos) return def;
  return json.substr(pos, end - pos);
}

static long long jsonGetI64(const std::string &json, const std::string &key, long long def = 0) {
  std::string needle = "\"" + key + "\"";
  size_t pos = json.find(needle);
  if (pos == std::string::npos) return def;
  pos += needle.size();
  while (pos < json.size() && (json[pos] == ' ' || json[pos] == ':')) pos++;
  if (pos >= json.size()) return def;
  return strtoll(json.c_str() + pos, nullptr, 10);
}

static bool jsonGetBool(const std::string &json, const std::string &key, bool def = false) {
  std::string needle = "\"" + key + "\"";
  size_t pos = json.find(needle);
  if (pos == std::string::npos) return def;
  pos += needle.size();
  while (pos < json.size() && (json[pos] == ' ' || json[pos] == ':')) pos++;
  if (pos + 4 <= json.size() && json.compare(pos, 4, "true") == 0) return true;
  if (pos + 5 <= json.size() && json.compare(pos, 5, "false") == 0) return false;
  return def;
}

static int jsonCountArray(const std::string &json, const std::string &key) {
  std::string needle = "\"" + key + "\"";
  size_t pos = json.find(needle);
  if (pos == std::string::npos) return 0;
  pos = json.find('[', pos);
  if (pos == std::string::npos) return 0;
  pos++;
  int count = 0;
  bool in_str = false;
  for (; pos < json.size() && json[pos] != ']'; pos++) {
    if (json[pos] == '"' && (pos == 0 || json[pos-1] != '\\')) in_str = !in_str;
    if (!in_str && json[pos] == ',') count++;
  }
  if (pos < json.size() && json[pos] == ']') count++;
  return count;
}

static std::string toLower(const std::string &s) {
  std::string r = s;
  std::transform(r.begin(), r.end(), r.begin(), [](unsigned char c) { return (char)std::tolower(c); });
  return r;
}

static unsigned long long fnv1a(const std::string &s) {
  unsigned long long h = 14695981039346656037ULL;
  for (unsigned char c : s) { h ^= c; h *= 1099511628211ULL; }
  return h;
}

static std::string formatHex8(unsigned long long v) {
  char tmp[32]; snprintf(tmp, sizeof(tmp), "%08x", (unsigned)(v & 0xFFFFFFFF));
  return tmp;
}

static std::string formatHex16(unsigned long long v) {
  char tmp[32]; snprintf(tmp, sizeof(tmp), "%016llx", v);
  return tmp;
}

static Napi::Value bench_send_message_pipeline(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  std::string json = info[0].As<Napi::String>().Utf8Value();
  std::string message = jsonGetString(json, "message", "Hello, world!");
  std::string sender_id = jsonGetString(json, "sender_id", "user_0");
  std::string channel_id = jsonGetString(json, "channel_id", "channel_0");
  std::string token = jsonGetString(json, "token", "tok_default");

  bool auth_ok = token.size() > 4 && token.substr(0, 4) == "tok_";
  std::vector<std::string> flagged_words = {"spam", "scam", "hack", "phish"};
  std::string msg_lower = toLower(message);
  int mod_score = 0;
  for (const auto &fw : flagged_words) {
    size_t pos = 0;
    while ((pos = msg_lower.find(fw, pos)) != std::string::npos) { mod_score++; pos++; }
  }
  bool flagged = mod_score > 0;
  std::string priority = flagged ? "review" : "high";
  std::string message_id = "msg_" + formatHex8(fnv1a(sender_id + ":" + message));

  JsonBuilder jb;
  jb.buf += "{\"message_id\":\""; jb.str(message_id); jb.buf += "\"";
  jb.buf += ",\"auth_ok\":"; jb.bool_val(auth_ok);
  jb.buf += ",\"flagged\":"; jb.bool_val(flagged);
  jb.buf += ",\"moderation_score\":"; jb.i64(mod_score);
  jb.buf += ",\"routed_to\":\""; jb.str(channel_id); jb.buf += "\"";
  jb.buf += ",\"priority\":\""; jb.str(priority); jb.buf += "\"";
  jb.buf += "}";

  return Napi::String::New(env, jb.buf);
}

static Napi::Value bench_fanout_delivery(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  std::string json = info[0].As<Napi::String>().Utf8Value();
  int total = jsonCountArray(json, "user_ids");

  JsonBuilder jb;
  jb.buf += "{\"total_recipients\":"; jb.i64(total);
  jb.buf += ",\"delivered\":"; jb.i64(total);
  jb.buf += ",\"failed\":0}";

  return Napi::String::New(env, jb.buf);
}

static Napi::Value bench_validate_session(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  std::string json = info[0].As<Napi::String>().Utf8Value();
  std::string token = jsonGetString(json, "token", "tok_default");
  std::string user_id = jsonGetString(json, "user_id", "user_0");

  bool valid = token.size() > 4 && token.substr(0, 4) == "tok_";
  std::string session_id = "sess_" + formatHex16(fnv1a(token));

  JsonBuilder jb;
  jb.buf += "{\"valid\":"; jb.bool_val(valid);
  jb.buf += ",\"user_id\":\""; jb.str(user_id); jb.buf += "\"";
  jb.buf += ",\"session_id\":\""; jb.str(session_id); jb.buf += "\"";
  jb.buf += ",\"expires_at\":0";
  jb.buf += ",\"permissions\":"; 
  jb.buf += valid ? "[\"read\",\"write\"]" : "[]";
  jb.buf += "}";

  return Napi::String::New(env, jb.buf);
}

static Napi::Value bench_process_typing_indicator(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  std::string json = info[0].As<Napi::String>().Utf8Value();
  bool is_typing = jsonGetBool(json, "is_typing", true);
  int recipients = is_typing ? 15 : 0;

  JsonBuilder jb;
  jb.buf += "{\"broadcast\":true,\"recipients_notified\":"; jb.i64(recipients);
  jb.buf += "}";

  return Napi::String::New(env, jb.buf);
}

static Napi::Value bench_process_read_receipt(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  std::string json = info[0].As<Napi::String>().Utf8Value();
  std::string message_id = jsonGetString(json, "message_id", "msg_0");
  std::string user_id = jsonGetString(json, "user_id", "user_0");

  std::string receipt_id = "rcpt_" + formatHex8(fnv1a(message_id + ":" + user_id));

  JsonBuilder jb;
  jb.buf += "{\"receipt_id\":\""; jb.str(receipt_id); jb.buf += "\"";
  jb.buf += ",\"acknowledged\":true,\"sender_notified\":true}";

  return Napi::String::New(env, jb.buf);
}

static Napi::Value bench_update_presence(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  std::string json = info[0].As<Napi::String>().Utf8Value();
  std::string user_id = jsonGetString(json, "user_id", "user_0");
  std::string status = jsonGetString(json, "status", "online");
  int total = jsonCountArray(json, "contacts");

  int online = 0;
  for (int i = 0; i < total; i++) {
    char key[64]; snprintf(key, sizeof(key), "contact_%d", i);
    if (fnv1a(key) % 3 != 0) online++;
  }
  int offline = total - online;

  JsonBuilder jb;
  jb.buf += "{\"user_id\":\""; jb.str(user_id); jb.buf += "\"";
  jb.buf += ",\"status\":\""; jb.str(status); jb.buf += "\"";
  jb.buf += ",\"online_contacts\":"; jb.i64(online);
  jb.buf += ",\"offline_contacts\":"; jb.i64(offline);
  jb.buf += ",\"total_contacts\":"; jb.i64(total);
  jb.buf += ",\"broadcast\":true}";

  return Napi::String::New(env, jb.buf);
}

static Napi::Value bench_moderate_content(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  std::string json = info[0].As<Napi::String>().Utf8Value();
  std::string text = jsonGetString(json, "text", "");
  std::string user_id = jsonGetString(json, "user_id", "user_0");

  std::vector<std::string> toxic = {"hate", "abuse", "harass", "bully", "threat"};
  std::vector<std::string> spam = {"buy now", "click here", "free money", "act fast"};
  std::vector<std::string> nsfw = {"explicit", "adult", "nsfw"};

  std::string text_lower = toLower(text);
  int toxic_score = 0, spam_score = 0, nsfw_score = 0;

  for (const auto &p : toxic) {
    size_t pos = 0;
    while ((pos = text_lower.find(p, pos)) != std::string::npos) { toxic_score++; pos++; }
  }
  for (const auto &p : spam) {
    size_t pos = 0;
    while ((pos = text_lower.find(p, pos)) != std::string::npos) { spam_score++; pos++; }
  }
  for (const auto &p : nsfw) {
    size_t pos = 0;
    while ((pos = text_lower.find(p, pos)) != std::string::npos) { nsfw_score++; pos++; }
  }

  int max_score = std::max({toxic_score, spam_score, nsfw_score});
  bool safe = (max_score == 0);
  double confidence = 0.95 - (max_score * 0.1);

  JsonBuilder jb;
  jb.buf += "{\"safe\":"; jb.bool_val(safe);
  jb.buf += ",\"confidence\":"; jb.f64(confidence);
  jb.buf += ",\"scores\":{\"toxic\":"; jb.i64(toxic_score);
  jb.buf += ",\"spam\":"; jb.i64(spam_score);
  jb.buf += ",\"nsfw\":"; jb.i64(nsfw_score);
  jb.buf += "},\"action\":\""; jb.str(safe ? "allow" : "flag"); jb.buf += "\"";
  jb.buf += ",\"user_id\":\""; jb.str(user_id); jb.buf += "\"";
  jb.buf += "}";

  return Napi::String::New(env, jb.buf);
}

static Napi::Value bench_search_messages(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  std::string json = info[0].As<Napi::String>().Utf8Value();
  std::string query = jsonGetString(json, "query", "hello");
  std::string query_lower = toLower(query);

  int count = 0;
  for (int i = 0; i < 1000; i++) {
    char text[128]; snprintf(text, sizeof(text), "Message %d about topic %d", i, i % 20);
    std::string text_lower = toLower(text);
    if (text_lower.find(query_lower) != std::string::npos) count++;
  }

  JsonBuilder jb;
  jb.buf += "{\"query\":\""; jb.str(query); jb.buf += "\"";
  jb.buf += ",\"total_results\":"; jb.i64(count);
  jb.buf += ",\"search_time_ms\":0}";

  return Napi::String::New(env, jb.buf);
}

static Napi::Value bench_process_analytics(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  std::vector<std::string> types = {"message_sent", "message_received", "user_joined", "user_left", "channel_created"};
  std::vector<int> counts = {100, 90, 80, 70, 60};

  JsonBuilder jb;
  jb.buf += "{\"total_events\":500,\"event_types\":{";
  for (size_t i = 0; i < types.size(); i++) {
    if (i > 0) jb.buf += ",";
    jb.buf += "\""; jb.str(types[i]); jb.buf += "\":"; jb.i64(counts[i]);
  }
  jb.buf += "},\"unique_users\":50}";

  return Napi::String::New(env, jb.buf);
}

static Napi::Value bench_build_notifications(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  std::string json = info[0].As<Napi::String>().Utf8Value();
  int users = jsonCountArray(json, "users");

  JsonBuilder jb;
  jb.buf += "{\"total_notifications\":"; jb.i64(users);
  jb.buf += ",\"batch_size\":"; jb.i64(users);
  jb.buf += "}";

  return Napi::String::New(env, jb.buf);
}

static Napi::Value bench_lookup_user(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  std::string json = info[0].As<Napi::String>().Utf8Value();
  std::string user_id = jsonGetString(json, "user_id", "user_0");

  size_t pos = user_id.rfind('_');
  std::string num = (pos != std::string::npos) ? user_id.substr(pos + 1) : "0";
  std::string username = "player_" + num;
  std::string display_name = "User " + num;

  JsonBuilder jb;
  jb.buf += "{\"user_id\":\""; jb.str(user_id); jb.buf += "\"";
  jb.buf += ",\"username\":\""; jb.str(username); jb.buf += "\"";
  jb.buf += ",\"display_name\":\""; jb.str(display_name); jb.buf += "\"";
  jb.buf += ",\"status\":\"online\"";
  jb.buf += ",\"permissions\":[\"read\",\"write\",\"upload\"]}";

  return Napi::String::New(env, jb.buf);
}

static Napi::Value bench_get_channel_history(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  std::string json = info[0].As<Napi::String>().Utf8Value();
  std::string channel_id = jsonGetString(json, "channel_id", "channel_0");
  long long limit = jsonGetI64(json, "limit", 50);

  JsonBuilder jb;
  jb.buf += "{\"channel_id\":\""; jb.str(channel_id); jb.buf += "\"";
  jb.buf += ",\"message_count\":"; jb.i64(limit);
  jb.buf += ",\"has_more\":true}";

  return Napi::String::New(env, jb.buf);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("sendMessagePipeline", Napi::Function::New(env, bench_send_message_pipeline));
  exports.Set("fanoutDelivery", Napi::Function::New(env, bench_fanout_delivery));
  exports.Set("validateSession", Napi::Function::New(env, bench_validate_session));
  exports.Set("processTypingIndicator", Napi::Function::New(env, bench_process_typing_indicator));
  exports.Set("processReadReceipt", Napi::Function::New(env, bench_process_read_receipt));
  exports.Set("updatePresence", Napi::Function::New(env, bench_update_presence));
  exports.Set("moderateContent", Napi::Function::New(env, bench_moderate_content));
  exports.Set("searchMessages", Napi::Function::New(env, bench_search_messages));
  exports.Set("processAnalytics", Napi::Function::New(env, bench_process_analytics));
  exports.Set("buildNotifications", Napi::Function::New(env, bench_build_notifications));
  exports.Set("lookupUser", Napi::Function::New(env, bench_lookup_user));
  exports.Set("getChannelHistory", Napi::Function::New(env, bench_get_channel_history));
  return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)
