/* Tests for Phase 4: seasonal harvest tracking (SeasonHarvestTracker + how GardenGame feeds it).
   Run from the project folder:  node tests/season_tracking.test.js   (or all tests: node tests/run_all.js) */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const S = require(path.join(__dirname, "..", "script.js"));
const { GardenGame, SeasonHarvestTracker: Tracker, CROPS, ITEMS, SEASONS, DAYS_PER_SEASON, sortedHarvestRows } = S;
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log("ok -", name); } catch (e) { console.log("FAIL -", name, "\n", e.stack.split("\n").slice(0, 4).join("\n")); process.exitCode = 1; } };

const T0 = 1_800_000_000_000;
const newGame = () => { const g = new GardenGame(); g.clock = () => g._now; g._now = T0; g.player.coins = 999; return g; };
const refill = (g) => { g.player.energy = g.player.maxEnergy; };
const advance = (g, minutes) => { g._now += minutes * 60000; g.refreshGrowth(); };
const clone = (x) => JSON.parse(JSON.stringify(x));
/** Plant + water + wait + harvest one crop in the Flowers meadow (daisy: 3 min) at tile [r, c]. Returns the harvest result. */
const grow = (g, cropId, r = 0, c = 0) => {
  const spot = { daisy: "meadow", tulip: "meadow", carrot: "roots", radish: "roots", tomato: "orchard" }[cropId];
  g.location = spot; g._syncPlot(); refill(g);
  g.inventory.add(`${cropId}-seed`, 1);
  assert.ok(g.plantTile(r, c, cropId).ok, "plant"); assert.ok(g.waterTile(r, c).ok, "water");
  advance(g, CROPS[cropId].growMinutes + 1); refill(g);
  return g.harvestTile(r, c);
};
const cur = (g) => g.tracker.current;
const list = (rec) => rec.crops.map((e) => [e.cropId, e.quantity, e.value]);
const undoN = (g, n) => { for (let i = 0; i < n; i++) assert.ok(g.undo().ok, `undo ${i + 1}`); };   // grow() records 3 undoable actions: plant, water, harvest
const sleepDays = (g, n) => { for (let i = 0; i < n; i++) g.sleep(); };

/* ---------- the calendar, verified before IDs are derived from it ---------- */
test("calendar: day counter, day-in-season and season stay in step for 120 days (sleep and Night->Day)", () => {
  const g = newGame(), t = g.time;
  for (let i = 0; i < 120; i++) {
    if (i % 2) g.sleep(); else { g.togglePhase(); const r = g.togglePhase(); assert.ok(r.info, "Night -> Day is a new day"); }
    const serial = Math.floor((t.dayCounter - 1) / DAYS_PER_SEASON);
    assert.strictEqual(t.dayCounter, i + 2);
    assert.ok(t.daysIntoSeason >= 1 && t.daysIntoSeason <= DAYS_PER_SEASON);
    assert.strictEqual(t.dayCounter, serial * DAYS_PER_SEASON + t.daysIntoSeason, "day = 7 x seasons-so-far + day in season");
    assert.strictEqual(t.season, SEASONS[serial % 4]);
    assert.strictEqual(g.tracker.current.serial, serial, `tracker serial matches the calendar on day ${t.dayCounter}`);
    assert.strictEqual(g.tracker.archive.length, serial);
  }
});
test("day -> night alone is not a new day: nothing archives and the day does not change", () => {
  const g = newGame(); g.togglePhase(); assert.strictEqual(g.time.dayCounter, 1); assert.strictEqual(g.tracker.archive.length, 0); assert.strictEqual(cur(g).serial, 0);
});
test("season IDs and labels", () => {
  assert.strictEqual(Tracker.labelOf(0), "Spring — Cycle 1");
  assert.strictEqual(Tracker.labelOf(3), "Winter — Cycle 1");
  assert.strictEqual(Tracker.labelOf(4), "Spring — Cycle 2");
  assert.strictEqual(Tracker.labelOf(9), "Summer — Cycle 3");
  assert.strictEqual(Tracker.idOf(0), "season-1"); assert.strictEqual(Tracker.idOf(4), "season-5");
  const ids = Array.from({ length: 40 }, (_, i) => Tracker.idOf(i)); assert.strictEqual(new Set(ids).size, 40, "IDs are unique");
});
test("a new game starts at Spring - Cycle 1, empty, and is not partial", () => {
  const g = newGame(); assert.deepStrictEqual(g.tracker.toJSON(), { current: { serial: 0, partial: false, crops: [] }, archive: [] });
});

/* ---------- recording ---------- */
test("a successful harvest records the quantity received and value = quantity x base price", () => {
  const g = newGame(); assert.ok(grow(g, "daisy").ok);                 // daisy: yield 1, sells 12
  assert.deepStrictEqual(list(cur(g)), [["daisy", 1, 12]]);
  assert.ok(grow(g, "carrot").ok);                                      // carrot: yield 2, sells 5
  assert.deepStrictEqual(list(cur(g)), [["daisy", 1, 12], ["carrot", 2, 10]]);
  assert.ok(grow(g, "daisy", 1, 1).ok);                                 // repeat crop adds to the same entry
  assert.deepStrictEqual(list(cur(g)), [["daisy", 2, 24], ["carrot", 2, 10]]);
});
test("failed harvests award nothing: empty tile, not ripe, thirsty, tired, backpack full", () => {
  const g = newGame(); g.location = "meadow"; g._syncPlot(); refill(g); const before = JSON.stringify(g.tracker.toJSON());
  assert.strictEqual(g.harvestTile(5, 5).ok, false, "empty tile");
  g.inventory.add("daisy-seed", 1); g.plantTile(0, 0, "daisy");
  assert.strictEqual(g.harvestTile(0, 0).ok, false, "seed stage / thirsty");
  g.waterTile(0, 0); assert.strictEqual(g.harvestTile(0, 0).ok, false, "watered but not ripe");
  advance(g, 4); g.player.energy = 0; assert.strictEqual(g.harvestTile(0, 0).ok, false, "too tired");
  refill(g); for (let i = 0; i < g.inventory.size; i++) if (g.inventory.slots[i] === null) g.inventory.slots[i] = { id: "tulip-seed", qty: 1 };
  assert.strictEqual(g.harvestTile(0, 0).ok, false, "backpack full");
  assert.strictEqual(JSON.stringify(g.tracker.toJSON()), before, "nothing recorded by any failure");
});
test("repeating a harvest on the same (now empty) tile awards nothing", () => {
  const g = newGame(); assert.ok(grow(g, "daisy").ok); const after = JSON.stringify(g.tracker.toJSON());
  assert.strictEqual(g.harvestTile(0, 0).ok, false); assert.strictEqual(g.harvestTile(0, 0).ok, false);
  assert.strictEqual(JSON.stringify(g.tracker.toJSON()), after);
});
test("non-harvest actions award nothing: plant, water, eat, drop, sell, swap, travel, undo", () => {
  const g = newGame(); grow(g, "carrot"); const base = JSON.stringify(g.tracker.toJSON());
  g.location = "meadow"; g._syncPlot(); refill(g); g.inventory.add("daisy-seed", 1);
  g.plantTile(3, 3, "daisy"); g.waterTile(3, 3);
  g.player.energy = 1; g.eat(g.inventory.slots.findIndex((s) => s && s.id === "carrot"));
  g.drop(g.inventory.slots.findIndex((s) => s && s.id === "carrot"), 1);
  g.inventory.add("daisy", 3); g.location = "market"; g.sell(g.inventory.slots.findIndex((s) => s && s.id === "daisy"), 3);
  g.swapSlots(2, 3); g.undo(); g.undo();
  assert.deepStrictEqual(list(cur(g)), [["carrot", 2, 10]], "only the earlier harvest is there");
  void base;
});
test("only what was really received is counted (backpack leftover is subtracted)", () => {
  const g = newGame(); const real = g.inventory.add.bind(g.inventory);
  g.inventory.add = (id, q) => { const left = real(id, q); return id === "carrot" ? left + 1 : left; };   // pretend one carrot did not fit
  grow(g, "carrot"); assert.deepStrictEqual(list(cur(g)), [["carrot", 1, 5]]);
  assert.strictEqual(g.tracker.recordHarvest("carrot", 0), false); assert.strictEqual(g.tracker.recordHarvest("nope", 2), false); assert.strictEqual(g.tracker.recordHarvest("carrot", -1), false);
  assert.deepStrictEqual(list(cur(g)), [["carrot", 1, 5]]);
});

/* ---------- order ---------- */
test("first-harvest order: the crop harvested first is listed first, repeats do not move it", () => {
  const g = newGame(); grow(g, "carrot"); grow(g, "daisy"); grow(g, "carrot", 1, 1); grow(g, "tomato");
  assert.deepStrictEqual(Tracker.rows(cur(g)).map((r) => [r.cropId, r.firstOrder]), [["carrot", 0], ["daisy", 1], ["tomato", 2]]);
});

/* ---------- undo ---------- */
test("undo reverses quantity and value, and removes a crop's entry if that harvest was its first", () => {
  const g = newGame(); grow(g, "daisy"); grow(g, "carrot");
  undoN(g, 1); assert.deepStrictEqual(list(cur(g)), [["daisy", 1, 12]], "carrot's first harvest undone: entry gone");
  undoN(g, 3); assert.deepStrictEqual(list(cur(g)), [], "carrot's water+plant, then daisy's harvest undone: empty again");
});
test("undo of a repeat harvest keeps the crop's earlier entry and position", () => {
  const g = newGame(); grow(g, "carrot"); grow(g, "daisy"); grow(g, "carrot", 1, 1);
  g.undo(); assert.deepStrictEqual(list(cur(g)), [["carrot", 2, 10], ["daisy", 1, 12]]);
});
test("undo then harvesting again puts the crop back in order by its NEW first harvest", () => {
  const g = newGame(); grow(g, "daisy"); grow(g, "carrot");
  undoN(g, 4);                                         // carrot harvest, water, plant, then daisy's harvest: all gone
  assert.deepStrictEqual(list(cur(g)), []);
  grow(g, "carrot");
  g.location = "meadow"; g._syncPlot(); refill(g); assert.ok(g.harvestTile(0, 0).ok, "the daisy is ripe again after the undo");
  assert.deepStrictEqual(list(cur(g)).map((x) => x[0]), ["carrot", "daisy"], "daisy is now second: its first harvest happened later");
});
test("undo snapshots include current and archive tracking, and restoring awards/archives nothing", () => {
  const g = newGame(); grow(g, "daisy"); sleepDays(g, 7); grow(g, "carrot");
  const snap = JSON.parse(g.snapshot()); assert.ok(snap.harvests && snap.harvests.current && Array.isArray(snap.harvests.archive));
  assert.strictEqual(snap.harvests.archive.length, 1);
  let archived = 0; g.time.onSeasonChange = () => { archived++; };
  const before = JSON.stringify(g.tracker.toJSON()); grow(g, "carrot", 2, 2); g.undo();
  assert.strictEqual(JSON.stringify(g.tracker.toJSON()), before); assert.strictEqual(archived, 0, "no archive during undo/restore");
  g.restore(g.snapshot()); assert.strictEqual(JSON.stringify(g.tracker.toJSON()), before);
});
test("day transitions still clear the undo stack, so undo can never cross a season boundary", () => {
  const g = newGame(); grow(g, "daisy"); assert.ok(g.stack.items.length > 0); sleepDays(g, 7);
  assert.strictEqual(g.stack.items.length, 0); const before = JSON.stringify(g.tracker.toJSON());
  assert.strictEqual(g.undo().ok, false); assert.strictEqual(JSON.stringify(g.tracker.toJSON()), before);
});

/* ---------- seasons and archives ---------- */
test("season boundary: the finished season is archived with its totals, the new one starts empty", () => {
  const g = newGame(); grow(g, "daisy"); grow(g, "carrot"); sleepDays(g, 6);
  assert.strictEqual(g.tracker.archive.length, 0, "still inside Spring - Cycle 1 after 6 sleeps");
  g.sleep();
  assert.strictEqual(g.time.season, "Summer");
  assert.strictEqual(g.tracker.archive.length, 1);
  assert.deepStrictEqual(g.tracker.archive[0], { serial: 0, partial: false, crops: [{ cropId: "daisy", quantity: 1, value: 12 }, { cropId: "carrot", quantity: 2, value: 10 }] });
  assert.deepStrictEqual(g.tracker.current, { serial: 1, partial: false, crops: [] });
  grow(g, "tomato"); assert.deepStrictEqual(list(g.tracker.archive[0]).length, 2, "new harvests do not touch the archive"); assert.deepStrictEqual(list(cur(g)), [["tomato", 2, 12]]);
});
test("empty seasons are archived, exactly once each, with contiguous unique serials", () => {
  const g = newGame(); sleepDays(g, 7 * 9);
  assert.strictEqual(g.tracker.archive.length, 9);
  assert.deepStrictEqual(g.tracker.archive.map((r) => r.serial), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(g.tracker.archive.every((r) => r.crops.length === 0));
  assert.strictEqual(Tracker.labelOf(cur(g).serial), "Summer — Cycle 3");
  assert.strictEqual(g.time.season, "Summer");
});
test("an archive entry can never be duplicated, even if closeSeason is forced on the same serial", () => {
  const t = new Tracker(); t.closeSeason(); t.current.serial = 0; t.closeSeason();
  assert.strictEqual(t.archive.filter((r) => r.serial === 0).length, 1);
});
test("saving and loading right at a boundary does not archive again or award anything", () => {
  const g = newGame(); grow(g, "daisy"); sleepDays(g, 7);
  const save = clone(g.toJSON()); const h = newGame(); let fired = 0; h.time.onSeasonChange = () => { fired++; };
  assert.ok(h.loadJSON(save)); assert.strictEqual(fired, 0);
  assert.deepStrictEqual(h.tracker.toJSON(), g.tracker.toJSON()); assert.strictEqual(h.tracker.archive.length, 1);
  h.sleep(); assert.strictEqual(h.tracker.archive.length, 1, "next day of the new season: no archive");
});
test("rewindSeason() is unchanged and not connected to tracking", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
  assert.ok(src.includes("rewindSeason() {\n    this.seasons.movePrev();\n    this.daysIntoSeason = 1;\n    return this.season;\n  }"));
  assert.strictEqual((src.match(/rewindSeason/g) || []).length, 1, "only the definition exists; nothing calls it");
  const g = newGame(); sleepDays(g, 7); const before = JSON.stringify(g.tracker.toJSON()); g.time.rewindSeason();
  assert.strictEqual(JSON.stringify(g.tracker.toJSON()), before);
});

/* ---------- prices ---------- */
test("later price changes do not change recorded values (live, archived and saved)", () => {
  const old = CROPS.daisy.sellPrice, g = newGame();
  try {
    grow(g, "daisy"); assert.deepStrictEqual(list(cur(g)), [["daisy", 1, 12]]);
    CROPS.daisy.sellPrice = 99;
    assert.deepStrictEqual(list(cur(g)), [["daisy", 1, 12]], "unchanged by the price change");
    grow(g, "daisy", 1, 1); assert.deepStrictEqual(list(cur(g)), [["daisy", 2, 12 + 99]], "new harvests use the new base price");
    sleepDays(g, 7); assert.strictEqual(g.tracker.archive[0].crops[0].value, 111);
    CROPS.daisy.sellPrice = 1;
    const h = newGame(); h.loadJSON(clone(g.toJSON())); assert.strictEqual(h.tracker.archive[0].crops[0].value, 111, "loading does not reprice");
  } finally { CROPS.daisy.sellPrice = old; }
});

/* ---------- save / load ---------- */
test("save/load round trip keeps quantities, values, first-harvest order and the archive", () => {
  const g = newGame(); grow(g, "tomato"); grow(g, "daisy"); grow(g, "tomato", 1, 1); sleepDays(g, 7); grow(g, "carrot"); grow(g, "daisy");
  const save = clone(g.toJSON()); assert.ok(save.harvests); const h = newGame(); assert.ok(h.loadJSON(save));
  assert.deepStrictEqual(h.tracker.toJSON(), g.tracker.toJSON());
  assert.deepStrictEqual(h.tracker.archive[0].crops.map((e) => e.cropId), ["tomato", "daisy"], "archived order kept");
  assert.deepStrictEqual(Tracker.rows(h.tracker.current).map((r) => r.cropId), ["carrot", "daisy"]);
  assert.strictEqual(h.tracker.current.partial, false);
  assert.deepStrictEqual(clone(h.toJSON()).harvests, save.harvests, "saving again gives the same data");
});
test("loading a save awards nothing even if the save already has harvests", () => {
  const g = newGame(); grow(g, "daisy"); const save = clone(g.toJSON()); const h = newGame(); h.loadJSON(save); h.loadJSON(save);
  assert.deepStrictEqual(list(cur(h)), [["daisy", 1, 12]], "loaded twice is still one harvest");
});

/* ---------- old (version 2, no harvests field) saves ---------- */
test("old save without the field: loads fine, tracking starts now, marked partial, no invented history", () => {
  const g = newGame(); sleepDays(g, 9); const old = clone(g.toJSON()); delete old.harvests;     // day 10 = Summer, day 3 of it
  const h = newGame(); assert.strictEqual(h.loadJSON(old), true);
  assert.deepStrictEqual(h.tracker.toJSON(), { current: { serial: 1, partial: true, crops: [] }, archive: [] });
  assert.strictEqual(Tracker.labelOf(h.tracker.current.serial), "Summer — Cycle 1");
});
test("old save: ID is derived from the calendar when it is consistent (later cycle)", () => {
  const g = newGame(); sleepDays(g, 7 * 9 + 2); const old = clone(g.toJSON()); delete old.harvests;   // Summer, Cycle 3
  const h = newGame(); h.loadJSON(old); assert.strictEqual(h.tracker.current.serial, 9); assert.ok(h.tracker.current.partial); assert.strictEqual(h.tracker.archive.length, 0);
});
test("old save with an inconsistent calendar falls back to cycle 1 for that season (still partial)", () => {
  const g = newGame(); const old = clone(g.toJSON()); delete old.harvests; old.time = { day: 3, daysIntoSeason: 3, season: "Winter", phase: "Day" };
  const h = newGame(); h.loadJSON(old); assert.strictEqual(h.tracker.current.serial, 3); assert.ok(h.tracker.current.partial);
});
test("a partial season records harvests, is archived marked partial, and the next season is not partial", () => {
  const g = newGame(); sleepDays(g, 3); const old = clone(g.toJSON()); delete old.harvests;
  const h = newGame(); h.loadJSON(old); h._now = T0 + 3 * 86400000; grow(h, "daisy");
  assert.deepStrictEqual(list(cur(h)), [["daisy", 1, 12]]); assert.ok(cur(h).partial);
  sleepDays(h, 4);
  assert.strictEqual(h.tracker.archive.length, 1); assert.strictEqual(h.tracker.archive[0].partial, true); assert.deepStrictEqual(list(h.tracker.archive[0]), [["daisy", 1, 12]]);
  assert.strictEqual(cur(h).partial, false); assert.strictEqual(h.time.season, "Summer");
});
test("old save: everything else loads exactly as before (inventory, grid, player, sorting)", () => {
  const g = newGame(); grow(g, "daisy"); grow(g, "carrot"); const full = clone(g.toJSON()); const old = clone(full); delete old.harvests;
  const h = newGame(); h.loadJSON(old);
  assert.deepStrictEqual(clone(h.inventory.toJSON()), full.inv); assert.deepStrictEqual(clone(h.player.toJSON()), full.player); assert.deepStrictEqual(clone(h.grid.toJSON()), full.grid);
  assert.deepStrictEqual(sortedHarvestRows(h.inventory, "name", "asc").map((r) => r.cropId), ["carrot", "daisy"]);
  assert.strictEqual(h.grid.indexMatchesGrid(), true);
});
test("damaged harvests data gets safe defaults and never throws", () => {
  const bad = [null, "x", 5, [], {}, { current: null }, { current: { serial: -1, crops: [] } }, { current: { serial: 1.5, crops: [] } }, { current: { serial: 0, crops: "no" } }];
  for (const b of bad) { const g = newGame(); const save = clone(g.toJSON()); save.harvests = b; const h = newGame(); assert.doesNotThrow(() => h.loadJSON(save)); assert.strictEqual(h.tracker.current.partial, true); assert.deepStrictEqual(h.tracker.current.crops, []); }
  const g = newGame(); const save = clone(g.toJSON());
  save.harvests = { current: { serial: 0, partial: "yes", crops: [
    { cropId: "daisy", quantity: 3, value: 36 }, { cropId: "ghost", quantity: 1, value: 1 }, { cropId: "daisy", quantity: 9, value: 9 },
    { cropId: "carrot", quantity: -2, value: 4 }, { cropId: "tomato", quantity: 2.5, value: 3 }, { cropId: "tulip", quantity: 1, value: "x" }, { cropId: "rose", quantity: 1, value: 70 }] },
    archive: [{ serial: 5, crops: [] }, { serial: 0, crops: [] }] };
  const h = newGame(); h.loadJSON(save);
  assert.deepStrictEqual(h.tracker.toJSON(), { current: { serial: 0, partial: false, crops: [{ cropId: "daisy", quantity: 3, value: 36 }, { cropId: "rose", quantity: 1, value: 70 }] }, archive: [] }, "bad entries dropped, order kept, no archive entry for current/future serials");
});
test("harvests data for the wrong season is not trusted: restart as partial, keep valid older archive", () => {
  const g = newGame(); sleepDays(g, 7); const save = clone(g.toJSON());     // now Summer, serial 1
  save.harvests.current.serial = 2;                                         // says Autumn
  const h = newGame(); h.loadJSON(save);
  assert.strictEqual(h.tracker.current.serial, 1); assert.ok(h.tracker.current.partial); assert.deepStrictEqual(h.tracker.archive.map((r) => r.serial), [0]);
});

/* ---------- other DSA features and saves still behave ---------- */
test("hash index and Harvest Inventory sorting are unaffected by tracking", () => {
  const g = newGame(); grow(g, "daisy"); grow(g, "carrot"); g.undo();
  assert.strictEqual(g.grid.indexMatchesGrid(), true);
  const before = JSON.stringify(g.inventory.slots); sortedHarvestRows(g.inventory, "total", "desc"); assert.strictEqual(JSON.stringify(g.inventory.slots), before);
  assert.strictEqual(g.toJSON().v, 2);
});
test("randomised play with undo: the tracker always equals the harvests still on the undo stack (totals AND order)", () => {
  let seed = 7; const rnd = (n) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  const g = newGame(); const crops = ["daisy", "carrot", "tomato", "tulip", "radish"]; const idOfName = (n) => crops.find((c) => CROPS[c].name === n);
  for (let i = 0; i < 150; i++) {
    if (rnd(4) < 3) grow(g, crops[rnd(crops.length)], rnd(10), rnd(10)); else g.undo();
    // Rebuild what the tracker SHOULD say from the undo stack: every action not undone, oldest first.
    const want = [];
    for (const a of g.stack.items) {
      const m = /^harvested (\w+) at/.exec(a.description); if (!m) continue;
      const id = idOfName(m[1]); let e = want.find((x) => x.cropId === id);
      if (!e) want.push(e = { cropId: id, quantity: 0, value: 0 });
      e.quantity += CROPS[id].yield; e.value += CROPS[id].yield * CROPS[id].sellPrice;
    }
    assert.deepStrictEqual(cur(g).crops, want, `step ${i}`);
  }
});

console.log(`\n${passed} season-tracking tests passed`);
