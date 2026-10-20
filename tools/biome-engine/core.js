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
    } else if (m.type === "survey") {
      // Overworld overview around the origin at 1:16: biome mix within 2000 blocks,
      // nearest cell of every biome within 4096 blocks.
      ensure(m.lo, m.hi, 0);
      var S2 = 16, R2 = 4, counts = {}, total = 0, nearest = {};
      for (var sz = -R2; sz < R2; sz++) for (var sx = -R2; sx < R2; sx++) {
        var sids = tile(S2, sx * 64, sz * 64, surfaceY(S2, 0));
        for (var k = 0; k < 4096; k++) {
          var id = sids[k];
          var cx = (sx * 64 + (k & 63)) * S2 + S2 / 2, cz = (sz * 64 + (k >> 6)) * S2 + S2 / 2;
          var dd = Math.hypot(cx, cz);
          if (dd <= 2000) { counts[id] = (counts[id] || 0) + 1; total++; }
          if (dd <= 4096 && (!nearest[id] || dd < nearest[id].d)) nearest[id] = { x: cx, z: cz, d: dd };
        }
      }
      var oids = tile(4, -32, -32, surfaceY(4, 0));
      reply({ type: "survey", key: m.key, counts: counts, total: total, nearest: nearest, origin: oids[32 * 64 + 32] });
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
