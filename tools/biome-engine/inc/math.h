#pragma once
#define floor __builtin_floor
#define ceil __builtin_ceil
#define sqrt __builtin_sqrt
#define fabs __builtin_fabs
#define floorf __builtin_floorf
#define sqrtf __builtin_sqrtf
#define fabsf __builtin_fabsf
#define round __builtin_round
#define trunc __builtin_trunc
#define fmin __builtin_fmin
#define fmax __builtin_fmax
#define INFINITY __builtin_inf()
#define NAN __builtin_nan("")
#define isnan __builtin_isnan
__attribute__((import_module("env"), import_name("pow"))) double pow(double, double);
__attribute__((import_module("env"), import_name("exp"))) double exp(double);
__attribute__((import_module("env"), import_name("log"))) double log(double);
__attribute__((import_module("env"), import_name("sin"))) double sin(double);
__attribute__((import_module("env"), import_name("cos"))) double cos(double);
__attribute__((import_module("env"), import_name("atan2"))) double atan2(double, double);
#define nan(x) __builtin_nan(x)
