  var E = null, kind = "", cur = "";
  function b64bytes(s) {
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function boot() {
    var env = { pow: Math.pow };
    try {
      var res = await WebAssembly.instantiate(b64bytes(WASM_B64), { env: env });
      E = res.instance.exports; kind = "wasm";
    } catch (err) {
      E = createCubiomesJS(env); kind = "js";
    }
    return kind;
  }
  function ensure(lo, hi, dim) {
    var k = lo + ":" + hi + ":" + dim;
    if (k !== cur) { E.init(lo | 0, hi | 0, dim | 0); cur = k; }
  }
  // 64x64 biome ids at 1:scale, top-left cell (x, z) in scaled units.
  function tile(scale, x, z, y) {
    var p = E.gen(scale, x, z, 64, 64, y);
    var a = new Int32Array(E.memory.buffer, p, 4096), out = new Uint8Array(4096);
    for (var i = 0; i < 4096; i++) out[i] = a[i] < 0 || a[i] > 254 ? 255 : a[i];
    return out;
  }
  function surfaceY(scale, dim) { return dim === 0 ? Math.max(1, 256 / scale | 0) : 0; }

  function handle(m, reply) {
    if (m.type === "tile") {
      ensure(m.lo, m.hi, m.dim);
      var ids = tile(m.scale, m.tx * 64, m.tz * 64, surfaceY(m.scale, m.dim));
      reply({ type: "tile", key: m.key, ids: ids }, [ids.buffer]);
    } else if (m.type === "find") {
      ensure(m.lo, m.hi, m.dim);
      var S = 64, T = 64 * S, R = 6;
      var ctx = Math.floor(m.x / T), ctz = Math.floor(m.z / T);
      var best = null, foundRing = -1;
      for (var r = 0; r <= R; r++) {
        for (var dx = -r; dx <= r; dx++) for (var dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          var tx = ctx + dx, tz = ctz + dz;
          var ids = tile(S, tx * 64, tz * 64, surfaceY(S, m.dim));
          for (var i = 0; i < 4096; i++) {
            if (ids[i] !== m.biome) continue;
            var bx = (tx * 64 + (i & 63)) * S + S / 2, bz = (tz * 64 + (i >> 6)) * S + S / 2;
            var d = Math.hypot(bx - m.x, bz - m.z);
            if (!best || d < best.d) best = { x: bx, z: bz, d: d };
          }
        }
        reply({ type: "findProgress", token: m.token, ring: r, rings: R });
        if (best && foundRing < 0) foundRing = r;
        if (foundRing >= 0 && r >= foundRing + 1) break;
      }
      reply({ type: "found", token: m.token, result: best, radius: (R + 0.5) * T });
    }
  }
  return { boot: boot, handle: handle };
