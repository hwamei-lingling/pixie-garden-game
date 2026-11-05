/* Phase 6 audit tests: the TWO tie rules checked separately, and Merge Sort's balanced splitting.
   Run from the project folder:  node tests/audit_ties_and_balance.test.js   (or all tests: node tests/run_all.js)

   Rule 1 (the sort): Merge Sort keeps INPUT order for rows its comparator calls equal.
   Rule 2 (the rankings): in seasonal rankings, equal metric values are broken by FIRST-HARVEST order.
   In the game the two agree, because the tracker hands the sort its rows already in first-harvest order. */
const assert = require("assert");
const path = require("path");
const S = require(path.join(__dirname, "..", "script.js"));
const { GardenGame, CROPS, mergeSortRankRows, rankSeasonCrops } = S;
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log("ok -", name); } catch (e) { console.log("FAIL -", name, "\n", e.stack.split("\n").slice(0, 4).join("\n")); process.exitCode = 1; } };
const ids = (rows) => rows.map((r) => r.id);

/* ---------- Rule 1: input order for equal comparator values ---------- */
test("rule 1: rows with no firstOrder and equal values keep their INPUT order (any input arrangement)", () => {
  let seed = 5; const rnd = (n) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  for (let t = 0; t < 300; t++) {
    const n = rnd(30), rows = Array.from({ length: n }, (_, i) => ({ id: `r${i}`, value: rnd(4), quantity: rnd(4) }));
    for (const metric of ["value", "quantity"]) {
      // expected: metric descending; equal metric -> original input index (a stable sort by definition)
      const want = rows.map((r, i) => ({ r, i })).sort((a, b) => b.r[metric] - a.r[metric] || a.i - b.i).map((x) => x.r.id);
      assert.deepStrictEqual(ids(mergeSortRankRows(rows, metric)), want, `${metric} n=${n}`);
    }
  }
});
test("rule 1: all-equal values: output order IS the input order, even when that order looks 'backwards'", () => {
  const rows = ["z", "m", "a", "q"].map((id) => ({ id, value: 7, quantity: 7 }));
  assert.deepStrictEqual(ids(mergeSortRankRows(rows)), ["z", "m", "a", "q"]);
  assert.deepStrictEqual(ids(mergeSortRankRows(rows.slice().reverse())), ["q", "a", "m", "z"]);
});
test("rule 1: rows that carry the SAME firstOrder are 'equal' too, so input order decides", () => {
  const rows = ["x", "y", "z"].map((id) => ({ id, value: 3, quantity: 3, firstOrder: 0 }));
  assert.deepStrictEqual(ids(mergeSortRankRows(rows)), ["x", "y", "z"]);
});

/* ---------- Rule 2: first-harvest order breaks ties in seasonal rankings ---------- */
const T0 = 1_800_000_000_000;
const newGame = () => { const g = new GardenGame(); g.clock = () => g._now; g._now = T0; g.player.coins = 999; return g; };
const grow = (g, cropId, r = 0, c = 0) => {
  const spot = { daisy: "meadow", tulip: "meadow", carrot: "roots", radish: "roots", tomato: "orchard", cabbage: "orchard" }[cropId];
  g.location = spot; g._syncPlot(); g.player.energy = g.player.maxEnergy; g.inventory.add(`${cropId}-seed`, 1);
  assert.ok(g.plantTile(r, c, cropId).ok && g.waterTile(r, c).ok); g._now += (CROPS[cropId].growMinutes + 1) * 60000; g.refreshGrowth(); g.player.energy = g.player.maxEnergy;
  assert.ok(g.harvestTile(r, c).ok);
};
test("rule 2 (value ties): daisy and tomato are both worth 12, tulip and cabbage both 20; whoever was harvested first ranks first", () => {
  // value per harvest: daisy 1x12=12, tomato 2x6=12, tulip 1x20=20, cabbage 2x10=20
  const a = newGame(); ["tomato", "daisy", "cabbage", "tulip"].forEach((c) => grow(a, c));
  assert.deepStrictEqual(rankSeasonCrops(a.tracker.current, "value").map((r) => r.cropId), ["cabbage", "tulip", "tomato", "daisy"]);
  const b = newGame(); ["daisy", "tomato", "tulip", "cabbage"].forEach((c) => grow(b, c));
  assert.deepStrictEqual(rankSeasonCrops(b.tracker.current, "value").map((r) => r.cropId), ["tulip", "cabbage", "daisy", "tomato"]);
});
test("rule 2 (quantity ties): equal quantities also follow first-harvest order, and repeat harvests do not change a crop's place", () => {
  // quantity per harvest: tomato 2, carrot 2, radish 2, daisy 1
  const g = newGame(); ["radish", "daisy", "tomato", "carrot"].forEach((c) => grow(g, c)); grow(g, "daisy", 1, 1);   // daisy now 2 too
  assert.deepStrictEqual(rankSeasonCrops(g.tracker.current, "quantity").map((r) => [r.cropId, r.quantity, r.firstOrder]), [["radish", 2, 0], ["daisy", 2, 1], ["tomato", 2, 2], ["carrot", 2, 3]]);
});
test("rule 2: first-harvest order is a property of each season (a crop can be first in one season and last in the next)", () => {
  const g = newGame(); grow(g, "tomato"); grow(g, "daisy");
  for (let i = 0; i < 7; i++) g.sleep();
  grow(g, "daisy"); grow(g, "tomato");
  assert.deepStrictEqual(rankSeasonCrops(g.tracker.findSeason(0)).map((r) => r.cropId), ["tomato", "daisy"]);
  assert.deepStrictEqual(rankSeasonCrops(g.tracker.current).map((r) => r.cropId), ["daisy", "tomato"]);
});
test("rule 2 beats input order: if rows arrive in a different order, firstOrder still decides the tie", () => {
  const rows = [{ id: "late", value: 5, quantity: 5, firstOrder: 2 }, { id: "early", value: 5, quantity: 5, firstOrder: 0 }, { id: "mid", value: 5, quantity: 5, firstOrder: 1 }];
  assert.deepStrictEqual(ids(mergeSortRankRows(rows)), ["early", "mid", "late"]);
});

/* ---------- Balanced splits: measured, not just claimed ---------- */
test("balanced splitting: comparison count stays within n * ceil(log2 n) on random, sorted and reversed lists of 1024", () => {
  const n = 1024, bound = 4 * n * Math.ceil(Math.log2(n));          // rankRowBeats reads a metric at most 4 times per comparison
  let seed = 3; const rnd = (k) => (seed = (seed * 1103515245 + 12345) % 2147483648) % k;
  const make = (valueOf) => { const counter = { reads: 0 }; const rows = Array.from({ length: n }, (_, i) => ({ id: i, firstOrder: i, get value() { counter.reads++; return valueOf(i); } })); return { rows, counter }; };
  for (const [label, f] of [["random", () => rnd(100000)], ["ascending", (i) => i], ["descending", (i) => n - i]]) {
    const { rows, counter } = make(f); const memo = rows.map((_, i) => f(i));   // fix random values once per row
    rows.forEach((r, i) => Object.defineProperty(r, "value", { get() { counter.reads++; return memo[i]; } }));
    const out = mergeSortRankRows(rows, "value");
    assert.strictEqual(out.length, n);
    assert.ok(counter.reads <= bound, `${label}: ${counter.reads} metric reads (limit ${bound}) - a lopsided split would need ~n^2`);
    for (let i = 1; i < n; i++) assert.ok(memo[out[i - 1].id] >= memo[out[i].id], `${label}: sorted`);
  }
});
test("the input list is never changed by the sort (copied records)", () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ id: `r${i}`, value: (i * 7) % 5, quantity: 1, firstOrder: i })); const before = JSON.stringify(rows);
  mergeSortRankRows(rows, "value"); assert.strictEqual(JSON.stringify(rows), before);
});

console.log(`\n${passed} tie-rule and balance tests passed`);
