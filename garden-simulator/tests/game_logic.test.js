/* Game-logic regression tests (graph/BFS, inventory, growth, undo, trees, BST, deque...).
   Run from the project folder:  node tests/game_logic.test.js   (or all tests: node tests/run_all.js) */
const assert = require("assert");
const path = require("path");
const G = require(path.join(__dirname, "..", "script.js"));
const { GardenGame, GardenGrid, Inventory, WorldGraph, CROPS, ITEMS, STAGE } = G;
let n = 0; const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

t("graph BFS shortest path", () => {
  const g = new GardenGame();
  assert.deepStrictEqual(g.world.shortestPath("market", "roots").length, 3);
  assert.deepStrictEqual(g.world.shortestPath("meadow", "meadow"), ["meadow"]);
  assert.strictEqual(new WorldGraph().shortestPath("a", "b"), null);
});
t("inventory stacking / full / swap", () => {
  const inv = new Inventory(3);
  assert.strictEqual(inv.add("carrot", 150), 0);            // 99 + 51
  assert.strictEqual(inv.slots[0].qty, 99);
  assert.strictEqual(inv.add("shears", 1), 0);
  assert.strictEqual(inv.add("can", 1), 1);                 // full
  inv.swap(0, 2); assert.strictEqual(inv.slots[2].id, "carrot");
});
const MIN = 60000;
const clocked = () => { const g = new GardenGame(); g.clock = () => g.t; g.t = 1_000_000_000_000; return g; };
t("growMinutes formula from unlock level", () => {
  const want = { 1: 3, 2: 5, 3: 7, 4: 9, 5: 11 };
  Object.values(CROPS).forEach((c) => assert.strictEqual(c.growMinutes, want[c.level]));
  assert.strictEqual(CROPS.daisy.growMinutes, 3); assert.strictEqual(CROPS.rose.growMinutes, 11);
});
t("real-time: daisy matures 3 min after watering (no sleep)", () => {
  const g = clocked(); g.selectSlot(2); assert.ok(g.useOnTile(0, 0).ok);
  assert.strictEqual(g.grid.readyAt.Flowers[0][0], null);
  g.t += 60 * MIN; g.refreshGrowth();                       // thirsty: never grows
  assert.strictEqual(g.grid.getStage(0, 0), STAGE.SEED);
  g.selectSlot(1); const w0 = g.t; assert.ok(g.useOnTile(0, 0).ok);
  assert.strictEqual(g.grid.wateredAt.Flowers[0][0], w0);
  assert.strictEqual(g.grid.readyAt.Flowers[0][0], w0 + 3 * MIN);
  assert.ok(!g.useOnTile(0, 0).ok);                         // not thirsty any more
  g.t = w0 + 0.2 * 3 * MIN; g.refreshGrowth(); assert.strictEqual(g.grid.getStage(0, 0), STAGE.SEED);       // < 25%
  g.t = w0 + 0.25 * 3 * MIN; g.refreshGrowth(); assert.strictEqual(g.grid.getStage(0, 0), STAGE.GROWING);   // 25%
  g.t = w0 + 3 * MIN - 1; g.refreshGrowth(); assert.strictEqual(g.grid.getStage(0, 0), STAGE.GROWING);
  g.selectSlot(0); const early = g.useOnTile(0, 0); assert.ok(!early.ok && /left/.test(early.msg));
  g.t = w0 + 3 * MIN; const r = g.refreshGrowth(); assert.strictEqual(r.matured, 1);
  assert.strictEqual(g.grid.getStage(0, 0), STAGE.MATURE);
  assert.ok(g.useOnTile(0, 0).ok); assert.strictEqual(g.inventory.count("daisy"), 1); assert.ok(g.player.xp > 0);
});
t("sleep does not mature plants, still refills energy / clears undo", () => {
  const g = clocked(); g.selectSlot(2); g.useOnTile(1, 1); g.selectSlot(1); g.useOnTile(1, 1);
  g.player.energy = 3; const day = g.time.dayCounter;
  g.sleep(); g.sleep();
  assert.strictEqual(g.time.dayCounter, day + 2); assert.strictEqual(g.player.energy, g.player.maxEnergy);
  assert.ok(g.stack.isEmpty()); assert.notStrictEqual(g.grid.getStage(1, 1), STAGE.MATURE);
});
t("higher level crops take longer; other gardens grow too", () => {
  const g = clocked(); g.travel("roots"); g.player.level = 4;
  g.inventory.add("beet-seed", 1); const slot = g.inventory.slots.findIndex((s) => s && s.id === "beet-seed");
  g.selectSlot(slot < 8 ? slot : 7); if (slot >= 8) g.inventory.swap(slot, 7);
  g.useOnTile(0, 0); g.selectSlot(1); g.useOnTile(0, 0);
  assert.strictEqual(g.grid.readyAt["Root Crops"][0][0] - g.grid.wateredAt["Root Crops"][0][0], 9 * MIN);
  g.travel("meadow"); g.t += 9 * MIN; g.refreshGrowth();
  assert.strictEqual(g.grid.getStage(0, 0, "Root Crops"), STAGE.MATURE);
});
t("growth survives save/reload by timestamps", () => {
  const g = clocked(); g.selectSlot(2); g.useOnTile(0, 0); g.selectSlot(1); g.useOnTile(0, 0);
  const saved = JSON.parse(JSON.stringify(g.toJSON()));
  const h = clocked(); h.t = g.t + 10 * MIN; assert.ok(h.loadJSON(saved));      // "closed the tab" for 10 minutes
  assert.strictEqual(h.grid.getStage(0, 0), STAGE.MATURE);
  const k = clocked(); k.t = g.t + 1.5 * MIN; k.loadJSON(saved);
  assert.strictEqual(k.grid.getStage(0, 0), STAGE.GROWING);
  assert.ok(Math.abs(k.grid.remainingMs(0, 0, "Flowers", k.t) - 1.5 * MIN) < 5);
});
t("old save (no readyAt) loads: thirsty stays thirsty, watered continues by stage", () => {
  const g = clocked(); const m = () => Array.from({ length: 10 }, () => Array(10).fill(0));
  const old = g.toJSON(); delete old.grid.wateredAt; delete old.grid.readyAt;
  old.grid.plantIds.Flowers[0][0] = "daisy"; old.grid.stages.Flowers[0][0] = 1; old.grid.thirsty.Flowers[0][0] = true;
  old.grid.plantIds.Flowers[0][1] = "daisy"; old.grid.stages.Flowers[0][1] = 1; old.grid.thirsty.Flowers[0][1] = false;
  old.grid.plantIds.Flowers[0][2] = "daisy"; old.grid.stages.Flowers[0][2] = 2; old.grid.thirsty.Flowers[0][2] = false;
  old.grid.plantIds.Flowers[0][3] = "daisy"; old.grid.stages.Flowers[0][3] = 3; old.grid.thirsty.Flowers[0][3] = false;
  old.grid.ages = { Flowers: m(), "Root Crops": m(), "Vegetables/Fruits": m() };
  assert.ok(g.loadJSON(old)); const G_ = g.grid;
  assert.ok(G_.isThirsty(0, 0)); assert.strictEqual(G_.readyAt.Flowers[0][0], null);
  assert.strictEqual(G_.getStage(0, 1), STAGE.SEED); assert.strictEqual(G_.remainingMs(0, 1, "Flowers", g.t), 3 * MIN);
  assert.strictEqual(G_.getStage(0, 2), STAGE.GROWING); assert.strictEqual(G_.remainingMs(0, 2, "Flowers", g.t), 1.5 * MIN);
  assert.strictEqual(G_.getStage(0, 3), STAGE.MATURE);
  g.t += 3 * MIN; g.refreshGrowth(); assert.strictEqual(G_.getStage(0, 3), STAGE.MATURE);   // ripe stays ripe
  assert.strictEqual(G_.getStage(0, 1), STAGE.MATURE); assert.strictEqual(G_.getStage(0, 0), STAGE.SEED);
});
t("undo of watering restores thirsty state", () => {
  const g = clocked(); g.selectSlot(2); g.useOnTile(0, 0); g.selectSlot(1); g.useOnTile(0, 0);
  assert.ok(g.undo().ok); assert.ok(g.grid.isThirsty(0, 0)); assert.strictEqual(g.grid.readyAt.Flowers[0][0], null);
});
t("unwatered seed does not grow", () => {
  const g = clocked(); g.selectSlot(2); g.useOnTile(1, 1);
  g.t += 100 * MIN; g.refreshGrowth(); g.sleep();
  assert.strictEqual(g.grid.getStage(1, 1), STAGE.SEED);
});
t("wrong garden / wrong crop refused", () => {
  const g = new GardenGame(); g.selectSlot(3);              // carrot seed in meadow
  assert.ok(!g.useOnTile(0, 0).ok);
});
t("undo restores everything", () => {
  const g = new GardenGame(); const before = g.snapshot();
  g.selectSlot(2); g.useOnTile(0, 0);
  assert.ok(g.undo().ok); assert.strictEqual(g.snapshot(), before);
  assert.ok(!g.undo().ok);
});
t("energy runs out, eating refills", () => {
  const g = new GardenGame(); g.player.energy = 0; g.selectSlot(2);
  assert.ok(g.useOnTile(0, 0).tired);
  g.inventory.add("carrot", 1);
  const i = g.inventory.slots.findIndex((s) => s && s.id === "carrot");
  assert.ok(g.eat(i).ok); assert.strictEqual(g.player.energy, ITEMS.carrot.food);
});
t("market: only at market, buy/sell, level lock", () => {
  const g = new GardenGame();
  assert.ok(!g.buy("daisy-seed").ok);
  assert.ok(g.travel("market").ok);
  const c = g.player.coins; assert.ok(g.buy("daisy-seed", 2).ok); assert.strictEqual(g.player.coins, c - 10);
  assert.ok(!g.buy("rose-seed").ok);                        // level 5
  g.inventory.add("rose", 2); assert.ok(g.sellAllCrops().ok);
  assert.strictEqual(g.player.coins, c - 10 + 140);
  g.player.coins = 0; assert.ok(!g.buy("daisy-seed").ok);
});
t("travel route + same place", () => {
  const g = new GardenGame();
  const r = g.travel("orchard"); assert.deepStrictEqual(r.route.length, 3);
  assert.ok(!g.travel("orchard").ok);
  assert.strictEqual(g.grid.activePlot, "Vegetables/Fruits");
});
t("backpack full blocks harvest", () => {
  const g = new GardenGame();
  g.grid.plantSeed(0, 0, "daisy", "Flowers"); g.grid.stages.Flowers[0][0] = STAGE.MATURE;
  g.inventory.slots = g.inventory.slots.map((_, i) => (i < 8 ? g.inventory.slots[i] : { id: "carrot", qty: 99 }));
  g.inventory.slots[3] = { id: "carrot", qty: 99 }; g.inventory.slots[4] = { id: "carrot", qty: 99 };
  g.inventory.slots[5] = { id: "carrot", qty: 99 }; g.inventory.slots[6] = { id: "carrot", qty: 99 }; g.inventory.slots[7] = { id: "carrot", qty: 99 };
  g.inventory.slots[2] = { id: "carrot", qty: 99 }; g.selectSlot(0);
  const r = g.useOnTile(0, 0); assert.ok(!r.ok && r.full);
});
t("level up", () => { const g = new GardenGame(); assert.strictEqual(g.player.addXp(30), 1); assert.strictEqual(g.player.level, 2); });
t("save/load roundtrip", () => {
  const g = new GardenGame(); g.selectSlot(2); g.useOnTile(2, 2); g.travel("roots"); g.sleep();
  const h = new GardenGame(); assert.ok(h.loadJSON(JSON.parse(JSON.stringify(g.toJSON()))));
  assert.strictEqual(h.snapshot(), g.snapshot());
  assert.ok(!h.loadJSON({ v: 1 }));
});
console.log(n, "tests passed");
