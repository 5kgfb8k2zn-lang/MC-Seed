#!/usr/bin/env bash
# Builds the biome engine block (engine.html) that is embedded in ../../index.html
# as <script id="engineSrc">. Needs clang (wasm32 target), wasm-ld, node and npm.
set -euo pipefail
cd "$(dirname "$0")"
[ -d cubiomes ] || git clone -q https://github.com/Cubitect/cubiomes.git
git -C cubiomes checkout -q e61f905
mkdir -p build && rm -f build/*.o
for f in api.c cubiomes/generator.c cubiomes/biomenoise.c cubiomes/noise.c cubiomes/layers.c cubiomes/biomes.c; do
  clang --target=wasm32 -O3 -nostdlib -ffreestanding -Iinc -DNDEBUG -c "$f" -o "build/$(basename "$f" .c).o"
done
wasm-ld --no-entry --allow-undefined -O3 -z stack-size=1048576 --export=init --export=gen -o build/cub.wasm build/*.o
[ -d build/node_modules/binaryen ] || npm install --prefix build --ignore-scripts --no-audit --no-fund binaryen@116.0.0 >/dev/null
node build/node_modules/binaryen/bin/wasm2js build/cub.wasm -O3 -o build/cub.js
python3 - <<'PY'
import base64
w = base64.b64encode(open('build/cub.wasm', 'rb').read()).decode()
js = open('build/cub.js').read().replace("import * as env from 'env';", "", 1)
js = "function createCubiomesJS(env) {\n" + js[:js.index("var retasmFunc = asmFunc(")] + "return asmFunc({ \"env\": env });\n}\n"
lic = open('cubiomes/LICENSE').read().replace('--', '- -')
out = ("<!-- Biome engine: cubiomes (https://github.com/Cubitect/cubiomes, commit e61f905), compiled to WebAssembly\n"
       "     plus a wasm2js fallback. Build sources: tools/biome-engine/.\n" + lic + "-->\n"
       "<script id=\"engineSrc\">\nvar CubEngine = (function () {\n  \"use strict\";\n  var WASM_B64 = \"" + w + "\";\n"
       + js + "\n" + open('core.js').read() + "})();\n</script>\n")
open('build/engine.html', 'w').write(out)
print("wrote build/engine.html", len(out), "bytes")
PY
