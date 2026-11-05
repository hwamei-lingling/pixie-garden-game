/* Unit tests for PlantHashTable (separate chaining, 16 buckets, doubling at load factor 0.75).
   Run from the project folder:  node tests/plant_hash_table.test.js   (or all tests: node tests/run_all.js) */
const assert = require("assert");
const path = require("path");
const { PlantHashTable, PLOT_NAMES, GRID_SIZE } = require(path.join(__dirname, "..", "script.js"));
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log("ok -", name); } catch (e) { console.log("FAIL -", name, "\n", e.message); process.exitCode = 1; } };
const P = PLOT_NAMES;
const chainKeys = (t, i) => { const out = []; for (let n = t.buckets[i]; n; n = n.next) out.push(n.key); return out; };
const countNodes = (t) => { let c = 0; t.buckets.forEach((_, i) => { c += chainKeys(t, i).length; }); return c; };
const allTiles = () => { const a = []; P.forEach((p) => { for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) a.push([p, r, c]); }); return a; };
// find n tiles that share one bucket in a 16-bucket table
const collidingTiles = (n) => {
  const probe = new PlantHashTable(), groups = {};
  for (const [p, r, c] of allTiles()) { const i = probe.bucketIndexOf(p, r, c); (groups[i] = groups[i] || []).push([p, r, c]); }
  const g = Object.values(groups).find((x) => x.length >= n); assert.ok(g, "need a bucket with enough tiles");
  return g.slice(0, n);
};
const invariant = (t) => {
  assert.strictEqual(countNodes(t), t.size, "node count equals size");
  assert.ok(t.loadFactor <= 0.75 + 1e-12, "load factor within limit");
  t.buckets.forEach((_, i) => chainKeys(t, i).forEach((k) => assert.strictEqual(PlantHashTable.hash(k) % t.capacity, i, "entry sits in its own bucket")));
};

test("new table: 16 buckets, empty, load factor 0", () => {
  const t = new PlantHashTable(); assert.strictEqual(t.capacity, 16); assert.strictEqual(t.size, 0); assert.strictEqual(t.loadFactor, 0);
  assert.ok(t.buckets.every((b) => b === null));
});
test("hash is djb2, deterministic and unsigned 32-bit", () => {
  assert.strictEqual(PlantHashTable.hash(""), 5381); assert.strictEqual(PlantHashTable.hash("a"), 5381 * 33 + 97);
  assert.strictEqual(PlantHashTable.hash("Flowers|3|7"), PlantHashTable.hash("Flowers|3|7"));
  const h = PlantHashTable.hash("Vegetables/Fruits|9|9|a-long-key-to-overflow-32-bits"); assert.ok(Number.isInteger(h) && h >= 0 && h < 2 ** 32);
});
test("keys identify plot, row and column", () => {
  assert.strictEqual(PlantHashTable.keyOf("Flowers", 3, 7), "Flowers|3|7");
  const t = new PlantHashTable(); t.put("Flowers", 1, 2, "daisy"); t.put("Root Crops", 1, 2, "carrot"); t.put("Flowers", 2, 1, "tulip");
  assert.strictEqual(t.size, 3); assert.strictEqual(t.get("Flowers", 1, 2).cropId, "daisy"); assert.strictEqual(t.get("Root Crops", 1, 2).cropId, "carrot"); assert.strictEqual(t.get("Flowers", 2, 1).cropId, "tulip");
});
test("put/get/has return small records {cropId, plot, row, col}", () => {
  const t = new PlantHashTable(); assert.strictEqual(t.put("Flowers", 4, 5, "rose"), true);
  assert.deepStrictEqual(t.get("Flowers", 4, 5), { cropId: "rose", plot: "Flowers", row: 4, col: 5 });
  assert.strictEqual(t.has("Flowers", 4, 5), true); assert.strictEqual(t.size, 1);
});
test("get returns a copy: changing it does not change the table", () => {
  const t = new PlantHashTable(); t.put("Flowers", 0, 0, "daisy"); const r = t.get("Flowers", 0, 0); r.cropId = "HACKED"; assert.strictEqual(t.get("Flowers", 0, 0).cropId, "daisy");
});
test("missing keys: get null, has false, remove false, size unchanged", () => {
  const t = new PlantHashTable(); t.put("Flowers", 0, 0, "daisy");
  assert.strictEqual(t.get("Flowers", 9, 9), null); assert.strictEqual(t.has("Flowers", 9, 9), false); assert.strictEqual(t.remove("Flowers", 9, 9), false);
  assert.strictEqual(t.get("Root Crops", 0, 0), null); assert.strictEqual(t.size, 1);
  assert.strictEqual(new PlantHashTable().get("Flowers", 0, 0), null);   // empty table
});
test("invalid arguments are rejected without changing the table", () => {
  const t = new PlantHashTable();
  [["Flowers", -1, 0, "daisy"], ["Flowers", 0, 10, "daisy"], ["Flowers", 1.5, 0, "daisy"], ["Flowers", "1", 0, "daisy"], ["", 0, 0, "daisy"], [null, 0, 0, "daisy"], ["Flowers", 0, 0, ""], ["Flowers", 0, 0, null], ["Flowers", 0, 0, 5]]
    .forEach((a) => assert.strictEqual(t.put(...a), false, JSON.stringify(a)));
  assert.strictEqual(t.size, 0); assert.strictEqual(t.get("Flowers", -1, 0), null); assert.strictEqual(t.has("Flowers", 0, 10), false); assert.strictEqual(t.remove("Flowers", 1.5, 0), false);
});
test("different keys forced into the same bucket form one chain and are all retrievable", () => {
  const tiles = collidingTiles(5), t = new PlantHashTable();
  tiles.forEach(([p, r, c], i) => t.put(p, r, c, `crop${i}`));
  const idx = t.bucketIndexOf(...tiles[0]); assert.ok(tiles.every((x) => t.bucketIndexOf(...x) === idx), "all collide");
  assert.strictEqual(chainKeys(t, idx).length, 5, "one chain of 5"); assert.strictEqual(t.size, 5); assert.strictEqual(t.capacity, 16);
  tiles.forEach(([p, r, c], i) => assert.strictEqual(t.get(p, r, c).cropId, `crop${i}`)); invariant(t);
});
test("updating a colliding entry changes only that entry; size and chain length stay the same", () => {
  const tiles = collidingTiles(5), t = new PlantHashTable(); tiles.forEach(([p, r, c], i) => t.put(p, r, c, `crop${i}`));
  const idx = t.bucketIndexOf(...tiles[0]), before = chainKeys(t, idx).join();
  for (const i of [0, 2, 4]) { const [p, r, c] = tiles[i]; assert.strictEqual(t.put(p, r, c, `new${i}`), true); }
  assert.strictEqual(t.size, 5); assert.strictEqual(chainKeys(t, idx).join(), before, "chain unchanged in shape");
  tiles.forEach(([p, r, c], i) => assert.strictEqual(t.get(p, r, c).cropId, [0, 2, 4].includes(i) ? `new${i}` : `crop${i}`));
});
test("removing head, middle and tail of a chain keeps the others", () => {
  for (const which of [0, 2, 4]) {
    const tiles = collidingTiles(5), t = new PlantHashTable(); tiles.forEach(([p, r, c], i) => t.put(p, r, c, `crop${i}`));
    const idx = t.bucketIndexOf(...tiles[0]), order = chainKeys(t, idx);                    // chain order: newest first
    const key = order[which], target = tiles.find(([p, r, c]) => PlantHashTable.keyOf(p, r, c) === key);
    assert.strictEqual(t.remove(...target), true); assert.strictEqual(t.size, 4); assert.strictEqual(t.has(...target), false); assert.strictEqual(t.get(...target), null);
    assert.deepStrictEqual(chainKeys(t, idx), order.filter((k) => k !== key), "others stay in order");
    tiles.filter((x) => x !== target).forEach(([p, r, c]) => assert.ok(t.has(p, r, c))); assert.strictEqual(t.remove(...target), false, "second remove is a miss"); invariant(t);
  }
});
test("removing the only entry of a bucket empties the bucket", () => {
  const t = new PlantHashTable(); t.put("Flowers", 0, 0, "daisy"); const i = t.bucketIndexOf("Flowers", 0, 0); assert.ok(t.remove("Flowers", 0, 0)); assert.strictEqual(t.buckets[i], null); assert.strictEqual(t.size, 0);
});
test("12 entries fit in 16 buckets (load 0.75); the 13th doubles to 32", () => {
  const t = new PlantHashTable(), tiles = allTiles();
  for (let i = 0; i < 12; i++) t.put(...tiles[i], "daisy".slice(0)); assert.strictEqual(t.capacity, 16); assert.strictEqual(t.loadFactor, 0.75);
  t.put(...tiles[12], "tulip"); assert.strictEqual(t.capacity, 32); assert.strictEqual(t.size, 13); assert.ok(Math.abs(t.loadFactor - 13 / 32) < 1e-12);
  for (let i = 0; i < 13; i++) assert.ok(t.has(...tiles[i])); invariant(t);
});
test("updating an existing key at the limit does not resize or change size", () => {
  const t = new PlantHashTable(), tiles = allTiles(); for (let i = 0; i < 12; i++) t.put(...tiles[i], "daisy");
  const arr = t.buckets; for (let i = 0; i < 12; i++) assert.strictEqual(t.put(...tiles[i], "rose"), true);
  assert.strictEqual(t.capacity, 16); assert.strictEqual(t.size, 12); assert.strictEqual(t.buckets, arr, "same bucket array: no rehash happened"); assert.strictEqual(t.get(...tiles[3]).cropId, "rose");
});
test("rehash preserves every entry and the size; load factor stays <= 0.75 after every insert (all 300 tiles)", () => {
  const t = new PlantHashTable(), tiles = allTiles(), seen = [16];
  tiles.forEach(([p, r, c], i) => { t.put(p, r, c, `crop${i}`); assert.ok(t.loadFactor <= 0.75 + 1e-12, `load after insert ${i + 1}`); if (t.capacity !== seen[seen.length - 1]) seen.push(t.capacity); });
  assert.deepStrictEqual(seen, [16, 32, 64, 128, 256, 512]); assert.strictEqual(t.size, 300);
  tiles.forEach(([p, r, c], i) => assert.deepStrictEqual(t.get(p, r, c), { cropId: `crop${i}`, plot: p, row: r, col: c })); invariant(t);
});
test("manual rehash(): default doubles, explicit size works, entries and size preserved", () => {
  const t = new PlantHashTable(), tiles = allTiles().slice(0, 40); tiles.forEach(([p, r, c], i) => t.put(p, r, c, `c${i}`));
  const cap = t.capacity, size = t.size; assert.strictEqual(t.rehash(), true); assert.strictEqual(t.capacity, cap * 2); assert.strictEqual(t.size, size); invariant(t);
  assert.strictEqual(t.rehash(200), true); assert.strictEqual(t.capacity, 200); tiles.forEach(([p, r, c], i) => assert.strictEqual(t.get(p, r, c).cropId, `c${i}`)); invariant(t);
});
test("rehash rejects capacities that break the limit or are not whole numbers (nothing changes)", () => {
  const t = new PlantHashTable(), tiles = allTiles().slice(0, 12); tiles.forEach(([p, r, c]) => t.put(p, r, c, "daisy")); const arr = t.buckets;
  [8, 15, 0, -4, 1.5, NaN, "32", Infinity].forEach((n) => { assert.strictEqual(t.rehash(n), false, String(n)); assert.strictEqual(t.buckets, arr); assert.strictEqual(t.capacity, 16); });
  assert.strictEqual(t.size, 12); tiles.forEach((x) => assert.ok(t.has(...x)));
});
test("rehash redistributes colliding entries correctly", () => {
  const tiles = collidingTiles(5), t = new PlantHashTable(); tiles.forEach(([p, r, c], i) => t.put(p, r, c, `crop${i}`));
  t.rehash(64); tiles.forEach(([p, r, c], i) => assert.strictEqual(t.get(p, r, c).cropId, `crop${i}`)); invariant(t);
});
test("resizing is not recursive: put and rehash never call put() while rebuilding", () => {
  const t = new PlantHashTable(), tiles = allTiles(), realPut = t.put.bind(t); let puts = 0, depth = 0, maxDepth = 0;
  t.put = (...a) => { puts++; depth++; maxDepth = Math.max(maxDepth, depth); try { return realPut(...a); } finally { depth--; } };
  for (let i = 0; i < 13; i++) t.put(...tiles[i], "daisy");       // the 13th insert triggers a rehash
  assert.strictEqual(puts, 13, "exactly one put call per insert"); assert.strictEqual(maxDepth, 1);
  t.rehash(); assert.strictEqual(puts, 13, "rehash() made no put calls");
});
test("never shrinks automatically: removing everything keeps the grown capacity", () => {
  const t = new PlantHashTable(), tiles = allTiles(); tiles.forEach((x) => t.put(...x, "daisy")); assert.strictEqual(t.capacity, 512);
  tiles.forEach((x) => assert.strictEqual(t.remove(...x), true)); assert.strictEqual(t.size, 0); assert.strictEqual(t.capacity, 512); assert.strictEqual(t.loadFactor, 0); assert.strictEqual(countNodes(t), 0);
});
test("clear() resets to a fresh 16-bucket table and the table works afterwards", () => {
  const t = new PlantHashTable(), tiles = allTiles(); tiles.forEach((x) => t.put(...x, "daisy")); assert.ok(t.capacity > 16);
  t.clear(); assert.strictEqual(t.size, 0); assert.strictEqual(t.capacity, 16); assert.strictEqual(t.loadFactor, 0); assert.ok(t.buckets.every((b) => b === null));
  tiles.forEach((x) => { assert.strictEqual(t.has(...x), false); assert.strictEqual(t.get(...x), null); }); t.clear(); assert.strictEqual(t.size, 0);   // clearing an empty table is fine
  t.put("Flowers", 0, 0, "daisy"); assert.strictEqual(t.size, 1); assert.strictEqual(t.get("Flowers", 0, 0).cropId, "daisy"); invariant(t);
});
test("randomised check against a reference Map (6000 operations, seeded)", () => {
  let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const t = new PlantHashTable(), ref = new Map(), tiles = allTiles();
  for (let n = 0; n < 6000; n++) {
    const [p, r, c] = tiles[Math.floor(rnd() * tiles.length)], k = PlantHashTable.keyOf(p, r, c), op = rnd();
    if (op < 0.55) { const crop = `crop${n % 12}`; t.put(p, r, c, crop); ref.set(k, crop); }
    else if (op < 0.85) { assert.strictEqual(t.remove(p, r, c), ref.delete(k)); }
    else { const got = t.get(p, r, c); assert.strictEqual(got ? got.cropId : null, ref.has(k) ? ref.get(k) : null); assert.strictEqual(t.has(p, r, c), ref.has(k)); }
    assert.strictEqual(t.size, ref.size);
  }
  invariant(t); tiles.forEach(([p, r, c]) => { const k = PlantHashTable.keyOf(p, r, c); assert.strictEqual(t.has(p, r, c), ref.has(k)); });
});
test("only plots named in PLOT_NAMES are accepted", () => {
  const t = new PlantHashTable(); assert.strictEqual(t.put("Weeds", 0, 0, "daisy"), false); assert.strictEqual(t.size, 0);
  assert.strictEqual(t.get("Weeds", 0, 0), null); assert.strictEqual(t.has("Weeds", 0, 0), false); assert.strictEqual(t.remove("Weeds", 0, 0), false);
  PLOT_NAMES.forEach((p) => assert.strictEqual(t.put(p, GRID_SIZE - 1, GRID_SIZE - 1, "daisy"), true));
  assert.strictEqual(t.put("Flowers", GRID_SIZE, 0, "daisy"), false, "coordinates come from GRID_SIZE");
});
test("stats(): plain numbers, collision buckets counted from the real chains", () => {
  const t = new PlantHashTable(); let s = t.stats();
  assert.deepStrictEqual(s, { size: 0, capacity: 16, loadFactor: 0, occupiedBuckets: 0, collisionBuckets: 0, longestChain: 0 });
  const tiles = collidingTiles(4); tiles.forEach(([p, r, c]) => t.put(p, r, c, "daisy")); s = t.stats();
  assert.strictEqual(s.size, 4); assert.strictEqual(s.occupiedBuckets, 1); assert.strictEqual(s.collisionBuckets, 1); assert.strictEqual(s.longestChain, 4); assert.strictEqual(s.loadFactor, 4 / 16);
  s.size = 999; s.capacity = 1; assert.strictEqual(t.size, 4); assert.strictEqual(t.capacity, 16);   // stats is a copy
  const big = new PlantHashTable(); allTiles().forEach((x) => big.put(...x, "daisy")); const bs = big.stats();
  let multi = 0, occ = 0; big.buckets.forEach((_, i) => { const n = chainKeys(big, i).length; if (n > 0) occ++; if (n > 1) multi++; });
  assert.strictEqual(bs.collisionBuckets, multi); assert.strictEqual(bs.occupiedBuckets, occ); assert.strictEqual(bs.size, 300); assert.strictEqual(bs.capacity, 512);
});
console.log(`\n${passed} hash table tests passed`);
