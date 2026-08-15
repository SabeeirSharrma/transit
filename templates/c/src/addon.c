#include <node_api.h>
#include <string.h>
#include <stdlib.h>

napi_value Add(napi_env env, napi_callback_info info) {
    size_t argc = 2;
    napi_value args[2];
    napi_get_cb_info(env, info, &argc, args, NULL, NULL);

    double a, b;
    napi_get_value_double(env, args[0], &a);
    napi_get_value_double(env, args[1], &b);

    napi_value result;
    napi_create_double(env, a + b, &result);
    return result;
}

napi_value Greet(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];
    napi_get_cb_info(env, info, &argc, args, NULL, NULL);

    char buf[256];
    size_t result;
    napi_get_value_string_utf8(env, args[0], buf, sizeof(buf), &result);

    napi_value msg;
    napi_create_string_utf8(env, "Hello from C!", NAPI_AUTO_LENGTH, &msg);
    return msg;
}

napi_value Init(napi_env env, napi_value exports) {
    napi_value fn_add, fn_greet;

    napi_create_function(env, "add", NAPI_AUTO_LENGTH, Add, NULL, &fn_add);
    napi_set_named_property(env, exports, "add", fn_add);

    napi_create_function(env, "greet", NAPI_AUTO_LENGTH, Greet, NULL, &fn_greet);
    napi_set_named_property(env, exports, "greet", fn_greet);

    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
