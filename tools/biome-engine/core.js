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

  /* Bedrock structure placement.
   * Region-based structures seed MT19937 with the low 32 bits of
   * regX*341873128712 + regZ*132897987541 + worldSeed + salt and pick the chunk inside the
   * region with one (uniform) or two averaged (triangular) draws per axis. Trial Chambers use
   * Java's placement. Constants as documented by the community Bedrock finders (SeedFinder,
   * MCBE-seedcracker); the structure's own chunk-centre biome at the top of the world decides
   * whether (and which) structure generates. */
  var MTS = new Uint32Array(624);
  function mtOutputs(seed, n) {
    MTS[0] = seed >>> 0;
    for (var i = 1; i < n + 397; i++) { var p = MTS[i - 1] ^ (MTS[i - 1] >>> 30); MTS[i] = (Math.imul(1812433253, p) + i) >>> 0; }
    var out = [];
    for (var j = 0; j < n; j++) {
      var y = (MTS[j] & 0x80000000) | (MTS[j + 1] & 0x7fffffff);
      var v = MTS[j + 397] ^ (y >>> 1) ^ ((y & 1) ? 0x9908b0df : 0);
      v ^= v >>> 11; v ^= (v << 7) & 0x9d2c5680; v ^= (v << 15) & 0xefc60000; v ^= v >>> 18;
      out.push(v >>> 0);
    }
    return out;
  }
  var GROUPS = {
    village: { salt: 10387312, spacing: 34, range: 26, tri: true },
    temple:  { salt: 14357617, spacing: 32, range: 24, tri: false },
    portal:  { salt: 40552231, spacing: 40, range: 25, tri: false },
    trial:   { salt: 94251327, spacing: 34, range: 22, java: true }
  };
  var VILLAGE_BIOMES = { 1: 1, 2: 1, 5: 1, 12: 1, 30: 1, 35: 1, 129: 1, 177: 1 };
  function bedrockPos(lo, c, rx, rz) {
    var s = (Math.imul(rx, 2570712328 | 0) + Math.imul(rz, 4048968661 | 0) + lo + c.salt) >>> 0;
    var r = mtOutputs(s, c.tri ? 4 : 2), R = c.range;
    var ox = c.tri ? ((r[0] % R) + (r[1] % R)) >> 1 : r[0] % R;
    var oz = c.tri ? ((r[2] % R) + (r[3] % R)) >> 1 : r[1] % R;
    return { x: (rx * c.spacing + ox) * 16 + 8, z: (rz * c.spacing + oz) * 16 + 8 };
  }
  var M48 = (BigInt(1) << BigInt(48)) - BigInt(1), JMUL = BigInt("25214903917"), JADD = BigInt(11);
  function javaPos(seedBig, c, rx, rz) {
    var s = BigInt.asUintN(64, BigInt(rx) * BigInt("341873128712") + BigInt(rz) * BigInt("132897987541") + seedBig + BigInt(c.salt));
    var st = (s ^ JMUL) & M48;
    function next31() { st = (st * JMUL + JADD) & M48; return Number(st >> BigInt(17)); }
    function nextInt(n) {
      if ((n & -n) === n) return Number((BigInt(n) * BigInt(next31())) >> BigInt(31));
      var bits, val;
      do { bits = next31(); val = bits % n; } while (bits - val + (n - 1) > 0x7fffffff);
      return val;
    }
    var ox = nextInt(c.range), oz = nextInt(c.range);
    return { x: (rx * c.spacing + ox) * 16, z: (rz * c.spacing + oz) * 16 };
  }
  function cellBiome(x, z) {
    var p = E.gen(4, (x >> 4) * 4 + 2, (z >> 4) * 4 + 2, 1, 1, 79);
    return new Int32Array(E.memory.buffer, p, 1)[0];
  }
  function structureType(g, biome) {
    if (g === "village") return VILLAGE_BIOMES[biome] ? "village" : null;
    if (g === "temple") {
      if (biome === 2) return "desert";
      if (biome === 21 || biome === 168) return "jungle";
      if (biome === 6) return "swamp";
      if (biome === 12 || biome === 30 || biome === 179) return "igloo";
      return null;
    }
    return g;
  }
  function structureAt(seedBig, lo, g, rx, rz) {
    var c = GROUPS[g];
    var p = c.java ? javaPos(seedBig, c, rx, rz) : bedrockPos(lo, c, rx, rz);
    var b = cellBiome(p.x, p.z);
    return { g: g, rx: rx, rz: rz, x: p.x, z: p.z, biome: b, type: structureType(g, b) };
  }
  function nearestStructures(seedBig, lo, radius) {
    var best = {};
    for (var g in GROUPS) {
      var span = GROUPS[g].spacing * 16, n = Math.ceil(radius / span) + 1;
      for (var rz = -n; rz < n; rz++) for (var rx = -n; rx < n; rx++) {
        var s = structureAt(seedBig, lo, g, rx, rz);
        if (!s.type) continue;
        s.d = Math.hypot(s.x, s.z);
        if (s.d <= radius && (!best[s.type] || s.d < best[s.type].d)) best[s.type] = s;
      }
    }
    return best;
  }

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
      var origin = oids[32 * 64 + 32];
      var structs = nearestStructures(BigInt(m.key), m.lo, 3000);
      reply({ type: "survey", key: m.key, counts: counts, total: total, nearest: nearest, origin: origin, structs: structs });
    } else if (m.type === "structs") {
      ensure(m.lo, m.hi, 0);
      var seedBig = BigInt(m.key), res = [];
      for (var q = 0; q < m.list.length; q++) res.push(structureAt(seedBig, m.lo, m.list[q].g, m.list[q].rx, m.list[q].rz));
      reply({ type: "structs", key: m.key, results: res });
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
