/* Tests for Phase 5: Merge Sort + per-season crop rankings (display only).
   Run from the project folder:  node tests/season_rankings.test.js   (or all tests: node tests/run_all.js) */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const S = require(path.join(__dirname, "..", "script.js"));
const { GardenGame, SeasonHarvestTracker: Tracker, CROPS, RANK_METRICS, mergeSortRankRows, rankSeasonCrops } = S;
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log("ok -", name); } catch (e) { console.log("FAIL -", name, "\n", e.stack.split("\n").slice(0, 4).join("\n")); process.exitCode = 1; } };

const T0 = 1_800_000_000_000;
const newGame = () => { const g = new GardenGame(); g.clock = () => g._now; g._now = T0; g.player.coins = 999; return g; };
const refill = (g) => { g.player.energy = g.player.maxEnergy; };
const advance = (g, m) => { g._now += m * 60000; g.refreshGrowth(); };
const clone = (x) => JSON.parse(JSON.stringify(x));
const grow = (g, cropId, r = 0, c = 0) => {
  const spot = { daisy: "meadow", tulip: "meadow", carrot: "roots", radish: "roots", tomato: "orchard", cabbage: "orchard" }[cropId];
  g.location = spot; g._syncPlot(); refill(g); g.inventory.add(`${cropId}-seed`, 1);
  assert.ok(g.plantTile(r, c, cropId).ok); assert.ok(g.waterTile(r, c).ok); advance(g, CROPS[cropId].growMinutes + 1); refill(g);
  return g.harvestTile(r, c);
};
const sleepDays = (g, n) => { for (let i = 0; i < n; i++) g.sleep(); };
const ids = (rows) => rows.map((r) => r.cropId);
const row = (cropId, quantity, value, firstOrder) => ({ cropId, name: cropId, quantity, value, firstOrder });
/** Independent reference (test only, uses native sort): metric descending, then first-harvest order. */
const reference = (rows, metric) => rows.slice().sort((a, b) => b[metric] - a[metric] || a.firstOrder - b.firstOrder).map((r) => r.cropId);

/* ---------- the sort itself ---------- */
test("empty and single-item lists", () => {
  for (const m of ["value", "quantity"]) { assert.deepStrictEqual(mergeSortRankRows([], m), []); assert.deepStrictEqual(ids(mergeSortRankRows([row("a", 1, 1, 0)], m)), ["a"]); }
  assert.deepStrictEqual(rankSeasonCrops({ serial: 0, partial: false, crops: [] }), []);
  assert.deepStrictEqual(rankSeasonCrops({ serial: 0, partial: false, crops: [{ cropId: "daisy", quantity: 1, value: 12 }] }), [{ rank: 1, cropId: "daisy", name: "Daisy", quantity: 1, value: 12, firstOrder: 0 }]);
});
test("value metric, highest first (the default)", () => {
  const rows = [row("a", 5, 10, 0), row("b", 1, 70, 1), row("c", 3, 30, 2), row("d", 9, 5, 3)];
  assert.deepStrictEqual(ids(mergeSortRankRows(rows)), ["b", "c", "a", "d"]);
  assert.deepStrictEqual(ids(mergeSortRankRows(rows, "value")), ["b", "c", "a", "d"]);
});
test("quantity metric, highest first", () => {
  const rows = [row("a", 5, 10, 0), row("b", 1, 70, 1), row("c", 3, 30, 2), row("d", 9, 5, 3)];
  assert.deepStrictEqual(ids(mergeSortRankRows(rows, "quantity")), ["d", "a", "c", "b"]);
});
test("ties keep first-harvest order (value and quantity), however the input is arranged", () => {
  const rows = [row("a", 2, 20, 0), row("b", 2, 20, 1), row("c", 2, 20, 2), row("d", 5, 20, 3), row("e", 2, 50, 4)];
  assert.deepStrictEqual(ids(mergeSortRankRows(rows, "value")), ["e", "a", "b", "c", "d"]);
  assert.deepStrictEqual(ids(mergeSortRankRows(rows, "quantity")), ["d", "a", "b", "c", "e"]);
  assert.deepStrictEqual(ids(mergeSortRankRows(rows.slice().reverse(), "value")), ["e", "a", "b", "c", "d"], "reversed input: same answer");
});
test("already-sorted, reversed and equal-everywhere inputs", () => {
  const sorted = Array.from({ length: 12 }, (_, i) => row(`c${i}`, 12 - i, (12 - i) * 3, i));          // already best-first
  assert.deepStrictEqual(ids(mergeSortRankRows(sorted)), ids(sorted));
  assert.deepStrictEqual(ids(mergeSortRankRows(sorted.slice().reverse())), ids(sorted));
  const same = Array.from({ length: 9 }, (_, i) => row(`s${i}`, 4, 8, i));
  assert.deepStrictEqual(ids(mergeSortRankRows(same)), ids(same), "all equal: nothing moves");
});
test("matches an independent reference on many random lists (all sizes 0-40, both metrics, lots of ties)", () => {
  let seed = 99; const rnd = (n) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  for (let t = 0; t < 400; t++) {
    const n = rnd(41), rows = Array.from({ length: n }, (_, i) => row(`c${i}`, rnd(6), rnd(6) * 5, i));
    for (const m of ["value", "quantity"]) assert.deepStrictEqual(ids(mergeSortRankRows(rows, m)), reference(rows, m), `${m} n=${n}`);
    const shuffled = rows.slice(); for (let i = shuffled.length - 1; i > 0; i--) { const j = rnd(i + 1); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
    for (const m of ["value", "quantity"]) assert.deepStrictEqual(ids(mergeSortRankRows(shuffled, m)), reference(rows, m), `shuffled ${m}`);
  }
});
test("sorts a copy: the input list and its rows are not reordered or changed", () => {
  const rows = [row("a", 1, 1, 0), row("b", 9, 9, 1), row("c", 5, 5, 2)]; const before = JSON.stringify(rows), first = rows[0];
  const out = mergeSortRankRows(rows, "value"); assert.notStrictEqual(out, rows); assert.strictEqual(JSON.stringify(rows), before); assert.strictEqual(rows[0], first);
});
test("unknown metric is rejected", () => { assert.throws(() => mergeSortRankRows([], "weight"), /Unknown ranking metric/); assert.deepStrictEqual(Object.keys(RANK_METRICS), ["value", "quantity"]); });
test("Merge Sort is hand-written: no sort()/toSorted()/shift() in the ranking code", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
  const code = src.slice(src.indexOf("6e. SEASON RANKINGS"), src.indexOf("7. WORLD GRAPH")).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(!/\.sort\s*\(|toSorted\s*\(|\.shift\s*\(/.test(code));
  assert.ok(/\.slice\(\)/.test(code), "works on a copy");
});

/* ---------- rankings from the tracker ---------- */
test("rankSeasonCrops reads one season record, numbers ranks 1..n, uses stored values, and never changes the tracker", () => {
  const g = newGame(); grow(g, "carrot"); grow(g, "daisy"); grow(g, "daisy", 1, 1); grow(g, "tomato");   // carrot 2/10, daisy 2/24, tomato 2/12
  const before = JSON.stringify(g.tracker.toJSON());
  const byValue = rankSeasonCrops(g.tracker.current, "value");
  assert.deepStrictEqual(byValue.map((r) => [r.rank, r.cropId, r.quantity, r.value, r.firstOrder]), [[1, "daisy", 2, 24, 1], [2, "tomato", 2, 12, 2], [3, "carrot", 2, 10, 0]]);
  const byQty = rankSeasonCrops(g.tracker.current, "quantity");   // all quantity 2 -> first-harvest order
  assert.deepStrictEqual(byQty.map((r) => r.cropId), ["carrot", "daisy", "tomato"]);
  byValue[0].value = 9999; byValue.reverse();                       // fiddling with the display rows...
  assert.strictEqual(JSON.stringify(g.tracker.toJSON()), before, "...cannot touch the tracker");
});
test("ranking is per season: each season ranks only its own crops", () => {
  const g = newGame(); grow(g, "daisy"); sleepDays(g, 7); grow(g, "carrot"); grow(g, "carrot", 1, 1); sleepDays(g, 7); grow(g, "tomato");
  const t = g.tracker; assert.deepStrictEqual(ids(rankSeasonCrops(t.findSeason(0))), ["daisy"]);
  assert.deepStrictEqual(ids(rankSeasonCrops(t.findSeason(1))), ["carrot"]); assert.strictEqual(rankSeasonCrops(t.findSeason(1))[0].quantity, 4);
  assert.deepStrictEqual(ids(rankSeasonCrops(t.current)), ["tomato"]);
  assert.strictEqual(t.findSeason(7), null);
});
test("season choices: current first, then completed newest to oldest, with occurrence labels and partial flags", () => {
  const g = newGame(); sleepDays(g, 7 * 4 + 2);       // Spring Cycle 2, day 3
  const c = g.tracker.seasonChoices();
  assert.deepStrictEqual(c.map((x) => [x.key, x.label, x.status, x.id, x.partial]), [
    ["current", "Spring — Cycle 2", "current", "season-5", false],
    ["3", "Winter — Cycle 1", "completed", "season-4", false], ["2", "Autumn — Cycle 1", "completed", "season-3", false],
    ["1", "Summer — Cycle 1", "completed", "season-2", false], ["0", "Spring — Cycle 1", "completed", "season-1", false]]);
  c[0].label = "tampered"; assert.strictEqual(g.tracker.seasonChoices()[0].label, "Spring — Cycle 2", "choices are copies");
});
test("partial tracking shows in the choices (old save) and stays on the archived record; the next season is not partial", () => {
  const g = newGame(); sleepDays(g, 2); const old = clone(g.toJSON()); delete old.harvests; const h = newGame(); h.loadJSON(old);
  assert.strictEqual(h.tracker.seasonChoices()[0].partial, true);
  sleepDays(h, 5); const c = h.tracker.seasonChoices();
  assert.deepStrictEqual(c.map((x) => [x.label, x.partial]), [["Summer — Cycle 1", false], ["Spring — Cycle 1", true]]);
});
test("historical values: a later price change does not change any ranking", () => {
  const old = CROPS.daisy.sellPrice, g = newGame();
  try {
    grow(g, "daisy"); grow(g, "carrot");                                                 // daisy 12, carrot 10 (2 x 5)
    assert.deepStrictEqual(ids(rankSeasonCrops(g.tracker.current)), ["daisy", "carrot"]);
    CROPS.daisy.sellPrice = 1; CROPS.carrot.sellPrice = 500;
    assert.deepStrictEqual(rankSeasonCrops(g.tracker.current).map((r) => r.value), [12, 10], "stored values, not today's prices");
    sleepDays(g, 7); assert.deepStrictEqual(rankSeasonCrops(g.tracker.findSeason(0)).map((r) => [r.cropId, r.value]), [["daisy", 12], ["carrot", 10]]);
    const h = newGame(); h.loadJSON(clone(g.toJSON())); assert.deepStrictEqual(rankSeasonCrops(h.tracker.findSeason(0)).map((r) => r.value), [12, 10]);
  } finally { CROPS.daisy.sellPrice = old; CROPS.carrot.sellPrice = 5; }
});
test("live updates: rankings follow harvest, undo, season change and loading", () => {
  const g = newGame(); const view = () => rankSeasonCrops(g.tracker.current).map((r) => [r.cropId, r.value]);
  assert.deepStrictEqual(view(), []);
  grow(g, "daisy"); assert.deepStrictEqual(view(), [["daisy", 12]]);
  grow(g, "tomato"); grow(g, "tomato", 1, 1); assert.deepStrictEqual(view(), [["tomato", 24], ["daisy", 12]]);
  g.undo(); assert.deepStrictEqual(view(), [["daisy", 12], ["tomato", 12]], "tie 12/12: daisy was harvested first, so it ranks first");
  const save = clone(g.toJSON()); sleepDays(g, 7); assert.deepStrictEqual(view(), [], "new season starts empty");
  assert.deepStrictEqual(rankSeasonCrops(g.tracker.findSeason(0)).map((r) => r.cropId), ["daisy", "tomato"]);
  g.loadJSON(save); assert.deepStrictEqual(view().map((x) => x[0]), ["daisy", "tomato"], "loading an earlier save shows that save's season");
});
test("sorting never changes saves, inventory or hash index", () => {
  const g = newGame(); grow(g, "daisy"); grow(g, "carrot"); const save = JSON.stringify(g.toJSON()), inv = JSON.stringify(g.inventory.slots);
  for (const m of ["value", "quantity"]) { rankSeasonCrops(g.tracker.current, m); g.tracker.seasonChoices(); }
  assert.strictEqual(JSON.stringify(g.toJSON()), save); assert.strictEqual(JSON.stringify(g.inventory.slots), inv); assert.strictEqual(g.grid.indexMatchesGrid(), true);
  assert.ok(!/rank/i.test(save), "no ranking data in saves");
});

console.log(`\n${passed} season-ranking tests passed`);
