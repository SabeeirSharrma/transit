#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <node_api.h>
#include <string.h>
#include <stdlib.h>
#include <ctype.h>
#include <math.h>
#include <time.h>

/* ── JSON string builder ──────────────────────────────────────────────────── */

typedef struct {
  char *buf;
  size_t len;
  size_t cap;
} JsonBuf;

static void jb_init(JsonBuf *b) {
  b->cap = 8192;
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

/* ── Tiny JSON parser ────────────────────────────────────────────────────── */

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

static double json_get_f64(const char *json, const char *key, double def) {
  const char *p = json_find_key(json, key);
  if (!p) return def;
  return atof(p);
}

static int json_get_array_count(const char *json, const char *key) {
  const char *p = json_find_key(json, key);
  if (!p || *p != '[') return 0;
  p++;
  int count = 0;
  for (; *p && *p != ']'; p++) {
    if (*p == ',') count++;
  }
  if (*(p - 1) != '[') count++;
  return count;
}

static int json_parse_array_f64(const char *json, const char *key, double *out, int max) {
  const char *p = json_find_key(json, key);
  if (!p || *p != '[') return 0;
  p++;
  int count = 0;
  while (*p && *p != ']' && count < max) {
    while (*p == ' ' || *p == ',') p++;
    if (*p == ']' || !*p) break;
    out[count++] = atof(p);
    while (*p && *p != ',' && *p != ']') p++;
  }
  return count;
}

static int json_parse_array_i64(const char *json, const char *key, long long *out, int max) {
  const char *p = json_find_key(json, key);
  if (!p || *p != '[') return 0;
  p++;
  int count = 0;
  while (*p && *p != ']' && count < max) {
    while (*p == ' ' || *p == ',') p++;
    if (*p == ']' || !*p) break;
    out[count++] = atoll(p);
    while (*p && *p != ',' && *p != ']') p++;
  }
  return count;
}

static double now_ms(void) {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return (double)ts.tv_sec * 1000.0 + (double)ts.tv_nsec / 1e6;
}

/* ── ETL Pipeline ────────────────────────────────────────────────────────── */

typedef struct { char key[128]; double sum; int count; } EtlGroup;

static int cmp_group(const void *a, const void *b) {
  return strcmp(((const EtlGroup *)a)->key, ((const EtlGroup *)b)->key);
}

napi_value etlPipeline(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  char buf[131072];
  napi_get_value_string_utf8(env, args[0], buf, sizeof(buf), NULL);

  double t0 = now_ms();
  char csv_data[131072];
  json_get_string(buf, "csv_data", csv_data, sizeof(csv_data));

  EtlGroup groups[1024];
  int ngroups = 0;

  char *line = strtok(csv_data, "\n");
  while (line && ngroups < 1024) {
    char *comma = strchr(line, ',');
    if (comma) {
      *comma = '\0';
      char *key = line;
      double val = atof(comma + 1);
      int found = -1;
      for (int i = 0; i < ngroups; i++) {
        if (strcmp(groups[i].key, key) == 0) { found = i; break; }
      }
      if (found >= 0) {
        groups[found].sum += val;
        groups[found].count++;
      } else {
        strncpy(groups[ngroups].key, key, 127);
        groups[ngroups].key[127] = '\0';
        groups[ngroups].sum = val;
        groups[ngroups].count = 1;
        ngroups++;
      }
    }
    line = strtok(NULL, "\n");
  }

  qsort(groups, ngroups, sizeof(EtlGroup), cmp_group);

  int total_records = 0;
  for (int i = 0; i < ngroups; i++) total_records += groups[i].count;
  double duration = now_ms() - t0;

  JsonBuf jb;
  jb_init(&jb);
  jb_str(&jb, "{\"records_processed\":"); jb_i64(&jb, total_records);
  jb_str(&jb, ",\"aggregates\":[");

  for (int i = 0; i < ngroups; i++) {
    if (i > 0) jb_str(&jb, ",");
    jb_str(&jb, "{\"group\":\""); jb_str(&jb, groups[i].key); jb_str(&jb, "\"");
    jb_str(&jb, ",\"sum\":"); jb_f64(&jb, groups[i].sum);
    jb_str(&jb, ",\"avg\":"); jb_f64(&jb, groups[i].sum / groups[i].count);
    jb_str(&jb, ",\"count\":"); jb_i64(&jb, groups[i].count);
    jb_str(&jb, "}");
  }

  jb_str(&jb, "],\"duration_ms\":"); jb_f64(&jb, duration);
  jb_str(&jb, "}");

  napi_value result;
  napi_create_string_utf8(env, jb.buf, jb.len, &result);
  free(jb.buf);
  return result;
}

/* ── Text Analysis ───────────────────────────────────────────────────────── */

typedef struct { char word[128]; int count; } WordFreq;

static int cmp_wf(const void *a, const void *b) {
  return ((const WordFreq *)b)->count - ((const WordFreq *)a)->count;
}

static int count_syllables(const char *word) {
  const char *vowels = "aeiouy";
  int len = (int)strlen(word);
  if (len == 0) return 1;
  int count = 0, prev_vowel = 0;
  for (int i = 0; i < len; i++) {
    int is_vowel = (strchr(vowels, word[i]) != NULL);
    if (is_vowel && !prev_vowel) count++;
    prev_vowel = is_vowel;
  }
  if (word[len - 1] == 'e' && count > 1) count--;
  return count < 1 ? 1 : count;
}

napi_value analyzeTextFull(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  char buf[131072];
  napi_get_value_string_utf8(env, args[0], buf, sizeof(buf), NULL);

  double t0 = now_ms();
  char text[131072];
  json_get_string(buf, "text", text, sizeof(text));

  int char_count = (int)strlen(text);

  char words[4096][128];
  int word_count = 0;
  char *tok = strtok(text, " \t\n\r");
  while (tok && word_count < 4096) {
    strncpy(words[word_count], tok, 127);
    words[word_count][127] = '\0';
    word_count++;
    tok = strtok(NULL, " \t\n\r");
  }

  double avg_wl = 0;
  if (word_count > 0) {
    double total = 0;
    for (int i = 0; i < word_count; i++) total += (double)strlen(words[i]);
    avg_wl = total / word_count;
  }

  WordFreq freq[4096];
  int nfreq = 0;
  for (int i = 0; i < word_count; i++) {
    char lower[128];
    int j;
    for (j = 0; words[i][j]; j++) {
      char c = (char)tolower((unsigned char)words[i][j]);
      if (isalnum((unsigned char)c)) lower[j] = c;
    }
    lower[j] = '\0';
    if (j == 0) continue;
    int found = -1;
    for (int k = 0; k < nfreq; k++) {
      if (strcmp(freq[k].word, lower) == 0) { found = k; break; }
    }
    if (found >= 0) { freq[found].count++; }
    else if (nfreq < 4096) { strncpy(freq[nfreq].word, lower, 127); freq[nfreq].word[127] = '\0'; freq[nfreq].count = 1; nfreq++; }
  }
  int unique_words = nfreq;
  qsort(freq, nfreq, sizeof(WordFreq), cmp_wf);
  int top_n = nfreq < 10 ? nfreq : 10;

  WordFreq bigrams[4096];
  int nbigrams = 0;
  for (int i = 0; i < word_count - 1; i++) {
    char bg[256];
    char w0[128], w1[128];
    int j0, j1;
    for (j0 = 0; words[i][j0]; j0++) { char c = (char)tolower((unsigned char)words[i][j0]); if (isalnum((unsigned char)c)) w0[j0] = c; }
    w0[j0] = '\0';
    for (j1 = 0; words[i+1][j1]; j1++) { char c = (char)tolower((unsigned char)words[i+1][j1]); if (isalnum((unsigned char)c)) w1[j1] = c; }
    w1[j1] = '\0';
    if (j0 == 0 || j1 == 0) continue;
    snprintf(bg, sizeof(bg), "%s %s", w0, w1);
    int found = -1;
    for (int k = 0; k < nbigrams; k++) {
      if (strcmp(bigrams[k].word, bg) == 0) { found = k; break; }
    }
    if (found >= 0) { bigrams[found].count++; }
    else if (nbigrams < 4096) { strncpy(bigrams[nbigrams].word, bg, 127); bigrams[nbigrams].word[127] = '\0'; bigrams[nbigrams].count = 1; nbigrams++; }
  }
  qsort(bigrams, nbigrams, sizeof(WordFreq), cmp_wf);
  int bg_n = nbigrams < 10 ? nbigrams : 10;

  int sentences = 0;
  for (int i = 0; text[i]; i++) {
    if (text[i] == '.' || text[i] == '!' || text[i] == '?') sentences++;
  }
  if (sentences < 1) sentences = 1;

  int total_syllables = 0;
  for (int i = 0; i < word_count; i++) {
    char lower[128];
    int j;
    for (j = 0; words[i][j]; j++) lower[j] = (char)tolower((unsigned char)words[i][j]);
    lower[j] = '\0';
    total_syllables += count_syllables(lower);
  }
  double readability = 0;
  if (word_count > 0) {
    readability = 206.835 - 1.015 * ((double)word_count / sentences) - 84.6 * ((double)total_syllables / word_count);
  }

  double duration = now_ms() - t0;

  JsonBuf jb;
  jb_init(&jb);
  jb_str(&jb, "{\"word_count\":"); jb_i64(&jb, word_count);
  jb_str(&jb, ",\"char_count\":"); jb_i64(&jb, char_count);
  jb_str(&jb, ",\"unique_words\":"); jb_i64(&jb, unique_words);
  jb_str(&jb, ",\"avg_word_length\":"); jb_f64(&jb, avg_wl);

  jb_str(&jb, ",\"top_words\":[");
  for (int i = 0; i < top_n; i++) {
    if (i > 0) jb_str(&jb, ",");
    jb_str(&jb, "{\"word\":\""); jb_str(&jb, freq[i].word); jb_str(&jb, "\"");
    jb_str(&jb, ",\"count\":"); jb_i64(&jb, freq[i].count); jb_str(&jb, "}");
  }
  jb_str(&jb, "]");

  jb_str(&jb, ",\"bigrams\":[");
  for (int i = 0; i < bg_n; i++) {
    if (i > 0) jb_str(&jb, ",");
    jb_str(&jb, "{\"word\":\""); jb_str(&jb, bigrams[i].word); jb_str(&jb, "\"");
    jb_str(&jb, ",\"count\":"); jb_i64(&jb, bigrams[i].count); jb_str(&jb, "}");
  }
  jb_str(&jb, "]");

  jb_str(&jb, ",\"readability_score\":"); jb_f64(&jb, readability);
  jb_str(&jb, ",\"duration_ms\":"); jb_f64(&jb, duration);
  jb_str(&jb, "}");

  napi_value result;
  napi_create_string_utf8(env, jb.buf, jb.len, &result);
  free(jb.buf);
  return result;
}

/* ── Matrix Multiply ─────────────────────────────────────────────────────── */

napi_value matrixMultiply(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  char buf[131072];
  napi_get_value_string_utf8(env, args[0], buf, sizeof(buf), NULL);

  double t0 = now_ms();
  int m = (int)json_get_i64(buf, "m", 0);
  int n = (int)json_get_i64(buf, "n", 0);
  int p = (int)json_get_i64(buf, "p", 0);

  double a[2500], b[2500], c[2500];
  int ac = json_parse_array_f64(buf, "a", a, 2500);
  int bc = json_parse_array_f64(buf, "b", b, 2500);

  memset(c, 0, sizeof(c));
  for (int i = 0; i < m; i++) {
    for (int k = 0; k < n; k++) {
      double a_val = a[i * n + k];
      for (int j = 0; j < p; j++) {
        c[i * p + j] += a_val * b[k * p + j];
      }
    }
  }

  double duration = now_ms() - t0;

  JsonBuf jb;
  jb_init(&jb);
  jb_str(&jb, "{\"result\":[");
  for (int i = 0; i < m * p; i++) {
    if (i > 0) jb_str(&jb, ",");
    jb_f64(&jb, c[i]);
  }
  jb_str(&jb, "],\"dimensions\":{\"m\":"); jb_i64(&jb, m);
  jb_str(&jb, ",\"n\":"); jb_i64(&jb, n);
  jb_str(&jb, ",\"p\":"); jb_i64(&jb, p);
  jb_str(&jb, "},\"duration_ms\":"); jb_f64(&jb, duration);
  jb_str(&jb, "}");

  napi_value result;
  napi_create_string_utf8(env, jb.buf, jb.len, &result);
  free(jb.buf);
  return result;
}

/* ── Matrix Determinant ──────────────────────────────────────────────────── */

static double det_recursive(double *flat, int n, int ld) {
  if (n == 1) return flat[0];
  if (n == 2) return flat[0] * flat[ld + 1] - flat[1] * flat[ld];
  double result = 0.0;
  double sub[64];
  for (int j = 0; j < n; j++) {
    int si = 0;
    for (int i = 1; i < n; i++) {
      for (int k = 0; k < n; k++) {
        if (k != j) sub[si++] = flat[i * ld + k];
      }
    }
    double sign = (j % 2 == 0) ? 1.0 : -1.0;
    result += sign * flat[j] * det_recursive(sub, n - 1, n - 1);
  }
  return result;
}

napi_value matrixDeterminant(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  char buf[131072];
  napi_get_value_string_utf8(env, args[0], buf, sizeof(buf), NULL);

  double t0 = now_ms();
  int n = (int)json_get_i64(buf, "n", 0);
  double flat[64];
  json_parse_array_f64(buf, "flat", flat, 64);

  double det = det_recursive(flat, n, n);
  double duration = now_ms() - t0;

  JsonBuf jb;
  jb_init(&jb);
  jb_str(&jb, "{\"determinant\":"); jb_f64(&jb, det);
  jb_str(&jb, ",\"size\":"); jb_i64(&jb, n);
  jb_str(&jb, ",\"duration_ms\":"); jb_f64(&jb, duration);
  jb_str(&jb, "}");

  napi_value result;
  napi_create_string_utf8(env, jb.buf, jb.len, &result);
  free(jb.buf);
  return result;
}

/* ── Graph Processing ────────────────────────────────────────────────────── */

typedef struct { int to; int weight; } Edge;

napi_value processGraph(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  char buf[131072];
  napi_get_value_string_utf8(env, args[0], buf, sizeof(buf), NULL);

  double t0 = now_ms();
  int n = (int)json_get_i64(buf, "nodes", 0);
  int iters = (int)json_get_i64(buf, "iterations", 20);

  long long edges_flat[15000];
  int ec = json_parse_array_i64(buf, "edges_flat", edges_flat, 15000);

  /* adjacency list */
  Edge *adj[2048];
  int adj_count[2048] = {0};
  int adj_cap[2048] = {0};
  for (int i = 0; i < n && i < 2048; i++) { adj[i] = NULL; adj_cap[i] = 0; }

  for (int i = 0; i + 2 < ec; i += 3) {
    int from = (int)edges_flat[i], to = (int)edges_flat[i+1], w = (int)edges_flat[i+2];
    if (from >= 0 && from < n && to >= 0 && to < n) {
      if (adj_count[from] >= adj_cap[from]) {
        adj_cap[from] = adj_cap[from] ? adj_cap[from] * 2 : 8;
        adj[from] = realloc(adj[from], sizeof(Edge) * adj_cap[from]);
      }
      adj[from][adj_count[from]].to = to;
      adj[from][adj_count[from]].weight = w;
      adj_count[from]++;
    }
  }

  /* BFS from 0 */
  int bfs_order[2048], bfs_len = 0;
  int visited_bfs[2048] = {0};
  int queue[2048], qh = 0, qt = 0;
  if (n > 0) { visited_bfs[0] = 1; queue[qt++] = 0; }
  while (qh < qt) {
    int node = queue[qh++];
    bfs_order[bfs_len++] = node;
    for (int i = 0; i < adj_count[node]; i++) {
      int t = adj[node][i].to;
      if (!visited_bfs[t]) { visited_bfs[t] = 1; queue[qt++] = t; }
    }
  }

  /* Dijkstra from 0 to targets 1..5 */
  int targets[] = {1,2,3,4,5};
  int ntargets = 5;
  JsonBuf jb;
  jb_init(&jb);
  jb_str(&jb, "\"shortest_paths\":[");

  for (int ti = 0; ti < ntargets; ti++) {
    int tgt = targets[ti];
    if (tgt >= n) continue;

    int dist[2048], prev[2048];
    for (int i = 0; i < n; i++) { dist[i] = 2147483647; prev[i] = -1; }
    dist[0] = 0;

    int dqueue[2048], dqh = 0, dqt = 0;
    dqueue[dqt++] = 0;
    while (dqh < dqt) {
      int u = dqueue[dqh++];
      for (int i = 0; i < adj_count[u]; i++) {
        int v = adj[u][i].to, w = adj[u][i].weight;
        int nd = dist[u] + w;
        if (nd < dist[v]) { dist[v] = nd; prev[v] = u; dqueue[dqt++] = v; }
      }
    }

    if (ti > 0) jb_str(&jb, ",");
    jb_str(&jb, "{\"from\":0,\"to\":"); jb_i64(&jb, tgt);
    jb_str(&jb, ",\"distance\":"); jb_i64(&jb, dist[tgt]);
    jb_str(&jb, ",\"path\":[");

    if (dist[tgt] < 2147483647) {
      int path[2048], plen = 0, c = tgt;
      while (c != -1) { path[plen++] = c; c = prev[c]; }
      for (int i = plen - 1; i >= 0; i--) {
        if (i < plen - 1) jb_str(&jb, ",");
        jb_i64(&jb, path[i]);
      }
    }
    jb_str(&jb, "]}");
  }
  jb_str(&jb, "]");

  /* PageRank */
  double ranks[2048], new_ranks[2048];
  for (int i = 0; i < n; i++) ranks[i] = 1.0 / n;
  double damping = 0.85;
  for (int iter = 0; iter < iters; iter++) {
    for (int i = 0; i < n; i++) new_ranks[i] = (1.0 - damping) / n;
    for (int i = 0; i < n; i++) {
      double share = damping * ranks[i] / (adj_count[i] > 0 ? adj_count[i] : 1);
      for (int j = 0; j < adj_count[i]; j++) {
        new_ranks[adj[i][j].to] += share;
      }
    }
    memcpy(ranks, new_ranks, sizeof(double) * n);
  }

  /* sort page_rank by descending */
  typedef struct { int node; double rank; } PR;
  int pr_nodes[2048];
  double pr_ranks[2048];
  for (int i = 0; i < n; i++) { pr_nodes[i] = i; pr_ranks[i] = ranks[i]; }

  for (int i = 1; i < n; i++) {
    double tmp_r = pr_ranks[i];
    int tmp_n = pr_nodes[i];
    int j = i - 1;
    while (j >= 0 && pr_ranks[j] < tmp_r) { pr_ranks[j+1] = pr_ranks[j]; pr_nodes[j+1] = pr_nodes[j]; j--; }
    pr_ranks[j+1] = tmp_r; pr_nodes[j+1] = tmp_n;
  }

  /* connected components */
  int visited_cc[2048] = {0};
  int components = 0;
  for (int i = 0; i < n; i++) {
    if (!visited_cc[i]) {
      components++;
      int stack[2048], sp = 0;
      stack[sp++] = i;
      while (sp > 0) {
        int node = stack[--sp];
        if (!visited_cc[node]) {
          visited_cc[node] = 1;
          for (int j = 0; j < adj_count[node]; j++) {
            if (!visited_cc[adj[node][j].to]) stack[sp++] = adj[node][j].to;
          }
        }
      }
    }
  }

  /* build final JSON */
  JsonBuf final_jb;
  jb_init(&final_jb);
  jb_str(&final_jb, "{\"bfs_order\":[");
  for (int i = 0; i < bfs_len; i++) {
    if (i > 0) jb_str(&final_jb, ",");
    jb_i64(&final_jb, bfs_order[i]);
  }
  jb_str(&final_jb, "],");

  jb_append(&final_jb, jb.buf, jb.len);
  free(jb.buf);

  jb_str(&final_jb, ",\"page_rank\":[");
  for (int i = 0; i < n; i++) {
    if (i > 0) jb_str(&final_jb, ",");
    jb_str(&final_jb, "{\"node\":"); jb_i64(&final_jb, pr_nodes[i]);
    jb_str(&final_jb, ",\"rank\":"); jb_f64(&final_jb, pr_ranks[i]);
    jb_str(&final_jb, "}");
  }
  jb_str(&final_jb, "],\"connected_components\":"); jb_i64(&final_jb, components);
  double duration = now_ms() - t0;
  jb_str(&final_jb, ",\"duration_ms\":"); jb_f64(&final_jb, duration);
  jb_str(&final_jb, "}");

  napi_value result;
  napi_create_string_utf8(env, final_jb.buf, final_jb.len, &result);
  free(final_jb.buf);

  for (int i = 0; i < n; i++) free(adj[i]);
  return result;
}

/* ── Fibonacci Memo ──────────────────────────────────────────────────────── */

napi_value fibonacciMemo(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  char buf[1024];
  napi_get_value_string_utf8(env, args[0], buf, sizeof(buf), NULL);

  double t0 = now_ms();
  int n = (int)json_get_i64(buf, "n", 0);

  unsigned long long memo[128];
  memset(memo, 0, sizeof(memo));

  /* iterative bottom-up */
  for (int i = 0; i <= n && i < 128; i++) {
    if (i <= 1) { memo[i] = (unsigned long long)i; continue; }
    memo[i] = memo[i-1] + memo[i-2];
  }

  double duration = now_ms() - t0;

  JsonBuf jb;
  jb_init(&jb);
  jb_str(&jb, "{\"n\":"); jb_i64(&jb, n);
  jb_str(&jb, ",\"result\":"); jb_i64(&jb, (long long)memo[n]);
  jb_str(&jb, ",\"duration_ms\":"); jb_f64(&jb, duration);
  jb_str(&jb, "}");

  napi_value result;
  napi_create_string_utf8(env, jb.buf, jb.len, &result);
  free(jb.buf);
  return result;
}

/* ── Hash Data ───────────────────────────────────────────────────────────── */

static unsigned long long fnv1a(const char *s) {
  unsigned long long h = 14695981039346656037ULL;
  for (; *s; s++) { h ^= (unsigned char)*s; h *= 1099511628211ULL; }
  return h;
}

napi_value hashData(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  char buf[4096];
  napi_get_value_string_utf8(env, args[0], buf, sizeof(buf), NULL);

  double t0 = now_ms();
  char data[2048];
  int rounds = (int)json_get_i64(buf, "rounds", 10000);
  json_get_string(buf, "data", data, sizeof(data));

  char current[256];
  strncpy(current, data, sizeof(current) - 1);
  current[249] = '\0';

  for (int i = 0; i < rounds; i++) {
    unsigned long long h = fnv1a(current);
    snprintf(current, sizeof(current), "%016llx", h);
  }

  double duration = now_ms() - t0;

  JsonBuf jb;
  jb_init(&jb);
  jb_str(&jb, "{\"hash\":\""); jb_str(&jb, current); jb_str(&jb, "\"");
  jb_str(&jb, ",\"rounds\":"); jb_i64(&jb, rounds);
  jb_str(&jb, ",\"duration_ms\":"); jb_f64(&jb, duration);
  jb_str(&jb, "}");

  napi_value result;
  napi_create_string_utf8(env, jb.buf, jb.len, &result);
  free(jb.buf);
  return result;
}

/* ── Module Init ─────────────────────────────────────────────────────────── */

#define DECLARE_NAPI(name, func) { name, NULL, func, NULL, NULL, NULL, napi_default, NULL }

static napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor desc[] = {
    DECLARE_NAPI("etlPipeline", etlPipeline),
    DECLARE_NAPI("analyzeTextFull", analyzeTextFull),
    DECLARE_NAPI("matrixMultiply", matrixMultiply),
    DECLARE_NAPI("matrixDeterminant", matrixDeterminant),
    DECLARE_NAPI("processGraph", processGraph),
    DECLARE_NAPI("fibonacciMemo", fibonacciMemo),
    DECLARE_NAPI("hashData", hashData),
  };
  napi_define_properties(env, exports, sizeof(desc) / sizeof(desc[0]), desc);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
