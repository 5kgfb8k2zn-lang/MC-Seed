# Biome engine

The seed map computes biomes with [cubiomes](https://github.com/Cubitect/cubiomes) (MIT, commit `e61f905`, generator `MC_1_21_WD`).
`api.c` wraps it with two exports (`init`, `gen`) and a tiny bump allocator; `inc/` holds the minimal libc headers needed
for a freestanding wasm32 build. `core.js` is the worker-side logic (tile generation, nearest-biome search).

`./build.sh` produces `build/engine.html`. Replace the `<script id="engineSrc">` block (and the license comment above it)
in `index.html` with that file. The page tries WebAssembly first and falls back to the wasm2js build when WebAssembly
is blocked; both give identical results.
