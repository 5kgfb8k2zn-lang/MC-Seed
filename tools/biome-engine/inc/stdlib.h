#pragma once
#include <stddef.h>
void *malloc(size_t n);
void *calloc(size_t n, size_t s);
void *realloc(void *p, size_t n);
void free(void *p);
void exit(int c);
#define abs __builtin_abs
#define labs __builtin_labs
#define llabs __builtin_llabs
#define EXIT_FAILURE 1
#define EXIT_SUCCESS 0
