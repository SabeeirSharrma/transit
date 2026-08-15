#include <napi.h>
#include <string>
#include <vector>
#include <map>
#include <algorithm>
#include <cmath>
#include <cstring>
#include <cstdio>
#include <cctype>
#include <chrono>
#include <queue>
#include <stack>
#include <functional>

static double now_ms() {
  auto tp = std::chrono::steady_clock::now().time_since_epoch();
  return std::chrono::duration<double, std::milli>(tp).count();
}

struct JsonBuilder {
  std::string buf;
  void str(const char *s) { buf += s; }
  void str(const std::string &s) { buf += s; }
  void i64(long long v) { char tmp[32]; snprintf(tmp, sizeof(tmp), "%lld", v); buf += tmp; }
  void f64(double v) { char tmp[64]; snprintf(tmp, sizeof(tmp), "%.6g", v); buf += tmp; }
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

static double jsonGetF64(const std::string &json, const std::string &key, double def = 0.0) {
  std::string needle = "\"" + key + "\"";
  size_t pos = json.find(needle);
  if (pos == std::string::npos) return def;
  pos += needle.size();
  while (pos < json.size() && (json[pos] == ' ' || json[pos] == ':')) pos++;
  if (pos >= json.size()) return def;
  return strtod(json.c_str() + pos, nullptr);
}

static std::vector<double> jsonGetArrayF64(const std::string &json, const std::string &key) {
  std::vector<double> result;
  std::string needle = "\"" + key + "\"";
  size_t pos = json.find(needle);
  if (pos == std::string::npos) return result;
  pos = json.find('[', pos);
  if (pos == std::string::npos) return result;
  pos++;
  while (pos < json.size() && json[pos] != ']') {
    while (pos < json.size() && (json[pos] == ' ' || json[pos] == ',')) pos++;
    if (pos >= json.size() || json[pos] == ']') break;
    char *end;
    double val = strtod(json.c_str() + pos, &end);
    if (end != json.c_str() + pos) { result.push_back(val); pos = end - json.c_str(); }
    else break;
  }
  return result;
}

static std::vector<long long> jsonGetArrayI64(const std::string &json, const std::string &key) {
  std::vector<long long> result;
  std::string needle = "\"" + key + "\"";
  size_t pos = json.find(needle);
  if (pos == std::string::npos) return result;
  pos = json.find('[', pos);
  if (pos == std::string::npos) return result;
  pos++;
  while (pos < json.size() && json[pos] != ']') {
    while (pos < json.size() && (json[pos] == ' ' || json[pos] == ',')) pos++;
    if (pos >= json.size() || json[pos] == ']') break;
    char *end;
    long long val = strtoll(json.c_str() + pos, &end, 10);
    if (end != json.c_str() + pos) { result.push_back(val); pos = end - json.c_str(); }
    else break;
  }
  return result;
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

/* ── ETL Pipeline ────────────────────────────────────────────────────────── */

struct EtlGroup { std::string key; double sum; int count; };

Napi::Value etlPipeline(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  std::string json = info[0].As<Napi::String>().Utf8Value();
  std::string csv_data = jsonGetString(json, "csv_data");

  double t0 = now_ms();
  std::map<std::string, EtlGroup> groups;

  size_t pos = 0;
  while (pos < csv_data.size()) {
    size_t nl = csv_data.find('\n', pos);
    if (nl == std::string::npos) nl = csv_data.size();
    std::string line = csv_data.substr(pos, nl - pos);
    pos = nl + 1;
    size_t comma = line.find(',');
    if (comma == std::string::npos) continue;
    std::string key = line.substr(0, comma);
    double val = strtod(line.c_str() + comma + 1, nullptr);
    auto it = groups.find(key);
    if (it != groups.end()) { it->second.sum += val; it->second.count++; }
    else groups[key] = {key, val, 1};
  }

  std::vector<EtlGroup> sorted;
  for (auto &[k, v] : groups) sorted.push_back(v);
  std::sort(sorted.begin(), sorted.end(), [](const EtlGroup &a, const EtlGroup &b) { return a.key < b.key; });

  int total = 0;
  for (auto &g : sorted) total += g.count;
  double duration = now_ms() - t0;

  JsonBuilder jb;
  jb.buf += "{\"records_processed\":"; jb.i64(total);
  jb.buf += ",\"aggregates\":[";
  for (size_t i = 0; i < sorted.size(); i++) {
    if (i > 0) jb.buf += ",";
    jb.buf += "{\"group\":\""; jb.str(sorted[i].key); jb.buf += "\"";
    jb.buf += ",\"sum\":"; jb.f64(sorted[i].sum);
    jb.buf += ",\"avg\":"; jb.f64(sorted[i].sum / sorted[i].count);
    jb.buf += ",\"count\":"; jb.i64(sorted[i].count);
    jb.buf += "}";
  }
  jb.buf += "],\"duration_ms\":"; jb.f64(duration);
  jb.buf += "}";

  return Napi::String::New(env, jb.buf);
}

/* ── Text Analysis ───────────────────────────────────────────────────────── */

struct WordFreq { std::string word; int count; };

static int countSyllables(const std::string &word) {
  const char *vowels = "aeiouy";
  if (word.empty()) return 1;
  int count = 0;
  bool prev_vowel = false;
  for (char c : word) {
    bool is_vowel = (strchr(vowels, c) != nullptr);
    if (is_vowel && !prev_vowel) count++;
    prev_vowel = is_vowel;
  }
  if (word.back() == 'e' && count > 1) count--;
  return count < 1 ? 1 : count;
}

Napi::Value analyzeTextFull(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  std::string json = info[0].As<Napi::String>().Utf8Value();
  std::string text = jsonGetString(json, "text");

  double t0 = now_ms();
  int char_count = (int)text.size();

  std::vector<std::string> words;
  {
    std::string tmp = text;
    char *buf = &tmp[0];
    char *tok = strtok(buf, " \t\n\r");
    while (tok) { words.push_back(tok); tok = strtok(nullptr, " \t\n\r"); }
  }

  double avg_wl = 0;
  if (!words.empty()) {
    double total = 0;
    for (auto &w : words) total += (double)w.size();
    avg_wl = total / words.size();
  }

  std::map<std::string, int> freq_map;
  for (auto &w : words) {
    std::string lower;
    for (char c : w) { char lc = (char)std::tolower((unsigned char)c); if (isalnum((unsigned char)lc)) lower += lc; }
    if (!lower.empty()) freq_map[lower]++;
  }
  int unique_words = (int)freq_map.size();

  std::vector<WordFreq> freq;
  freq.reserve(freq_map.size());
  for (auto &[w, c] : freq_map) freq.push_back({w, c});
  std::sort(freq.begin(), freq.end(), [](const WordFreq &a, const WordFreq &b) { return a.count > b.count; });
  int top_n = std::min((int)freq.size(), 10);

  std::map<std::string, int> bigram_map;
  for (size_t i = 0; i + 1 < words.size(); i++) {
    std::string w0, w1;
    for (char c : words[i]) { char lc = (char)std::tolower((unsigned char)c); if (isalnum((unsigned char)lc)) w0 += lc; }
    for (char c : words[i+1]) { char lc = (char)std::tolower((unsigned char)c); if (isalnum((unsigned char)lc)) w1 += lc; }
    if (!w0.empty() && !w1.empty()) bigram_map[w0 + " " + w1]++;
  }
  std::vector<WordFreq> bigrams;
  bigrams.reserve(bigram_map.size());
  for (auto &[w, c] : bigram_map) bigrams.push_back({w, c});
  std::sort(bigrams.begin(), bigrams.end(), [](const WordFreq &a, const WordFreq &b) { return a.count > b.count; });
  int bg_n = std::min((int)bigrams.size(), 10);

  int sentences = 0;
  for (char c : text) { if (c == '.' || c == '!' || c == '?') sentences++; }
  if (sentences < 1) sentences = 1;

  int total_syllables = 0;
  for (auto &w : words) { std::string lower = toLower(w); total_syllables += countSyllables(lower); }
  double readability = 0;
  if (!words.empty()) {
    readability = 206.835 - 1.015 * ((double)words.size() / sentences) - 84.6 * ((double)total_syllables / words.size());
  }

  double duration = now_ms() - t0;

  JsonBuilder jb;
  jb.buf += "{\"word_count\":"; jb.i64(words.size());
  jb.buf += ",\"char_count\":"; jb.i64(char_count);
  jb.buf += ",\"unique_words\":"; jb.i64(unique_words);
  jb.buf += ",\"avg_word_length\":"; jb.f64(avg_wl);

  jb.buf += ",\"top_words\":[";
  for (int i = 0; i < top_n; i++) {
    if (i > 0) jb.buf += ",";
    jb.buf += "{\"word\":\""; jb.str(freq[i].word); jb.buf += "\"";
    jb.buf += ",\"count\":"; jb.i64(freq[i].count); jb.buf += "}";
  }
  jb.buf += "]";

  jb.buf += ",\"bigrams\":[";
  for (int i = 0; i < bg_n; i++) {
    if (i > 0) jb.buf += ",";
    jb.buf += "{\"word\":\""; jb.str(bigrams[i].word); jb.buf += "\"";
    jb.buf += ",\"count\":"; jb.i64(bigrams[i].count); jb.buf += "}";
  }
  jb.buf += "]";

  jb.buf += ",\"readability_score\":"; jb.f64(readability);
  jb.buf += ",\"duration_ms\":"; jb.f64(duration);
  jb.buf += "}";

  return Napi::String::New(env, jb.buf);
}

/* ── Matrix Multiply ─────────────────────────────────────────────────────── */

Napi::Value matrixMultiply(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  std::string json = info[0].As<Napi::String>().Utf8Value();

  double t0 = now_ms();
  int m = (int)jsonGetI64(json, "m", 0);
  int n = (int)jsonGetI64(json, "n", 0);
  int p = (int)jsonGetI64(json, "p", 0);
  std::vector<double> a = jsonGetArrayF64(json, "a");
  std::vector<double> b = jsonGetArrayF64(json, "b");

  std::vector<double> c(m * p, 0.0);
  for (int i = 0; i < m; i++) {
    for (int k = 0; k < n; k++) {
      double a_val = a[i * n + k];
      for (int j = 0; j < p; j++) {
        c[i * p + j] += a_val * b[k * p + j];
      }
    }
  }

  double duration = now_ms() - t0;

  JsonBuilder jb;
  jb.buf += "{\"result\":[";
  for (int i = 0; i < m * p; i++) {
    if (i > 0) jb.buf += ",";
    jb.f64(c[i]);
  }
  jb.buf += "],\"dimensions\":{\"m\":"; jb.i64(m);
  jb.buf += ",\"n\":"; jb.i64(n);
  jb.buf += ",\"p\":"; jb.i64(p);
  jb.buf += "},\"duration_ms\":"; jb.f64(duration);
  jb.buf += "}";

  return Napi::String::New(env, jb.buf);
}

/* ── Matrix Determinant ──────────────────────────────────────────────────── */

static double detRecursive(const std::vector<double> &flat, int n, int ld) {
  if (n == 1) return flat[0];
  if (n == 2) return flat[0] * flat[ld + 1] - flat[1] * flat[ld];
  double result = 0.0;
  for (int j = 0; j < n; j++) {
    std::vector<double> sub;
    sub.reserve((n - 1) * (n - 1));
    for (int i = 1; i < n; i++) {
      for (int k = 0; k < n; k++) {
        if (k != j) sub.push_back(flat[i * ld + k]);
      }
    }
    double sign = (j % 2 == 0) ? 1.0 : -1.0;
    result += sign * flat[j] * detRecursive(sub, n - 1, n - 1);
  }
  return result;
}

Napi::Value matrixDeterminant(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  std::string json = info[0].As<Napi::String>().Utf8Value();

  double t0 = now_ms();
  int n = (int)jsonGetI64(json, "n", 0);
  std::vector<double> flat = jsonGetArrayF64(json, "flat");

  double det = detRecursive(flat, n, n);
  double duration = now_ms() - t0;

  JsonBuilder jb;
  jb.buf += "{\"determinant\":"; jb.f64(det);
  jb.buf += ",\"size\":"; jb.i64(n);
  jb.buf += ",\"duration_ms\":"; jb.f64(duration);
  jb.buf += "}";

  return Napi::String::New(env, jb.buf);
}

/* ── Graph Processing ────────────────────────────────────────────────────── */

struct Edge { int to; int weight; };

Napi::Value processGraph(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  std::string json = info[0].As<Napi::String>().Utf8Value();

  double t0 = now_ms();
  int n = (int)jsonGetI64(json, "nodes", 0);
  int iters = (int)jsonGetI64(json, "iterations", 20);
  std::vector<long long> edges_flat = jsonGetArrayI64(json, "edges_flat");

  std::vector<std::vector<Edge>> adj(n);
  for (size_t i = 0; i + 2 < edges_flat.size(); i += 3) {
    int from = (int)edges_flat[i], to = (int)edges_flat[i+1], w = (int)edges_flat[i+2];
    if (from >= 0 && from < n && to >= 0 && to < n) adj[from].push_back({to, w});
  }

  /* BFS from 0 */
  std::vector<int> bfs_order;
  std::vector<bool> visited(n, false);
  std::queue<int> q;
  if (n > 0) { visited[0] = true; q.push(0); }
  while (!q.empty()) {
    int node = q.front(); q.pop();
    bfs_order.push_back(node);
    for (auto &e : adj[node]) {
      if (!visited[e.to]) { visited[e.to] = true; q.push(e.to); }
    }
  }

  /* Dijkstra from 0 to targets 1..5 */
  std::vector<int> targets = {1,2,3,4,5};

  JsonBuilder jb;
  jb.buf += "\"shortest_paths\":[";
  bool first_sp = true;
  for (int tgt : targets) {
    if (tgt >= n) continue;
    std::vector<int> dist(n, 2147483647), prev(n, -1);
    dist[0] = 0;
    std::queue<int> dq;
    dq.push(0);
    while (!dq.empty()) {
      int u = dq.front(); dq.pop();
      for (auto &e : adj[u]) {
        int nd = dist[u] + e.weight;
        if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = u; dq.push(e.to); }
      }
    }
    if (!first_sp) jb.buf += ",";
    first_sp = false;
    jb.buf += "{\"from\":0,\"to\":"; jb.i64(tgt);
    jb.buf += ",\"distance\":"; jb.i64(dist[tgt]);
    jb.buf += ",\"path\":[";
    if (dist[tgt] < 2147483647) {
      std::vector<int> path;
      for (int c = tgt; c != -1; c = prev[c]) path.push_back(c);
      for (int i = (int)path.size() - 1; i >= 0; i--) {
        if (i < (int)path.size() - 1) jb.buf += ",";
        jb.i64(path[i]);
      }
    }
    jb.buf += "]}";
  }
  jb.buf += "]";

  /* PageRank */
  std::vector<double> ranks(n, 1.0 / n), new_ranks(n);
  double damping = 0.85;
  for (int iter = 0; iter < iters; iter++) {
    for (int i = 0; i < n; i++) new_ranks[i] = (1.0 - damping) / n;
    for (int i = 0; i < n; i++) {
      double share = damping * ranks[i] / std::max((int)adj[i].size(), 1);
      for (auto &e : adj[i]) new_ranks[e.to] += share;
    }
    ranks = new_ranks;
  }

  struct PR { int node; double rank; };
  std::vector<PR> pr_list(n);
  for (int i = 0; i < n; i++) pr_list[i] = {i, ranks[i]};
  std::sort(pr_list.begin(), pr_list.end(), [](const PR &a, const PR &b) { return a.rank > b.rank; });

  /* Connected components */
  std::vector<bool> visited_cc(n, false);
  int components = 0;
  for (int i = 0; i < n; i++) {
    if (!visited_cc[i]) {
      components++;
      std::stack<int> stk;
      stk.push(i);
      while (!stk.empty()) {
        int node = stk.top(); stk.pop();
        if (!visited_cc[node]) {
          visited_cc[node] = true;
          for (auto &e : adj[node]) {
            if (!visited_cc[e.to]) stk.push(e.to);
          }
        }
      }
    }
  }

  JsonBuilder final_jb;
  final_jb.buf += "{\"bfs_order\":[";
  for (size_t i = 0; i < bfs_order.size(); i++) {
    if (i > 0) final_jb.buf += ",";
    final_jb.i64(bfs_order[i]);
  }
  final_jb.buf += "],";
  final_jb.buf += jb.buf;

  final_jb.buf += ",\"page_rank\":[";
  for (int i = 0; i < n; i++) {
    if (i > 0) final_jb.buf += ",";
    final_jb.buf += "{\"node\":"; final_jb.i64(pr_list[i].node);
    final_jb.buf += ",\"rank\":"; final_jb.f64(pr_list[i].rank);
    final_jb.buf += "}";
  }
  final_jb.buf += "],\"connected_components\":"; final_jb.i64(components);
  double duration = now_ms() - t0;
  final_jb.buf += ",\"duration_ms\":"; final_jb.f64(duration);
  final_jb.buf += "}";

  return Napi::String::New(env, final_jb.buf);
}

/* ── Fibonacci Memo ──────────────────────────────────────────────────────── */

Napi::Value fibonacciMemo(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  std::string json = info[0].As<Napi::String>().Utf8Value();

  double t0 = now_ms();
  int n = (int)jsonGetI64(json, "n", 0);

  std::vector<unsigned long long> memo(n + 1, 0);
  for (int i = 0; i <= n; i++) {
    if (i <= 1) { memo[i] = (unsigned long long)i; continue; }
    memo[i] = memo[i-1] + memo[i-2];
  }

  double duration = now_ms() - t0;

  JsonBuilder jb;
  jb.buf += "{\"n\":"; jb.i64(n);
  jb.buf += ",\"result\":"; jb.i64((long long)memo[n]);
  jb.buf += ",\"duration_ms\":"; jb.f64(duration);
  jb.buf += "}";

  return Napi::String::New(env, jb.buf);
}

/* ── Hash Data ───────────────────────────────────────────────────────────── */

static std::string formatHex16(unsigned long long v) {
  char tmp[32]; snprintf(tmp, sizeof(tmp), "%016llx", v);
  return tmp;
}

Napi::Value hashData(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  std::string json = info[0].As<Napi::String>().Utf8Value();

  double t0 = now_ms();
  std::string data = jsonGetString(json, "data", "benchmark-test-data-payload");
  int rounds = (int)jsonGetI64(json, "rounds", 10000);

  std::string current = data;
  for (int i = 0; i < rounds; i++) {
    current = formatHex16(fnv1a(current));
  }

  double duration = now_ms() - t0;

  JsonBuilder jb;
  jb.buf += "{\"hash\":\""; jb.str(current); jb.buf += "\"";
  jb.buf += ",\"rounds\":"; jb.i64(rounds);
  jb.buf += ",\"duration_ms\":"; jb.f64(duration);
  jb.buf += "}";

  return Napi::String::New(env, jb.buf);
}

/* ── Module Init ─────────────────────────────────────────────────────────── */

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("etlPipeline", Napi::Function::New(env, etlPipeline));
  exports.Set("analyzeTextFull", Napi::Function::New(env, analyzeTextFull));
  exports.Set("matrixMultiply", Napi::Function::New(env, matrixMultiply));
  exports.Set("matrixDeterminant", Napi::Function::New(env, matrixDeterminant));
  exports.Set("processGraph", Napi::Function::New(env, processGraph));
  exports.Set("fibonacciMemo", Napi::Function::New(env, fibonacciMemo));
  exports.Set("hashData", Napi::Function::New(env, hashData));
  return exports;
}

NODE_API_MODULE(NODE_GYP_MODULE_NAME, Init)
