#include "cubiomes/generator.h"
#include <stdint.h>
#include <stddef.h>

extern unsigned char __heap_base;
static size_t heap_top = 0;

void *malloc(size_t n) {
    if (!heap_top) heap_top = (size_t)&__heap_base;
    heap_top = (heap_top + 15) & ~(size_t)15;
    size_t p = heap_top;
    heap_top += n;
    size_t need = (heap_top + 65535) / 65536;
    size_t have = __builtin_wasm_memory_size(0);
    if (need > have) {
        if (__builtin_wasm_memory_grow(0, need - have) == (size_t)-1) __builtin_trap();
    }
    return (void *)p;
}
void *memset(void *d, int c, size_t n) { unsigned char *p = d; while (n--) *p++ = (unsigned char)c; return d; }
void *memcpy(void *d, const void *s, size_t n) { unsigned char *a = d; const unsigned char *b = s; while (n--) *a++ = *b++; return d; }
void *memmove(void *d, const void *s, size_t n) {
    unsigned char *a = d; const unsigned char *b = s;
    if (a < b) while (n--) *a++ = *b++; else { a += n; b += n; while (n--) *--a = *--b; }
    return d;
}
int memcmp(const void *x, const void *y, size_t n) { const unsigned char *a = x, *b = y; for (; n; n--, a++, b++) if (*a != *b) return *a - *b; return 0; }
size_t strlen(const char *s) { size_t n = 0; while (s[n]) n++; return n; }
int strcmp(const char *a, const char *b) { while (*a && *a == *b) a++, b++; return (unsigned char)*a - (unsigned char)*b; }
void *calloc(size_t n, size_t s) { void *p = malloc(n * s); memset(p, 0, n * s); return p; }
void free(void *p) { (void)p; }
void *realloc(void *p, size_t n) { void *q = malloc(n); if (p) memcpy(q, p, n); return q; }
void exit(int c) { (void)c; __builtin_trap(); }

static Generator g;
static size_t heap_after_setup;
#define MAXCELLS (256 * 256)
static int ids[MAXCELLS];

__attribute__((export_name("init")))
void init(uint32_t lo, uint32_t hi, int dim) {
    heap_top = 0;
    setupGenerator(&g, MC_1_21_WD, 0);
    applySeed(&g, dim, ((uint64_t)hi << 32) | lo);
    heap_after_setup = heap_top;
}

// Fills the id buffer with biomes for a w*h area at the given scale (1:scale).
__attribute__((export_name("gen")))
int *gen(int scale, int x, int z, int w, int h, int y) {
    if (w * h > MAXCELLS) return 0;
    size_t mark = heap_top;
    Range r = { scale, x, z, w, h, y, 1 };
    int *cache = allocCache(&g, r);
    int err = genBiomes(&g, cache, r);
    for (int i = 0; i < w * h; i++) ids[i] = err ? -1 : cache[i];
    heap_top = mark;
    return ids;
}
