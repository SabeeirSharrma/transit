#include <napi.h>
#include <string>

Napi::Value Add(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    double a = info[0].As<Napi::Number>().DoubleValue();
    double b = info[1].As<Napi::Number>().DoubleValue();

    return Napi::Number::New(env, a + b);
}

Napi::Value Greet(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    return Napi::String::New(env, "Hello from C++!");
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("add", Napi::Function::New(env, Add));
    exports.Set("greet", Napi::Function::New(env, Greet));

    return exports;
}

NODE_API_MODULE(addon, Init)
