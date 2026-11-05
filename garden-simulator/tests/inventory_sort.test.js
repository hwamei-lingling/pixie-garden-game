/* Tests for the display-only Harvest Inventory: aggregation + hand-written Insertion Sort.
   Run from the project folder:  node tests/inventory_sort.test.js   (or all tests: node tests/run_all.js) */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const S = require(path.join(__dirname, "..", "script.js"));
const { Inventory, GardenGame, CROPS, ITEMS, HARVEST_SORT_KEYS, buildHarvestRows, compareHarvestRows, insertionSortHarvest, sortedHarvestRows } = S;
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log("ok -", name); } catch (e) { console.log("FAIL -", name, "\n", e.stack.split("\n").slice(0, 4).join("\n")); process.exitCode = 1; } };

const KEYS = Object.keys(HARVEST_SORT_KEYS);
const FIELD = { unit: "unitValue", total: "totalValue", quantity: "quantity", growth: "growMinutes", name: "name" };
const names = (rows) => rows.map((r) => r.cropId);
const inv = (slots) => { const i = new Inventory(); slots.forEach((s, n) => { i.slots[n] = s ? { id: s[0], qty: s[1] } : null; }); return i; };
const snapshot = (i) => JSON.stringify(i.slots);
// Independent reference (test only): key, then first-appearance index. Uses the native sort on purpose.
const reference = (rows, key, dir) => rows.map((r, idx) => ({ r, idx })).sort((a, b) => {
  const c = key === "name" ? (a.r.name.toLowerCase() < b.r.name.toLowerCase() ? -1 : a.r.name.toLowerCase() > b.r.name.toLowerCase() ? 1 : 0) : a.r[FIELD[key]] - b.r[FIELD[key]];
  return (dir === "asc" ? c : -c) || a.idx - b.idx;
}).map((x) => x.r.cropId);

// A mixed backpack: a tool, a seed, crops in a deliberately unsorted order, and a duplicate stack.
const mixed = () => inv([
  ["shears", 1], ["tomato-seed", 5], ["rose", 3], ["carrot", 10], null, ["daisy", 4], ["tomato", 2], ["carrot", 5],
  ["eggplant", 1], ["potato", 7], null, ["radish", 7],
]);

test("empty backpack and a backpack with no crops give an empty list; sorting it is fine", () => {
  assert.deepStrictEqual(buildHarvestRows(new Inventory()), []);
  assert.deepStrictEqual(buildHarvestRows(inv([["shears", 1], ["daisy-seed", 9]])), []);
  for (const k of KEYS) for (const d of ["asc", "desc"]) assert.deepStrictEqual(insertionSortHarvest([], k, d), []);
});
test("single item: one row, every key and direction returns it unchanged", () => {
  const rows = buildHarvestRows(inv([["tulip", 3]]));
  assert.deepStrictEqual(rows, [{ cropId: "tulip", name: "Tulip", quantity: 3, unitValue: 20, totalValue: 60, growMinutes: 5 }]);
  for (const k of KEYS) for (const d of ["asc", "desc"]) assert.deepStrictEqual(names(insertionSortHarvest(rows, k, d)), ["tulip"]);
});
test("only harvested crops are included (no seeds, no tools)", () => {
  assert.deepStrictEqual(names(buildHarvestRows(mixed())), ["rose", "carrot", "daisy", "tomato", "eggplant", "potato", "radish"]);
});
test("duplicate stacks of one crop merge into one row; first-appearance order is kept", () => {
  const rows = buildHarvestRows(mixed());
  const carrot = rows.filter((r) => r.cropId === "carrot");
  assert.strictEqual(carrot.length, 1);
  assert.strictEqual(carrot[0].quantity, 15);
  assert.strictEqual(carrot[0].totalValue, 15 * 5);
  assert.deepStrictEqual(names(rows).indexOf("rose") < names(rows).indexOf("carrot"), true);
  // stacks can also be split across the hotbar and the rest of the pack
  const split = buildHarvestRows(inv([["daisy", 99], ["tulip", 1], ["daisy", 50]]));
  assert.deepStrictEqual(split.map((r) => [r.cropId, r.quantity]), [["daisy", 149], ["tulip", 1]]);
});
test("row values come from existing crop data; total = quantity x unit value", () => {
  for (const r of buildHarvestRows(mixed())) {
    assert.strictEqual(r.unitValue, CROPS[r.cropId].sellPrice);
    assert.strictEqual(r.unitValue, ITEMS[r.cropId].sell);
    assert.strictEqual(r.growMinutes, CROPS[r.cropId].growMinutes);
    assert.strictEqual(r.name, CROPS[r.cropId].name);
    assert.strictEqual(r.totalValue, r.quantity * r.unitValue);
  }
});
test("unit sell value: ascending and descending, ties keep first-appearance order", () => {
  const rows = buildHarvestRows(inv([["rose", 1], ["carrot", 1], ["tomato", 1], ["daisy", 1], ["beet", 1], ["tulip", 1]]));
  // sell values: rose 70, carrot 5, tomato 6, daisy 12, beet 22, tulip 20
  assert.deepStrictEqual(names(insertionSortHarvest(rows, "unit", "asc")), ["carrot", "tomato", "daisy", "tulip", "beet", "rose"]);
  assert.deepStrictEqual(names(insertionSortHarvest(rows, "unit", "desc")), ["rose", "beet", "tulip", "daisy", "tomato", "carrot"]);
});
test("total stack value: ascending and descending", () => {
  const rows = buildHarvestRows(mixed());
  // totals: rose 210, carrot 75, daisy 48, tomato 12, potato 91, eggplant 26, radish 56
  assert.deepStrictEqual(names(insertionSortHarvest(rows, "total", "asc")), ["tomato", "eggplant", "daisy", "radish", "carrot", "potato", "rose"]);
  assert.deepStrictEqual(names(insertionSortHarvest(rows, "total", "desc")), ["rose", "potato", "carrot", "radish", "daisy", "eggplant", "tomato"]);
});
test("quantity: ascending and descending; ties (7 potato / 7 radish) keep scan order both ways", () => {
  const rows = buildHarvestRows(mixed());
  // quantities: rose 3, carrot 15, daisy 4, tomato 2, potato 7, eggplant 1, radish 7
  assert.deepStrictEqual(names(insertionSortHarvest(rows, "quantity", "asc")), ["eggplant", "tomato", "rose", "daisy", "potato", "radish", "carrot"]);
  assert.deepStrictEqual(names(insertionSortHarvest(rows, "quantity", "desc")), ["carrot", "potato", "radish", "daisy", "rose", "tomato", "eggplant"]);
});
test("growth duration: ascending and descending, with many ties", () => {
  const rows = buildHarvestRows(mixed());
  // minutes: rose 11, carrot 3, daisy 3, tomato 3, potato 7, eggplant 9, radish 5
  assert.deepStrictEqual(names(insertionSortHarvest(rows, "growth", "asc")), ["carrot", "daisy", "tomato", "radish", "potato", "eggplant", "rose"]);
  assert.deepStrictEqual(names(insertionSortHarvest(rows, "growth", "desc")), ["rose", "eggplant", "potato", "radish", "carrot", "daisy", "tomato"]);
});
test("name: case-insensitive, consistent, both directions", () => {
  const rows = buildHarvestRows(mixed());
  assert.deepStrictEqual(names(insertionSortHarvest(rows, "name", "asc")), ["carrot", "daisy", "eggplant", "potato", "radish", "rose", "tomato"]);
  assert.deepStrictEqual(names(insertionSortHarvest(rows, "name", "desc")), ["tomato", "rose", "radish", "potato", "eggplant", "daisy", "carrot"]);
  // mixed-case names compare equal ignoring case, and lowercase "apple" does not jump after uppercase "Zebra"
  const r = (n) => ({ name: n });
  assert.strictEqual(compareHarvestRows(r("apple"), r("Apple"), "name"), 0);
  assert.ok(compareHarvestRows(r("apple"), r("Zebra"), "name") < 0);
  assert.ok(compareHarvestRows(r("Zebra"), r("apple"), "name") > 0);
  const fake = [{ cropId: "z", name: "Zebra" }, { cropId: "a1", name: "apple" }, { cropId: "a2", name: "Apple" }, { cropId: "b", name: "Banana" }];
  assert.deepStrictEqual(names(insertionSortHarvest(fake, "name", "asc")), ["a1", "a2", "b", "z"]);   // a1/a2 tie: first appearance
  assert.deepStrictEqual(names(insertionSortHarvest(fake, "name", "desc")), ["z", "b", "a1", "a2"]);  // tie order NOT reversed
});
test("all keys and directions match an independent reference on every crop combination (stability included)", () => {
  const ids = Object.keys(CROPS);
  let seed = 12345; const rnd = (n) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  for (let t = 0; t < 300; t++) {
    const slots = []; const k = 1 + rnd(12);
    for (let i = 0; i < k; i++) slots.push([ids[rnd(ids.length)], 1 + rnd(99)]);
    const rows = buildHarvestRows(inv(slots));
    for (const key of KEYS) for (const dir of ["asc", "desc"]) assert.deepStrictEqual(names(insertionSortHarvest(rows, key, dir)), reference(rows, key, dir), `${key} ${dir} ${JSON.stringify(slots)}`);
  }
});
test("already-sorted input stays sorted (best case) and reversed input gets fixed (worst case)", () => {
  const rows = buildHarvestRows(inv(Object.keys(CROPS).map((id, i) => [id, i + 1])));
  const asc = insertionSortHarvest(rows, "quantity", "asc");
  assert.deepStrictEqual(names(insertionSortHarvest(asc, "quantity", "asc")), names(asc));
  assert.deepStrictEqual(names(insertionSortHarvest(rows, "quantity", "desc")), names(rows).slice().reverse());
});
test("sorting works on a copy: the input list and its row objects are not reordered or changed", () => {
  const rows = buildHarvestRows(mixed()); const before = JSON.stringify(rows); const first = rows[0];
  const out = insertionSortHarvest(rows, "total", "desc");
  assert.notStrictEqual(out, rows);
  assert.strictEqual(JSON.stringify(rows), before);
  assert.strictEqual(rows[0], first);
});
test("the real backpack, hotbar, selected slot and capacity are unchanged by building and sorting", () => {
  const g = new GardenGame();
  g.inventory = mixed(); g.selected = 3;
  const before = snapshot(g.inventory), size = g.inventory.size, used = g.inventory.usedSlots();
  for (const key of KEYS) for (const dir of ["asc", "desc"]) sortedHarvestRows(g.inventory, key, dir);
  assert.strictEqual(snapshot(g.inventory), before, "slot order and quantities identical");
  assert.strictEqual(g.inventory.size, size); assert.strictEqual(g.inventory.usedSlots(), used);
  assert.strictEqual(g.selected, 3);
  assert.deepStrictEqual(g.inventory.slots.slice(0, 8).map((s) => s && s.id), ["shears", "tomato-seed", "rose", "carrot", null, "daisy", "tomato", "carrot"], "hotbar order");
  assert.strictEqual(g.inventory.slots[3].qty, 10); assert.strictEqual(g.inventory.slots[7].qty, 5);
});
test("saves hold no sort state or sorted rows (Phase 4 added only the optional harvests field)", () => {
  const g = new GardenGame(); g.inventory = mixed();
  const save = g.toJSON(); const text = JSON.stringify(save);
  assert.deepStrictEqual(Object.keys(save).sort(), ["grid", "harvests", "inv", "location", "player", "selected", "time", "v"]);
  assert.ok(!/unitValue|totalValue|growMinutes|sortKey|direction/i.test(text));
  sortedHarvestRows(g.inventory, "name", "asc");
  assert.strictEqual(JSON.stringify(g.toJSON()), text);
});
test("the view follows the inventory: harvest, sell, drop and eat change the rows", () => {
  const g = new GardenGame(); g.clock = () => g._now; g._now = 1_800_000_000_000; g.player.coins = 999;
  const rowsOf = () => buildHarvestRows(g.inventory).map((r) => [r.cropId, r.quantity]);
  assert.deepStrictEqual(rowsOf(), []);
  g.inventory.add("carrot", 4); g.inventory.add("daisy", 2);
  assert.deepStrictEqual(rowsOf(), [["carrot", 4], ["daisy", 2]]);
  g.inventory.add("carrot", 3);
  assert.deepStrictEqual(rowsOf(), [["carrot", 7], ["daisy", 2]]);
  g.inventory.remove("carrot", 7);
  assert.deepStrictEqual(rowsOf(), [["daisy", 2]]);
  g.inventory.removeFromSlot(g.inventory.slots.findIndex((s) => s && s.id === "daisy"), 2);
  assert.deepStrictEqual(rowsOf(), []);
});
test("unknown sort key or direction is rejected, not silently ignored", () => {
  const rows = buildHarvestRows(mixed());
  assert.throws(() => insertionSortHarvest(rows, "color", "asc"), /Unknown sort key/);
  assert.throws(() => insertionSortHarvest(rows, "name", "sideways"), /Unknown direction/);
});
test("the sort code itself does not call sort() or toSorted()", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
  const start = src.indexOf("5b. HARVEST INVENTORY SORT"), end = src.indexOf("6. PLAYER  (energy");
  const code = src.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(!/\.sort\s*\(|toSorted\s*\(/.test(code), "no sort()/toSorted() in section 5b code");
});

console.log(`\n${passed} inventory-sort tests passed`);
