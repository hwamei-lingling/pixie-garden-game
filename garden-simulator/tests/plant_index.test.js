/* Integration tests: the plant index inside GardenGrid stays in step with the 2D arrays.
   Run from the project folder:  node tests/plant_index.test.js   (or all tests: node tests/run_all.js) */
const assert = require("assert");
const path = require("path");
const { GardenGame, GardenGrid, PlantHashTable, PLOT_NAMES, GRID_SIZE, CROPS, STAGE, ITEMS } = require(path.join(__dirname, "..", "script.js"));
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log("ok -", name); } catch (e) { console.log("FAIL -", name, "\n", e.stack.split("\n").slice(0, 4).join("\n")); process.exitCode = 1; } };

const T0 = 1_800_000_000_000;
const newGame = () => { const g = new GardenGame(); g.clock = () => g._now; g._now = T0; g.player.coins = 999; return g; };
const advance = (g, minutes) => { g._now += minutes * 60000; g.refreshGrowth(); };
const refill = (g) => { g.player.energy = g.player.maxEnergy; };
// Independent check: scan the arrays ourselves and compare with the index through its public API only.
const occupied = (grid) => { const a = []; for (const p of PLOT_NAMES) for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) if (grid.stages[p][r][c] !== STAGE.EMPTY) a.push({ cropId: grid.plantIds[p][r][c], plot: p, row: r, col: c }); return a; };
const assertSynced = (grid, label = "") => {
  const occ = occupied(grid);
  assert.strictEqual(grid.plantIndex.size, occ.length, `${label} size equals occupied tiles`);
  for (const p of PLOT_NAMES) for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const want = occ.find((o) => o.plot === p && o.row === r && o.col === c) || null;
    assert.deepStrictEqual(grid.plantIndex.get(p, r, c), want, `${label} ${p} [${r},${c}]`);
  }
  assert.strictEqual(grid.indexMatchesGrid(), true, `${label} indexMatchesGrid()`);
};
const seedFor = { Flowers: "daisy", "Root Crops": "carrot", "Vegetables/Fruits": "tomato" };

test("new game: the index starts empty, with 16 buckets, and matches the empty grid", () => {
  const g = newGame(); assert.strictEqual(g.grid.plantIndex.size, 0); assert.strictEqual(g.grid.plantIndex.capacity, 16); assertSynced(g.grid, "new");
  assert.ok(g.grid.plantIndex instanceof PlantHashTable);
});
test("successful planting adds exactly one {cropId, plot, row, col} entry", () => {
  const g = newGame(); assert.strictEqual(g.plantTile(2, 3, "daisy").ok, true);
  assert.deepStrictEqual(g.grid.plantIndex.get("Flowers", 2, 3), { cropId: "daisy", plot: "Flowers", row: 2, col: 3 }); assert.strictEqual(g.grid.plantIndex.size, 1); assertSynced(g.grid, "plant");
});
test("failed planting leaves the index untouched", () => {
  const g = newGame(); g.plantTile(0, 0, "daisy"); const before = g.grid.plantIndex.size;
  assert.strictEqual(g.plantTile(0, 0, "daisy").ok, false, "occupied tile");
  assert.strictEqual(g.plantTile(1, 1, "carrot").ok, false, "carrot does not grow in the Flowers plot");
  assert.strictEqual(g.plantTile(1, 1, "tulip").ok, false, "no tulip seeds");
  g.player.energy = 0; assert.strictEqual(g.plantTile(1, 2, "daisy").ok, false, "too tired");
  assert.strictEqual(g.grid.plantSeed(-1, 0, "daisy", "Flowers"), false, "out of bounds");
  assert.strictEqual(g.grid.plantSeed(0, 1, "not-a-crop", "Flowers"), false, "unknown crop");
  assert.strictEqual(g.grid.plantIndex.size, before); assertSynced(g.grid, "failed plants");
});
test("inspectCell: occupied tiles report current stage/thirst/time from the grid; empty tiles give null", () => {
  const g = newGame(); assert.strictEqual(g.grid.inspectCell(0, 0, "Flowers", g._now), null);
  g.plantTile(0, 0, "daisy");
  let info = g.grid.inspectCell(0, 0, "Flowers", g._now);
  assert.deepStrictEqual(info, { cropId: "daisy", stage: STAGE.SEED, thirsty: true, remainingMs: null });
  g.waterTile(0, 0); info = g.grid.inspectCell(0, 0, "Flowers", g._now);
  assert.strictEqual(info.thirsty, false); assert.strictEqual(info.remainingMs, CROPS.daisy.growMinutes * 60000);
  assert.strictEqual(info.remainingMs, g.grid.remainingMs(0, 0, "Flowers", g._now), "same as the grid's own answer");
  advance(g, CROPS.daisy.growMinutes * 0.5); info = g.grid.inspectCell(0, 0, "Flowers", g._now); assert.strictEqual(info.stage, STAGE.GROWING); assert.strictEqual(info.stage, g.grid.getStage(0, 0, "Flowers"));
  advance(g, CROPS.daisy.growMinutes); info = g.grid.inspectCell(0, 0, "Flowers", g._now); assert.strictEqual(info.stage, STAGE.MATURE); assert.strictEqual(info.remainingMs, 0);
  assert.strictEqual(g.grid.inspectCell(5, 5, "Flowers", g._now), null);
});
test("the index stores no growth/thirst/timestamp state (only cropId, plot, row, col)", () => {
  const g = newGame(); g.plantTile(0, 0, "daisy"); g.waterTile(0, 0);
  assert.deepStrictEqual(Object.keys(g.grid.plantIndex.get("Flowers", 0, 0)).sort(), ["col", "cropId", "plot", "row"]);
});
test("harvest empties the tile and removes its entry; a failed harvest keeps it", () => {
  const g = newGame(); g.plantTile(0, 0, "daisy"); g.plantTile(0, 1, "daisy"); g.waterTile(0, 0); g.waterTile(0, 1);
  assert.strictEqual(g.harvestTile(0, 0).ok, false, "not ripe yet"); assert.ok(g.grid.plantIndex.has("Flowers", 0, 0)); assertSynced(g.grid, "unripe");
  advance(g, 10); refill(g);
  assert.strictEqual(g.harvestTile(0, 0).ok, true); assert.strictEqual(g.grid.plantIndex.has("Flowers", 0, 0), false); assert.ok(g.grid.plantIndex.has("Flowers", 0, 1));
  assert.strictEqual(g.grid.getStage(0, 0, "Flowers"), STAGE.EMPTY); assert.strictEqual(g.grid.inspectCell(0, 0, "Flowers"), null); assertSynced(g.grid, "harvested");
});
test("clearCell removes the entry; clearing an already-empty tile is harmless", () => {
  const g = newGame(); g.plantTile(3, 3, "daisy"); g.grid.clearCell(3, 3, "Flowers"); assert.strictEqual(g.grid.plantIndex.size, 0); g.grid.clearCell(3, 3, "Flowers"); assert.strictEqual(g.grid.plantIndex.size, 0); assertSynced(g.grid, "clear");
});
test("undo: planting, watering and harvesting all leave the index matching the restored grid", () => {
  const g = newGame(); g.plantTile(0, 0, "daisy"); g.plantTile(0, 1, "daisy"); assertSynced(g.grid, "2 planted");
  assert.strictEqual(g.undo().ok, true); assert.strictEqual(g.grid.plantIndex.size, 1); assert.strictEqual(g.grid.plantIndex.has("Flowers", 0, 1), false); assertSynced(g.grid, "undo plant");
  g.waterTile(0, 0); advance(g, 10); refill(g); g.harvestTile(0, 0); assertSynced(g.grid, "after harvest"); assert.strictEqual(g.grid.plantIndex.size, 0);
  assert.strictEqual(g.undo().ok, true); assert.strictEqual(g.grid.plantIndex.has("Flowers", 0, 0), true); assert.strictEqual(g.grid.plantIndex.get("Flowers", 0, 0).cropId, "daisy"); assertSynced(g.grid, "undo harvest");
  while (g.undo().ok) assertSynced(g.grid, "undo chain"); assert.strictEqual(g.grid.plantIndex.size, 0);
});
test("undo of other actions (sell, eat) does not disturb the index", () => {
  const g = newGame(); g.plantTile(0, 0, "daisy"); g.eat(g.inventory.slots.findIndex((s) => s && ITEMS[s.id].food)); g.drop(2, 1); g.undo(); g.undo(); assertSynced(g.grid, "other undo");
});
test("save/load: index is rebuilt from the grid and is not part of the save", () => {
  const g = newGame(); ["Flowers", "Root Crops", "Vegetables/Fruits"].forEach((plot, i) => { g.travel({ Flowers: "meadow", "Root Crops": "roots", "Vegetables/Fruits": "orchard" }[plot]); refill(g); g.plantTile(i, i, seedFor[plot]); g.waterTile(i, i); g.plantTile(i + 1, i, seedFor[plot]); });
  const save = JSON.parse(JSON.stringify(g.toJSON())); const text = JSON.stringify(save);
  assert.ok(!/bucket|plantIndex|chain/i.test(text), "no hash structure in the save");
  assert.deepStrictEqual(Object.keys(save).sort(), ["grid", "harvests", "inv", "location", "player", "selected", "time", "v"]);
  assert.deepStrictEqual(Object.keys(save.grid).sort(), ["plantIds", "readyAt", "stages", "thirsty", "wateredAt"]);
  assert.strictEqual(save.v, 2);
  const h = newGame(); h.loadJSON(save); assert.strictEqual(h.grid.plantIndex.size, 6); assertSynced(h.grid, "loaded");
  assert.ok(!/bucket|plantIndex/i.test(g.snapshot()), "undo snapshots do not contain the index either");
});
test("loading a save over a game that already has plants leaves no stale entries", () => {
  const g = newGame(); g.plantTile(0, 0, "daisy"); const emptySave = JSON.parse(JSON.stringify(newGame().toJSON()));
  g.loadJSON(emptySave); assert.strictEqual(g.grid.plantIndex.size, 0); assert.strictEqual(g.grid.plantIndex.has("Flowers", 0, 0), false); assertSynced(g.grid, "load empty over planted");
  const h = newGame(); h.plantTile(4, 4, "daisy"); const save = JSON.parse(JSON.stringify(h.toJSON())); const k = newGame(); k.plantTile(1, 1, "daisy"); k.loadJSON(save);
  assert.strictEqual(k.grid.plantIndex.has("Flowers", 1, 1), false); assert.strictEqual(k.grid.plantIndex.has("Flowers", 4, 4), true); assertSynced(k.grid, "swap");
});
test("existing (older) saves still load: no timestamps, bad crops, wrong-plot crops, malformed plots", () => {
  const g = newGame(); g.plantTile(0, 0, "daisy"); g.waterTile(0, 0); g.plantTile(0, 1, "daisy"); const save = JSON.parse(JSON.stringify(g.toJSON()));
  const old = JSON.parse(JSON.stringify(save)); delete old.grid.wateredAt; delete old.grid.readyAt;          // an older save without timestamps
  old.grid.plantIds.Flowers[5][5] = "carrot"; old.grid.stages.Flowers[5][5] = 2;                           // carrot in the Flowers plot: dropped
  old.grid.plantIds.Flowers[6][6] = "nonsense"; old.grid.stages.Flowers[6][6] = 1;                         // unknown crop: dropped
  old.grid.stages["Root Crops"] = "garbage";                                                              // malformed plot: skipped
  const h = newGame(); assert.strictEqual(h.loadJSON(old), true);
  assert.strictEqual(h.grid.plantIndex.size, 2); assert.strictEqual(h.grid.plantIndex.has("Flowers", 5, 5), false); assert.strictEqual(h.grid.plantIndex.has("Flowers", 6, 6), false); assertSynced(h.grid, "old save");
  assert.strictEqual(h.grid.getStage(0, 0, "Flowers") !== STAGE.EMPTY, true);
  assert.strictEqual(newGame().loadJSON({ v: 1 }), false); assert.strictEqual(newGame().loadJSON(null), false);
});
test("a bad save does not corrupt the index of a running game", () => {
  const g = newGame(); g.plantTile(0, 0, "daisy"); assert.strictEqual(g.loadJSON({ v: 3 }), false); g.grid.loadJSON(null); assertSynced(g.grid, "rejected save");
});
test("loadJSON rebuilds the index once and does not remove entries one by one", () => {
  const g = newGame(); g.plantTile(0, 0, "daisy"); const save = JSON.parse(JSON.stringify(g.toJSON()));
  let rebuilds = 0, removes = 0; const rb = g.grid.rebuildIndex.bind(g.grid), rm = g.grid.plantIndex.remove.bind(g.grid.plantIndex);
  g.grid.rebuildIndex = () => { rebuilds++; rb(); }; g.grid.plantIndex.remove = (...a) => { removes++; return rm(...a); };
  g.loadJSON(save); assert.strictEqual(rebuilds, 1); assert.strictEqual(removes, 0); assertSynced(g.grid, "spied load");
});
test("new-game initialization: a fresh GardenGame never inherits entries (reload path)", () => {
  const g = newGame(); g.plantTile(0, 0, "daisy"); assert.strictEqual(g.grid.plantIndex.size, 1);
  const fresh = new GardenGame(); assert.strictEqual(fresh.load(), false, "no save in Node"); assert.strictEqual(fresh.grid.plantIndex.size, 0); assertSynced(fresh.grid, "fresh");
});
test("collisions and resizing with a real grid: all 300 tiles planted, then thinned out", () => {
  const g = newGame(), grid = g.grid; const seen = new Set([16]);
  for (const p of PLOT_NAMES) for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const crop = Object.keys(CROPS).find((id) => CROPS[id].plot === p); assert.strictEqual(grid.plantSeed(r, c, crop, p), true); seen.add(grid.plantIndex.capacity); assert.ok(grid.plantIndex.loadFactor <= 0.75 + 1e-12);
  }
  assert.deepStrictEqual([...seen], [16, 32, 64, 128, 256, 512]); assert.strictEqual(grid.plantIndex.size, 300); assertSynced(grid, "full");
  const st = grid.indexStats(); let multi = 0; grid.plantIndex.buckets.forEach((b) => { let n = 0; for (let x = b; x; x = x.next) n++; if (n > 1) multi++; });
  assert.strictEqual(st.collisionBuckets, multi); assert.ok(multi > 0, "real tile keys do collide at this size"); assert.strictEqual(st.size, 300); assert.strictEqual(st.capacity, 512);
  for (let r = 0; r < GRID_SIZE; r += 2) for (const p of PLOT_NAMES) for (let c = 0; c < GRID_SIZE; c++) grid.clearCell(r, c, p);
  assert.strictEqual(grid.plantIndex.size, 150); assert.strictEqual(grid.plantIndex.capacity, 512, "no automatic shrinking"); assertSynced(grid, "thinned");
  const save = JSON.parse(JSON.stringify(g.toJSON())); const h = newGame(); assert.strictEqual(h.loadJSON(save), true); assert.strictEqual(h.grid.plantIndex.size, 150); assert.strictEqual(h.grid.plantIndex.capacity, 256); assertSynced(h.grid, "rebuilt after load");
});
test("randomised play: plant/water/harvest/undo/save-load keep the index in step", () => {
  let seed = 99; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  let g = newGame();
  for (let n = 0; n < 400; n++) {
    refill(g); const plot = PLOT_NAMES[Math.floor(rnd() * 3)], place = { Flowers: "meadow", "Root Crops": "roots", "Vegetables/Fruits": "orchard" }[plot];
    if (g.location !== place) g.travel(place);
    g.inventory.add(`${seedFor[plot]}-seed`, 1);
    const r = Math.floor(rnd() * GRID_SIZE), c = Math.floor(rnd() * GRID_SIZE), op = rnd();
    if (op < 0.4) g.plantTile(r, c, seedFor[plot]); else if (op < 0.55) g.waterTile(r, c); else if (op < 0.7) { advance(g, 15); g.harvestTile(r, c); }
    else if (op < 0.85) g.undo(); else { const save = JSON.parse(JSON.stringify(g.toJSON())); const h = newGame(); h._now = g._now; h.loadJSON(save); g = h; }
    assert.strictEqual(g.grid.indexMatchesGrid(), true, `step ${n}`);
  }
  assertSynced(g.grid, "random end");
});
console.log(`\n${passed} plant-index tests passed`);
