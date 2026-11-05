"use strict";

/* =============================================================================
script.js  --  Pixel Garden Simulator
PHASE 2: Harvesting, Inventory, Market & World Map
(Phase 1 foundation is still here: grid, linked list, stack.)

Contents
  1. Constants, crops, items & world data
  2. GardenGrid          (3 plots of 10x10: plants have an age and get thirsty; also keeps a hash index of planted tiles)
  3. Linked List         (circular doubly linked list: seasons + day/night)
  4. ActionStack         (LIFO history; every entry remembers how to undo itself)
  5. Inventory           (backpack: an array of item slots; first 8 = hotbar)
  5b. Harvest Inventory Sort (display only: merge crop stacks, Insertion Sort a copy)
  6. Player              (energy, coins, farming XP and level)
  6b. Deque              (double-ended queue: the travel Back history)
  6c. PlantHashTable     (separate-chaining hash table; GardenGrid uses it as an index of occupied tiles)
  6d. SeasonHarvestTracker (data only: harvest totals per season occurrence, with an archive)
  6e. Season Rankings    (Merge Sort on copied records: rank crops within one season)
  7. WorldGraph          (the map: places + roads, shortest route with BFS)
  8. GardenGame          (all the rules: plant, water, harvest, eat, buy, sell, travel)
  9. GardenUI            (HUD, hotbar, backpack, map, market, characters, scene)
  10. Start-up
  Requires pixel-art.js to be loaded first (global `PixelArt`).
============================================================================= */


/* =============================================================================
  1. CONSTANTS, CROPS, ITEMS & WORLD DATA
============================================================================= */

const GRID_SIZE = 10;

// Plant growth stages
const STAGE = { EMPTY: 0, SEED: 1, GROWING: 2, MATURE: 3 };
const STAGE_NAMES = ["Empty", "Seed", "Growing", "Mature"];
const STAGE_SYMBOLS = [".", "🌱", "🌿", "🌸"]; // same symbols as the Python version

// The three garden plots
const PLOT_NAMES = ["Flowers", "Root Crops", "Vegetables/Fruits"];
const TRAVERSAL_DELAY_MS = 500;   // pause between highlighted nodes in the Crop Guide's Tree View
const CROP_PLOT_EMOJI = { "Flowers": "🌸", "Root Crops": "🥕", "Vegetables/Fruits": "🍅" };   // Crop Guide headings

// Time settings
const DAYS_PER_SEASON = 7;
const SEASONS = ["Spring", "Summer", "Autumn", "Winter"];
const DAY_PHASES = ["Day", "Night"];
const SEASON_ICONS = { Spring: "🌼", Summer: "🌻", Autumn: "🍂", Winter: "❄️" };
const PHASE_ICONS = { Day: "🌞", Night: "🌙" };
const SEASON_MASCOTS = { Spring: "lian", Summer: "lemon", Autumn: "cocoa", Winter: "mochi" };

// Real-time growth: a watered plant ripens after growMinutes (3 min for level-1 crops, +2 min per level).
const MS_PER_MINUTE = 60000;
const growMinutesForLevel = (level) => 3 + (level - 1) * 2;
const SEED_STAGE_SHARE = 0.25;   // Seed stage = first 25% of the growth time, then Growing until ripe

// Player settings
const DEFAULT_GARDENER = "pinky";      // the player's starting gardener
const SAVE_KEY = "pixel-garden-save-v2";
const BACKPACK_SLOTS = 24;             // the first HOTBAR_SLOTS of them are the hotbar
const HOTBAR_SLOTS = 8;
const MAX_LEVEL = 10;
const START_COINS = 40;
const ENERGY_COST = { plant: 1, water: 1, harvest: 1 };

/**
 * Every crop in the game.
 *   plot       which garden it grows in          level     farming level needed to buy its seeds
 *   seedPrice  coins to buy one seed             sellPrice coins you get for one harvested crop
 *   growMinutes minutes after watering until ripe (worked out below from `level`)
 *   yield      crops you get per harvest
 *   xp         farming XP per harvest            food      energy restored when eaten (0 = not edible)
 * A seed does not grow until it is watered. Growth then runs in real time, even while you are away.
 */
const CROPS = {
  daisy:      { name: "Daisy",      plot: "Flowers",           level: 1, seedPrice: 5,  sellPrice: 12, yield: 1, xp: 5,  food: 0 },
  tulip:      { name: "Tulip",      plot: "Flowers",           level: 2, seedPrice: 8,  sellPrice: 20, yield: 1, xp: 8,  food: 0 },
  sunflower:  { name: "Sunflower",  plot: "Flowers",           level: 3, seedPrice: 12, sellPrice: 30, yield: 1, xp: 12, food: 0 },
  rose:       { name: "Rose",       plot: "Flowers",           level: 5, seedPrice: 25, sellPrice: 70, yield: 1, xp: 22, food: 0 },
  carrot:     { name: "Carrot",     plot: "Root Crops",        level: 1, seedPrice: 4,  sellPrice: 5,  yield: 2, xp: 5,  food: 3 },
  radish:     { name: "Radish",     plot: "Root Crops",        level: 2, seedPrice: 6,  sellPrice: 8,  yield: 2, xp: 8,  food: 3 },
  potato:     { name: "Potato",     plot: "Root Crops",        level: 3, seedPrice: 10, sellPrice: 13, yield: 2, xp: 12, food: 5 },
  beet:       { name: "Beet",       plot: "Root Crops",        level: 4, seedPrice: 16, sellPrice: 22, yield: 2, xp: 18, food: 4 },
  tomato:     { name: "Tomato",     plot: "Vegetables/Fruits", level: 1, seedPrice: 5,  sellPrice: 6,  yield: 2, xp: 6,  food: 4 },
  cabbage:    { name: "Cabbage",    plot: "Vegetables/Fruits", level: 2, seedPrice: 8,  sellPrice: 10, yield: 2, xp: 8,  food: 4 },
  strawberry: { name: "Strawberry", plot: "Vegetables/Fruits", level: 3, seedPrice: 14, sellPrice: 17, yield: 2, xp: 13, food: 5 },
  eggplant:   { name: "Eggplant",   plot: "Vegetables/Fruits", level: 4, seedPrice: 18, sellPrice: 26, yield: 2, xp: 18, food: 6 },
};

// growMinutes = 3 + (level - 1) * 2  ->  level 1: 3 min, 2: 5, 3: 7, 4: 9, 5: 11
Object.values(CROPS).forEach((c) => { c.growMinutes = growMinutesForLevel(c.level); });

/** "2m 14s" / "45s" - used for the remaining-time labels. */
function formatDuration(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60), sec = total % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

/** Where each place is on the world map (x, y in % of the map) and who looks after it. */
const LOCATIONS = {
  meadow:  { id: "meadow",  name: "Flower Meadow",  kind: "garden", plot: "Flowers",           keeper: "daisy",  role: "Flower Keeper", x: 22, y: 28,
            hello: "Welcome to the Flower Meadow! Daisies, tulips, sunflowers and roses grow best here." },
  roots:   { id: "roots",   name: "Root Field",     kind: "garden", plot: "Root Crops",        keeper: "moss",   role: "Root Keeper",   x: 75, y: 27,
            hello: "Mind the soil! Carrots, radishes, potatoes and beets grow in my field." },
  orchard: { id: "orchard", name: "Orchard Garden", kind: "garden", plot: "Vegetables/Fruits", keeper: "fraise", role: "Fruit Keeper",  x: 76, y: 74,
            hello: "Hello! Tomatoes, cabbages, strawberries and eggplants love it here." },
  market:  { id: "market",  name: "Market Square",  kind: "market", plot: null,                keeper: "woolly", role: "Seed Merchant", x: 24, y: 73,
            hello: "Fresh seeds for sale, and I'll buy your harvest at a fair price!" },
};
// The roads between places. Meadow <-> Orchard and Roots <-> Market take two stops.
const ROADS = [["meadow", "roots"], ["roots", "orchard"], ["orchard", "market"], ["market", "meadow"]];
const START_LOCATION = "meadow";
const MAX_TRAVEL_HISTORY = 5;   // how many previous places the Back button remembers
const GARDEN_FOR_PLOT = {};
Object.values(LOCATIONS).forEach((l) => { if (l.plot) GARDEN_FOR_PLOT[l.plot] = l; });

/** Every item you can hold: two tools, plus a seed and a harvested crop for each crop. */
const ITEMS = {
  shears: { id: "shears", name: "Shears", type: "tool", stack: 1, sell: 0, food: 0,
            desc: "Harvest ripe crops. Costs 1 energy." },
  can:    { id: "can", name: "Watering Can", type: "tool", stack: 1, sell: 0, food: 0,
            desc: "Water thirsty plants so they can grow. Costs 1 energy." },
};
Object.entries(CROPS).forEach(([id, c]) => {
  ITEMS[`${id}-seed`] = {
    id: `${id}-seed`, name: `${c.name} Seed`, type: "seed", crop: id, stack: 99, food: 0,
    sell: Math.floor(c.seedPrice / 2),
    desc: `Plant it in the ${GARDEN_FOR_PLOT[c.plot].name}. Ripe ${c.growMinutes} min after watering.`,
  };
  ITEMS[id] = {
    id, name: c.name, type: "crop", crop: id, stack: 99, sell: c.sellPrice, food: c.food,
    desc: c.food ? `Sells for ${c.sellPrice}. Eat it to restore ${c.food} energy.` : `Sells for ${c.sellPrice}. Too pretty to eat!`,
  };
});

const seedIdOf = (cropId) => `${cropId}-seed`;
const xpForLevel = (level) => 30 * level; // XP needed to go from `level` to `level + 1`


/* =============================================================================
  2. GARDEN GRID  (2D matrix, 3 plots, view switching, flat-index helper)
    Phase 2: plants get thirsty. Real-time growth: watering stamps wateredAt / readyAt (Date.now()).
============================================================================= */

class GardenGrid {
  constructor() {
    const matrix = (fill) => Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(fill));
    this.stages = {};     // plot name -> 10x10 matrix of stage numbers (0-3)
    this.plantIds = {};   // plot name -> 10x10 matrix of crop ids (or null)
    this.wateredAt = {};  // plot name -> 10x10 matrix of Date.now() when watered (or null)
    this.readyAt = {};    // plot name -> 10x10 matrix of Date.now() when ripe (or null)
    this.thirsty = {};    // plot name -> 10x10 matrix of booleans
    PLOT_NAMES.forEach((name) => {
      this.stages[name] = matrix(STAGE.EMPTY);
      this.plantIds[name] = matrix(null);
      this.wateredAt[name] = matrix(null);
      this.readyAt[name] = matrix(null);
      this.thirsty[name] = matrix(false);
    });
    this.activeIndex = 0;

    // PLANT INDEX (a hash table). The 2D arrays above are the real garden and stay the single source of truth for
    // stage, thirst and timestamps. This table only remembers WHICH tiles are occupied and with which crop, as small
    // { cropId, plot, row, col } records. It is never saved: it is rebuilt from the arrays (see rebuildIndex).
    // Note: the arrays already give direct access by [row][col]. The index is an extra lookup structure that this
    // project adds to practise hashing; it is not claimed to be faster than reading the arrays directly.
    this.plantIndex = new PlantHashTable();
  }

  // ---- Flat-index helpers ---------------------------------------------------
  /** (row, col) -> flat index  (row * 10 + col) */
  // Time: O(1) — one multiply and one add.
  static toFlat(row, col) {
    return row * GRID_SIZE + col;
  }

  /** flat index -> [row, col] */
  // Time: O(1) — one division and one remainder.
  static fromFlat(index) {
    return [Math.floor(index / GRID_SIZE), index % GRID_SIZE];
  }

  static inBounds(row, col) {
    return (
      Number.isInteger(row) && Number.isInteger(col) &&
      row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE
    );
  }

  /** Growth stage from the timestamps: Seed 0-25%, Growing 25-99%, Mature at 100% (or once past readyAt). */
  static stageAt(wateredAt, readyAt, now) {
    if (wateredAt === null || readyAt === null) return STAGE.SEED;
    if (now >= readyAt) return STAGE.MATURE;
    const progress = (now - wateredAt) / (readyAt - wateredAt);
    return progress >= SEED_STAGE_SHARE ? STAGE.GROWING : STAGE.SEED;
  }

  // ---- View switching -------------------------------------------------------
  get activePlot() {
    return PLOT_NAMES[this.activeIndex];
  }

  /** Switch view by index (0-2) or by plot name. Returns true on success. */
  switchPlot(target) {
    if (Number.isInteger(target) && target >= 0 && target < PLOT_NAMES.length) {
      this.activeIndex = target;
      return true;
    }
    if (typeof target === "string") {
      const i = PLOT_NAMES.findIndex((n) => n.toLowerCase() === target.toLowerCase());
      if (i !== -1) {
        this.activeIndex = i;
        return true;
      }
    }
    return false;
  }

  /** Move to the next (+1) or previous (-1) plot, wrapping around. */
  cyclePlot(step = 1) {
    const n = PLOT_NAMES.length;
    this.activeIndex = (this.activeIndex + step + n) % n;
    return this.activePlot;
  }

  // ---- Cell access ----------------------------------------------------------
  // Time: O(1) — direct array index lookup.
  getStage(row, col, plot = this.activePlot) { return this.stages[plot][row][col]; }
  // Time: O(1) — direct array index lookup.
  getPlantId(row, col, plot = this.activePlot) { return this.plantIds[plot][row][col]; }
  // Time: O(1) — direct array index lookup.
  isThirsty(row, col, plot = this.activePlot) { return this.thirsty[plot][row][col]; }

  /** Milliseconds until the plant is ripe, or null if it hasn't been watered (or is empty). */
  // Time: O(1) — direct array index lookup.
  remainingMs(row, col, plot = this.activePlot, now = Date.now()) {
    const ready = this.readyAt[plot][row][col];
    if (ready === null || this.stages[plot][row][col] === STAGE.EMPTY) return null;
    return Math.max(0, ready - now);
  }

  // ---- Farming actions ------------------------------------------------------
  /** Plant a seed in an empty, in-bounds cell. New seeds start out thirsty. */
  plantSeed(row, col, cropId, plot = this.activePlot) {
    if (!GardenGrid.inBounds(row, col) || !CROPS[cropId]) return false;
    if (this.stages[plot][row][col] !== STAGE.EMPTY) return false;
    this.stages[plot][row][col] = STAGE.SEED;
    this.plantIds[plot][row][col] = cropId;
    this.wateredAt[plot][row][col] = null;
    this.readyAt[plot][row][col] = null;
    this.thirsty[plot][row][col] = true;
    this.plantIndex.put(plot, row, col, cropId);   // keep the index in step: this tile is now occupied
    return true;
  }

  /** Water a thirsty, unripe plant: growth starts now and it will be ripe at readyAt. Returns true if it was thirsty. */
  water(row, col, plot = this.activePlot, now = Date.now()) {
    if (!GardenGrid.inBounds(row, col)) return false;
    const stage = this.stages[plot][row][col];
    if (stage === STAGE.EMPTY || stage === STAGE.MATURE || !this.thirsty[plot][row][col]) return false;
    this.thirsty[plot][row][col] = false;
    this.wateredAt[plot][row][col] = now;
    this.readyAt[plot][row][col] = now + CROPS[this.plantIds[plot][row][col]].growMinutes * MS_PER_MINUTE;
    this.stages[plot][row][col] = STAGE.SEED;
    return true;
  }

  /** Pick a ripe plant. Returns its crop id and leaves empty soil, or null if it isn't ripe. */
  harvest(row, col, plot = this.activePlot) {
    if (!GardenGrid.inBounds(row, col) || this.stages[plot][row][col] !== STAGE.MATURE) return null;
    const id = this.plantIds[plot][row][col];
    this.clearCell(row, col, plot);
    return id;
  }

  /** Make a tile empty soil again (used by harvest). The index entry for the tile is removed too.
   *  Time: O(1) for the arrays, plus the hash table's remove (O(1) on average). */
  clearCell(row, col, plot = this.activePlot) {
    this._resetCell(row, col, plot);
    this.plantIndex.remove(plot, row, col);
  }

  /** Reset one tile's array values to "empty" WITHOUT touching the index. loadJSON uses this for every tile and then
   *  rebuilds the whole index once at the end, which avoids hundreds of one-by-one index removals. */
  _resetCell(row, col, plot) {
    this.stages[plot][row][col] = STAGE.EMPTY;
    this.plantIds[plot][row][col] = null;
    this.wateredAt[plot][row][col] = null;
    this.readyAt[plot][row][col] = null;
    this.thirsty[plot][row][col] = false;
  }

  // ---- The plant index (hash table) -----------------------------------------------
  // How it stays correct: every place that fills a tile (plantSeed) or empties one (clearCell, which harvest uses)
  // updates the index right away, and loadJSON (used by Undo and by loading a save) rebuilds it from the arrays.
  // Collisions (two tiles landing in the same bucket) are handled inside PlantHashTable by chaining.
  // Limitation for future expansion: the index validates plots and coordinates with PLOT_NAMES and GRID_SIZE (through
  // GardenGrid.inBounds), so it follows those constants automatically if they change; but its keys are text like
  // "Flowers|3|7", so a future plot name must not contain the "|" character.

  /** Look a tile up in the index. Returns null for empty soil, otherwise the CURRENT plant details: the crop id comes
   *  from the index and stage, thirst and time left are read from the grid arrays (nothing is copied into the index).
   *  Time: O(1) average (one hash lookup plus array reads).  Space: O(1). */
  inspectCell(row, col, plot = this.activePlot, now = Date.now()) {
    const entry = this.plantIndex.get(plot, row, col);
    if (!entry) return null;
    return {
      cropId: entry.cropId,
      stage: this.getStage(row, col, plot),
      thirsty: this.isThirsty(row, col, plot),
      remainingMs: this.remainingMs(row, col, plot, now),
    };
  }

  /** Throw the index away and rebuild it from the arrays: only occupied tiles are added.
   *  Time: O(P x R x C) to scan every tile (300 here), plus O(1) average per put (the table doubles as needed).
   *  Space: O(n) for the n occupied tiles. */
  rebuildIndex() {
    this.plantIndex.clear();
    PLOT_NAMES.forEach((plot) => {
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          const id = this.plantIds[plot][r][c];
          if (id && this.stages[plot][r][c] !== STAGE.EMPTY) this.plantIndex.put(plot, r, c, id);
        }
      }
    });
  }

  /** Read-only numbers about the index for the "Hash Index Details" panel (a plain copy, not the table itself). */
  indexStats() { return this.plantIndex.stats(); }

  /** Does the index describe exactly the occupied tiles of the arrays? (Used by the tests and for checking.)
   *  Time: O(P x R x C) average.  Space: O(1). */
  indexMatchesGrid() {
    let occupied = 0;
    for (const plot of PLOT_NAMES) {
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          const id = this.plantIds[plot][r][c], entry = this.plantIndex.get(plot, r, c);
          if (this.stages[plot][r][c] === STAGE.EMPTY) { if (entry || id) return false; continue; }
          occupied++;
          if (!entry || entry.cropId !== id) return false;
        }
      }
    }
    return occupied === this.plantIndex.size;
  }

  // ---- Growth (real time) -----------------------------------------------------
  /**
   * Compare every watered plant in all 3 plots with `now` and update its stage
   * (Seed -> Growing -> Mature). Thirsty (unwatered) plants never change.
   * Returns the cells whose stage changed: [{ plot, row, col, from, to }].
   */
  // Time: O(P × R × C) — checks every garden tile: O(n) for n tiles (3 × 10 × 10 = 300 in this game).
  // Space: O(c) — only the c tiles whose stage changed are stored.
  refresh(now = Date.now()) {
    const changes = [];
    PLOT_NAMES.forEach((plot) => {
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          const from = this.stages[plot][r][c];
          if (from === STAGE.EMPTY || from === STAGE.MATURE || this.thirsty[plot][r][c]) continue;
          const to = GardenGrid.stageAt(this.wateredAt[plot][r][c], this.readyAt[plot][r][c], now);
          if (to !== from) {
            this.stages[plot][r][c] = to;
            changes.push({ plot, row: r, col: c, from, to });
          }
        }
      }
    });
    return changes;
  }

  // ---- Summaries ------------------------------------------------------------
  countPlants(plot = this.activePlot) {
    return this.stages[plot].flat().filter((s) => s !== STAGE.EMPTY).length;
  }

  /** { planted, ready, thirsty } for one plot - used by the world map badges. */
  stats(plot = this.activePlot) {
    const flat = (m) => m[plot].flat();
    const stages = flat(this.stages), thirsty = flat(this.thirsty);
    return {
      planted: stages.filter((s) => s !== STAGE.EMPTY).length,
      ready: stages.filter((s) => s === STAGE.MATURE).length,
      thirsty: thirsty.filter(Boolean).length,
    };
  }

  // ---- Saving ---------------------------------------------------------------
  toJSON() {
    return JSON.parse(JSON.stringify({
      stages: this.stages, plantIds: this.plantIds, thirsty: this.thirsty,
      wateredAt: this.wateredAt, readyAt: this.readyAt,
    }));
  }

  /**
   * Load a saved grid. Anything that doesn't look right is ignored, so a bad save can't break the game.
   * Older saves have no wateredAt/readyAt: thirsty plants stay thirsty, and watered plants carry on
   * from their saved stage (Seed = just watered, Growing = half way, Mature = ripe).
   */
  loadJSON(data, now = Date.now()) {
    if (!data) return;
    const okMatrix = (m) => Array.isArray(m) && m.length === GRID_SIZE &&
      m.every((row) => Array.isArray(row) && row.length === GRID_SIZE);
    const isTime = (v) => typeof v === "number" && Number.isFinite(v);
    PLOT_NAMES.forEach((plot) => {
      if (!["stages", "plantIds", "thirsty"].every((f) => data[f] && okMatrix(data[f][plot]))) return;
      const hasTimes = data.wateredAt && okMatrix(data.wateredAt[plot]) && data.readyAt && okMatrix(data.readyAt[plot]);
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          const id = data.plantIds[plot][r][c];
          if (!id || !CROPS[id] || CROPS[id].plot !== plot) { this._resetCell(r, c, plot); continue; }
          const savedStage = Number(data.stages[plot][r][c]);
          const ripe = savedStage === STAGE.MATURE;
          const thirsty = !ripe && !!data.thirsty[plot][r][c];
          const total = CROPS[id].growMinutes * MS_PER_MINUTE;
          let w = hasTimes ? data.wateredAt[plot][r][c] : null;
          let rd = hasTimes ? data.readyAt[plot][r][c] : null;
          if (!(isTime(w) && isTime(rd) && rd > w)) { w = null; rd = null; }

          if (!thirsty && !ripe && w === null) {          // old save: watered, no timestamps
            w = savedStage === STAGE.GROWING ? now - total / 2 : now;
            rd = w + total;
          }
          this.plantIds[plot][r][c] = id;
          this.thirsty[plot][r][c] = thirsty;
          this.wateredAt[plot][r][c] = thirsty ? null : w;
          this.readyAt[plot][r][c] = thirsty ? null : rd;
          this.stages[plot][r][c] = ripe ? STAGE.MATURE : thirsty ? STAGE.SEED : GardenGrid.stageAt(w, rd, now);
        }
      }
    });
    this.rebuildIndex();   // the arrays changed (save, or Undo): rebuild the plant index once from them
  }
}


/* =============================================================================
   2b. GENERAL TREE  (crop hierarchy: root -> garden plot -> crop)
   ============================================================================= */

// One node of a general tree: any number of children, no fixed shape.
// Leaves point at the existing CROPS entry (cropId + data) instead of copying it.
class TreeNode {
  constructor(name, cropId = null, data = null) {
    this.name = name;
    this.cropId = cropId;      // key in CROPS for leaf nodes, null for root / category nodes
    this.data = data;          // reference to CROPS[cropId] for leaves (not a copy)
    this.parent = null;
    this.children = [];
  }

  // Add a child under this node.
  // Time: O(1) - one push and one pointer assignment.  Space: O(1).
  addChild(node) {
    node.parent = this;
    this.children.push(node);
    return node;
  }

  // A leaf has no children.  Time: O(1).
  isLeaf() { return this.children.length === 0; }
}

// Organizes every crop in CROPS by garden plot:
//   Pixel Garden Crops
//   +-- Flowers            (Daisy, Tulip, Sunflower, Rose)
//   +-- Root Crops         (Carrot, Radish, Potato, Beet)
//   +-- Vegetables/Fruits  (Tomato, Cabbage, Strawberry, Eggplant)
class CropTree {
  constructor(crops = CROPS, plotNames = PLOT_NAMES) {
    this.root = new TreeNode("Pixel Garden Crops");
    this.categories = {};      // plot name -> category node, so insertion can find its parent directly
    this.build(crops, plotNames);
  }

  // Build the whole tree from the crop table.
  // Time: O(P + C) for P plots and C crops - each plot node and each crop is inserted once,
  //       and each insert is O(1) because the category is looked up in a hash map.
  // Space: O(P + C) nodes (leaves share the CROPS entries, so no crop data is duplicated).
  build(crops, plotNames) {
    plotNames.forEach((plot) => {
      this.categories[plot] = this.root.addChild(new TreeNode(plot));
    });
    Object.entries(crops).forEach(([id, crop]) => this.insertCrop(id, crop));
  }

  // Insert one crop as a leaf under its plot's category node.
  // Time: O(1) - hash lookup of the category plus one addChild.  Space: O(1).
  // Returns the new leaf, or null if the crop's plot has no category.
  insertCrop(cropId, crop = CROPS[cropId]) {
    const category = crop && this.categories[crop.plot];
    if (!category) return null;
    return category.addChild(new TreeNode(crop.name, cropId, crop));
  }

  // Preorder DFS: visit the current node first, then recursively visit each child (left to right).
  // Time: O(n) for n nodes - every node is visited exactly once.
  // Space: O(h) call-stack depth for tree height h (h = 3 here, so effectively O(1)).
  preorder(node = this.root, visit = () => {}) {
    if (!node) return;
    visit(node);
    node.children.forEach((child) => this.preorder(child, visit));
  }

  // Postorder DFS: recursively visit all children first, then the current node.
  // Time: O(n) - every node is visited exactly once.
  // Space: O(h) call-stack depth for tree height h.
  postorder(node = this.root, visit = () => {}) {
    if (!node) return;
    node.children.forEach((child) => this.postorder(child, visit));
    visit(node);
  }

  // Category summaries with postorder DFS: every crop leaf is visited first, then its category
  // adds up its children's totals, and the root adds up the categories last.
  // Returns a Map from each TreeNode to { count, seedTotal, xpTotal }. Crop data is only read, never changed.
  // Time: O(n) - postorder visits each node once and each node does O(1) work
  //       (a category's loop over its children adds O(1) per child, O(n) in total).
  // Space: O(n) for the Map, plus O(h) recursion depth.
  summarize() {
    const summaries = new Map();
    this.postorder(this.root, (node) => {
      if (node.isLeaf() && node.data) {
        summaries.set(node, { count: 1, seedTotal: node.data.seedPrice, xpTotal: node.data.xp });
        return;
      }
      const total = { count: 0, seedTotal: 0, xpTotal: 0 };
      node.children.forEach((child) => {          // children were already visited, so their totals exist
        const c = summaries.get(child);
        total.count += c.count; total.seedTotal += c.seedTotal; total.xpTotal += c.xpTotal;
      });
      summaries.set(node, total);
    });
    return summaries;
  }

  // Group the tree by level using bfs(): BFS reaches every node of one level before any node of the next,
  // so each visited node just goes into the bucket for its depth (parent's depth + 1).
  // Returns an array of levels, each an array of TreeNodes: [[root], [categories...], [crops...]].
  // Time: O(n) - bfs visits each node once and each visit does O(1) work (Map lookup, array push).
  // Space: O(n) for the buckets and the depth Map, plus the queue inside bfs().
  levels() {
    const depth = new Map();
    const result = [];
    this.bfs((node) => {
      const d = node.parent ? depth.get(node.parent) + 1 : 0;
      depth.set(node, d);
      (result[d] = result[d] || []).push(node);
    });
    return result;
  }

  // BFS level-order: visit the root, then every node one level at a time, using a queue.
  // The queue is an array walked with a head index, so dequeuing is O(1) (Array.shift would be O(n)).
  // Time: O(n) - every node is enqueued once and dequeued once.
  // Space: O(w) for the widest level w (at most O(n)).
  bfs(visit = () => {}) {
    const queue = [this.root];
    let head = 0;
    while (head < queue.length) {
      const node = queue[head++];            // dequeue
      visit(node);
      node.children.forEach((child) => queue.push(child));   // enqueue
    }
  }
}

/* =============================================================================
  2c. BINARY SEARCH TREE  (crop catalog, alphabetical by crop name)
============================================================================= */

// One BST node: the crop name is the key, smaller (alphabetically earlier) names go left, larger go right.
class BSTNode {
  constructor(name, data, cropId = null) {
    this.name = name;
    this.data = data;        // the crop's data (a copy, so editing the catalog never touches the game's CROPS)
    this.cropId = cropId;    // key in CROPS this node came from, when there is one
    this.left = null;
    this.right = null;
  }
}

// Crop catalog stored alphabetically by name. Built from the existing CROPS object.
class CropBST {
  constructor(crops = CROPS) {
    this.root = null;
    this.size = 0;
    this.build(crops);
  }

  // Names are compared ignoring upper/lower case, so "daisy" and "Daisy" are the same crop.
  static compare(a, b) {
    const x = String(a).toLowerCase(), y = String(b).toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  }

  // Insert every crop from the CROPS object, one at a time.
  // Time: O(n log n) average for n crops (n inserts of O(log n)), O(n^2) worst case.
  // Space: O(n) nodes.
  build(crops) {
    Object.entries(crops).forEach(([id, crop]) => this.insert(crop.name, { ...crop }, id));
  }

  // Standard BST insertion: earlier names go left, later names go right.
  // Time: O(log n) average, O(n) worst case (a lopsided tree is as deep as it has nodes).
  // Space: O(1) extra (iterative). Returns the new node, or null if the name already exists.
  insert(name, cropData, cropId = null) {
    const node = new BSTNode(name, cropData, cropId);
    if (!this.root) { this.root = node; this.size++; return node; }
    let cur = this.root;
    while (true) {
      const c = CropBST.compare(name, cur.name);
      if (c === 0) return null;                       // duplicate name: leave the tree alone
      const side = c < 0 ? "left" : "right";
      if (!cur[side]) { cur[side] = node; this.size++; return node; }
      cur = cur[side];
    }
  }

  // Standard BST search: go left for earlier names, right for later ones.
  // Time: O(log n) average, O(n) worst case.  Space: O(1) extra. Returns the node or null.
  search(name) {
    let cur = this.root;
    while (cur) {
      const c = CropBST.compare(name, cur.name);
      if (c === 0) return cur;
      cur = c < 0 ? cur.left : cur.right;
    }
    return null;
  }

  // Change a crop's data in place. The node is found, not rebuilt: its data object is mutated.
  // If changes.name is a different name, the node's BST position changes, so it is removed and reinserted.
  // Time: O(log n) average search + O(1) mutation, O(n) worst case. A rename adds a remove and an insert
  // (each O(log n) average, O(n) worst), which keeps the total at the same order.
  // Space: O(1) extra. Returns the updated node, or null if the crop is missing or the new name is taken.
  update(name, changes = {}) {
    const node = this.search(name);
    if (!node) return null;
    const { name: newName, ...rest } = changes;
    const renamed = newName !== undefined && CropBST.compare(newName, node.name) !== 0;
    if (renamed && this.search(newName)) return null;          // that name already belongs to another crop
    if (!renamed) {
      Object.assign(node.data, rest);                          // plain in-place mutation
      if (newName !== undefined) { node.name = newName; node.data.name = newName; }   // only the letter case changed
      return node;
    }
    const { data, cropId } = node;
    this.remove(node.name);
    Object.assign(data, rest, { name: newName });
    return this.insert(newName, data, cropId);
  }

  // Standard BST deletion (leaf, one child, or two children via the in-order successor).
  // Used by update() when a rename moves a node.
  // Time: O(log n) average, O(n) worst case.  Space: O(1) extra. Returns true if something was removed.
  remove(name) {
    let parent = null, cur = this.root;
    while (cur && CropBST.compare(name, cur.name) !== 0) {
      parent = cur;
      cur = CropBST.compare(name, cur.name) < 0 ? cur.left : cur.right;
    }
    if (!cur) return false;
    if (cur.left && cur.right) {                    // two children: copy the successor up, then remove it instead
      let sp = cur, succ = cur.right;
      while (succ.left) { sp = succ; succ = succ.left; }
      cur.name = succ.name; cur.data = succ.data; cur.cropId = succ.cropId;
      parent = sp; cur = succ;
    }
    const child = cur.left || cur.right;
    if (!parent) this.root = child;
    else if (parent.left === cur) parent.left = child;
    else parent.right = child;
    this.size--;
    return true;
  }

  // Inorder DFS: traverse the left subtree, visit the current node, then traverse the right subtree.
  // In a BST this gives the names in alphabetical order. Returns an array of crop names.
  // Time: O(n) - every node is visited once.
  // Space: O(h) call-stack depth for tree height h (O(log n) average, O(n) worst case), plus the O(n) result.
  inorder() {
    const names = [];
    const walk = (node) => {
      if (!node) return;
      walk(node.left);          // 1. left subtree
      names.push(node.name);    // 2. this node
      walk(node.right);         // 3. right subtree
    };
    walk(this.root);
    return names;
  }
}

/* =============================================================================
   3. CIRCULAR DOUBLY LINKED LIST  (Time & Seasons)
   ============================================================================= */

class ListNode {
  constructor(data) {
    this.data = data;
    this.next = this; // a lone node points at itself (circular)
    this.prev = this;
  }
}

class CircularDoublyLinkedList {
  constructor() {
    this.head = null;
    this.current = null; // movable pointer
    this.size = 0;
  }

  // Time: O(1) — the tail is found through head.prev, so no walking.
  append(data) {
    const node = new ListNode(data);
    if (this.head === null) {
      this.head = this.current = node;
    } else {
      const tail = this.head.prev;
      tail.next = node;
      node.prev = tail;
      node.next = this.head;
      this.head.prev = node;
    }
    this.size++;
  }

  // Time: O(1) — follow one next pointer.
  moveNext() {
    this.current = this.current.next;
    return this.current.data;
  }

  // Time: O(1) — follow one prev pointer.
  movePrev() {
    this.current = this.current.prev;
    return this.current.data;
  }

  // Time: O(1) — read the current node.
  currentData() {
    return this.current ? this.current.data : null;
  }

  /** Walk the pointer forward until it sits on `data` (used when loading a save). */
  // Time: O(n) — may walk all n nodes once.
  moveTo(data) {
    for (let i = 0; i < this.size && this.current.data !== data; i++) this.moveNext();
    return this.current.data === data;
  }

  // Time: O(n) — visits every node once.
  toArray() {
    const out = [];
    let node = this.head;
    for (let i = 0; i < this.size; i++) {
      out.push(node.data);
      node = node.next;
    }
    return out;
  }
}

/**
 * Tracks the day/night cycle and the seasons with two circular doubly linked lists.
 *   Day phases : Day <-> Night
 *   Seasons    : Spring -> Summer -> Autumn -> Winter -> (Spring ...)
 * `onNewDay(info)` is called every time a new day begins (the game uses it to refill energy).
 */
class TimeSystem {
  constructor(grid) {
    this.grid = grid;
    this.dayCounter = 1;
    this.daysIntoSeason = 1;
    this.onNewDay = null;
    this.onSeasonChange = null;   // called only when a new day really starts a new season (never on load or Undo)

    this.seasons = new CircularDoublyLinkedList();
    SEASONS.forEach((s) => this.seasons.append(s));

    this.phases = new CircularDoublyLinkedList();
    DAY_PHASES.forEach((p) => this.phases.append(p));
  }

  get season() {
    return this.seasons.currentData();
  }

  get phase() {
    return this.phases.currentData();
  }

  /**
   * Toggle Day <-> Night. Night -> Day starts a new day.
   * Returns { phase, newDay } where newDay is the new-day summary or null.
   */
  advancePhase() {
    let newDay = null;
    if (this.phase === "Night") {
      this.phases.moveNext();
      newDay = this._startNewDay();
    } else {
      this.phases.moveNext();
    }
    return { phase: this.phase, newDay };
  }

  /**
   * Skip ahead to the start of the next day: bumps the day counter,
   * and changes season when due. Plants are NOT touched: they grow in real time.
   * Returns { day, season, seasonChanged }.
   */
  advanceDay() {
    while (this.phase !== "Night") this.phases.moveNext(); // finish out today
    this.phases.moveNext();                                // Night -> Day
    return this._startNewDay();
  }

  _startNewDay() {
    this.dayCounter++;
    this.daysIntoSeason++;
    let seasonChanged = false;

    if (this.daysIntoSeason > DAYS_PER_SEASON) {
      this.seasons.moveNext();
      this.daysIntoSeason = 1;
      seasonChanged = true;
    }

    const info = { day: this.dayCounter, season: this.season, seasonChanged };
    if (seasonChanged && this.onSeasonChange) this.onSeasonChange(info);
    if (this.onNewDay) this.onNewDay(info);
    return info;
  }

  /** Shows backwards traversal of the doubly linked list. */
  rewindSeason() {
    this.seasons.movePrev();
    this.daysIntoSeason = 1;
    return this.season;
  }

  toJSON() {
    return { day: this.dayCounter, daysIntoSeason: this.daysIntoSeason, season: this.season, phase: this.phase };
  }

  loadJSON(d) {
    if (!d || !SEASONS.includes(d.season) || !DAY_PHASES.includes(d.phase)) return;
    this.dayCounter = Math.max(1, Number(d.day) || 1);
    this.daysIntoSeason = Math.min(DAYS_PER_SEASON, Math.max(1, Number(d.daysIntoSeason) || 1));
    this.seasons.moveTo(d.season);
    this.phases.moveTo(d.phase);
  }
}


/* =============================================================================
   4. ACTION STACK  (LIFO history)
      Each entry is { description, snapshot }: the snapshot is the game exactly as it was
      BEFORE the action, so pop() + restore = Undo. A new day clears the stack.
   ============================================================================= */

class ActionStack {
  constructor() {
    this.items = [];
  }

  // Time: O(1) — array push.
  push(action) {
    this.items.push(action);
  }

  /** Remove and return the most recent action (Undo). null if empty. */
  // Time: O(1) — array pop from the end (LIFO).
  pop() {
    return this.items.length ? this.items.pop() : null;
  }

  /** Look at the most recent action without removing it. */
  // Time: O(1) — read the last item.
  peek() {
    return this.items.length ? this.items[this.items.length - 1] : null;
  }

  isEmpty() {
    return this.items.length === 0;
  }

  size() {
    return this.items.length;
  }

  clear() {
    this.items = [];
  }

  /** Most recent n actions, newest first. */
  // Time: O(n) — copies and reverses the last n actions.
  recent(n = 5) {
    return this.items.slice(-n).reverse();
  }
}


/* =============================================================================
   5. INVENTORY  (backpack = array of slots; the first 8 slots are the hotbar)
      A slot is null or { id, qty }. Items of the same kind stack up to `stack`.
   ============================================================================= */

class Inventory {
  constructor(size = BACKPACK_SLOTS) {
    this.slots = Array(size).fill(null);
  }

  get size() { return this.slots.length; }

  /** How many of `id` fit before the backpack is full. */
  // Time: O(S) — checks every inventory slot (S = 24).
  room(id) {
    const max = ITEMS[id].stack;
    return this.slots.reduce((sum, s) => sum + (s === null ? max : s.id === id ? max - s.qty : 0), 0);
  }

  canAdd(id, qty = 1) { return this.room(id) >= qty; }

  /** Add items: tops up existing stacks first, then fills empty slots. Returns how many did NOT fit. */
  // Time: O(S) — scans the slots once to top up stacks, then once to fill empty slots.
  add(id, qty = 1) {
    const max = ITEMS[id].stack;
    for (const s of this.slots) {
      if (qty <= 0) break;
      if (s && s.id === id && s.qty < max) {
        const put = Math.min(max - s.qty, qty);
        s.qty += put;
        qty -= put;
      }
    }
    for (let i = 0; i < this.slots.length && qty > 0; i++) {
      if (this.slots[i] === null) {
        const put = Math.min(max, qty);
        this.slots[i] = { id, qty: put };
        qty -= put;
      }
    }
    return qty;
  }

  // Time: O(S) — checks every inventory slot.
  count(id) {
    return this.slots.reduce((sum, s) => sum + (s && s.id === id ? s.qty : 0), 0);
  }

  /** Take `qty` out of one slot. Returns how many were removed. */
  // Time: O(1) — touches a single slot.
  removeFromSlot(index, qty = 1) {
    const s = this.slots[index];
    if (!s) return 0;
    const taken = Math.min(qty, s.qty);
    s.qty -= taken;
    if (s.qty <= 0) this.slots[index] = null;
    return taken;
  }

  /** Take `qty` of an item from wherever it is. Returns true if there was enough. */
  // Time: O(S) — one count() pass plus one pass over the slots.
  remove(id, qty = 1) {
    if (this.count(id) < qty) return false;
    for (let i = 0; i < this.slots.length && qty > 0; i++) {
      if (this.slots[i] && this.slots[i].id === id) qty -= this.removeFromSlot(i, qty);
    }
    return true;
  }

  /** Swap two slots (click one, then another) - same item types merge instead. */
  // Time: O(1) — touches two slots.
  swap(a, b) {
    if (a === b || !(a in this.slots) || !(b in this.slots)) return;
    const A = this.slots[a], B = this.slots[b];
    if (A && B && A.id === B.id) {
      const put = Math.min(ITEMS[A.id].stack - B.qty, A.qty);
      B.qty += put;
      A.qty -= put;
      if (A.qty <= 0) this.slots[a] = null;
      return;
    }
    this.slots[a] = B;
    this.slots[b] = A;
  }

  usedSlots() { return this.slots.filter(Boolean).length; }

  toJSON() { return this.slots.map((s) => (s ? { id: s.id, qty: s.qty } : null)); }

  loadJSON(data) {
    if (!Array.isArray(data)) return;
    this.slots = Array(this.size).fill(null);
    data.slice(0, this.size).forEach((s, i) => {
      if (s && ITEMS[s.id] && s.qty > 0) this.slots[i] = { id: s.id, qty: Math.min(ITEMS[s.id].stack, Math.floor(s.qty)) };
    });
  }
}


/* =============================================================================
  5b. HARVEST INVENTORY SORT  (display only: aggregate, then Insertion Sort a COPY)

  The backpack (`Inventory.slots`) is the real record. It has a fixed order that
  the hotbar depends on (slots 1-8), so we must never reorder it. Instead we:

    1. AGGREGATE  - scan the slots once, and build a brand-new list with ONE row
                    per harvested crop (two stacks of Daisy become one Daisy row).
    2. SORT       - run our own Insertion Sort on that new list.
    3. DISPLAY    - the backpack panel draws the sorted rows.

  The rows are new objects made of copied numbers and strings, so sorting them can
  never change a real slot, the hotbar, the selected slot or the capacity.
  Nothing here is saved: the view is rebuilt from the backpack whenever it changes.

  Cost, kept separate on purpose (S = backpack slots, n = distinct crops, n <= S):
    - Aggregation: O(S) time. Looking up "have I seen this crop?" in a plain object is
      O(1) on average. Extra space: O(n) for the rows (this IS the copied display list).
    - Comparing two rows: O(1) for numbers. For names it is O(L), L = the length of the
      shorter name, because strings are compared character by character. Making the
      lowercase copies costs O(L) too. L is tiny here (<= 10 letters).
    - Insertion Sort: O(n) best case (already in order), O(n^2) average and worst case,
      counting each comparison as O(1). Auxiliary space: O(1) - it only moves rows around
      inside the copied list and keeps one row in a variable.
      With name sorting, multiply the comparison count by O(L).
============================================================================= */

// The five things the Harvest Inventory can be sorted by (key -> label shown to the player).
const HARVEST_SORT_KEYS = {
  unit:     "Unit sell value",
  total:    "Total stack value",
  quantity: "Quantity",
  name:     "Name",
  growth:   "Growth duration",
};

/**
 * Step 1: aggregate the backpack into one row per harvested crop.
 * Only items of type "crop" count (seeds and tools are skipped).
 * Rows come out in FIRST-APPEARANCE order: the crop in the lowest-numbered slot comes first.
 * That order is what keeps ties stable later on (see insertionSortHarvest).
 *
 * A row looks like:
 *   { cropId: "daisy", name: "Daisy", quantity: 7, unitValue: 12, totalValue: 84, growMinutes: 3 }
 * unitValue is what the market pays right now (ITEMS[cropId].sell, which comes from CROPS).
 * growMinutes comes straight from CROPS. totalValue = quantity x unitValue.
 */
// Time: O(S) for S slots.  Space: O(n) for n distinct crops (the new rows).
function buildHarvestRows(inventory) {
  const rows = [];
  const rowOf = {};                       // cropId -> its row, so a second stack finds the first one
  for (const slot of inventory.slots) {
    if (!slot) continue;                  // empty slot
    const item = ITEMS[slot.id];
    if (!item || item.type !== "crop") continue;   // not a harvested crop
    let row = rowOf[slot.id];
    if (!row) {                           // first time we see this crop: make its row
      row = {
        cropId: slot.id, name: item.name, quantity: 0,
        unitValue: item.sell, totalValue: 0, growMinutes: CROPS[item.crop].growMinutes,
      };
      rowOf[slot.id] = row;
      rows.push(row);
    }
    row.quantity += slot.qty;             // merge this stack into the crop's row
    row.totalValue = row.quantity * row.unitValue;
  }
  return rows;
}

/**
 * Step 2a: compare two rows by one key. Returns a negative number if `a` belongs before `b`
 * in ASCENDING order, a positive number if after, and 0 if they are equal for that key.
 * Names are compared case-insensitively ("apple" == "Apple") by lowercasing both first.
 */
// Time: O(1) for numeric keys; O(L) for name (copying to lowercase and comparing characters).
function compareHarvestRows(a, b, key) {
  if (key === "name") {
    const x = a.name.toLowerCase(), y = b.name.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  }
  const field = { unit: "unitValue", total: "totalValue", quantity: "quantity", growth: "growMinutes" }[key];
  if (!field) throw new Error(`Unknown sort key: ${key}`);
  return a[field] - b[field];
}

/**
 * Step 2b: Insertion Sort, written by hand (no Array.sort / toSorted).
 * Idea: the left part of the list is always sorted. Take the next row, slide it left past
 * every row that should come AFTER it, and drop it into the gap - like sorting playing cards.
 *
 * Stability: we only slide past a row when the comparison is STRICTLY out of order.
 * Equal rows never pass each other, so ties keep their first-appearance order, in
 * both directions. (Descending flips the sign of the comparison; it does not reverse
 * the finished list, which would also reverse the ties.)
 *
 * Works on a copy: the `rows` you pass in are not modified; a new array is returned.
 * Time: O(n) best (already sorted), O(n^2) average/worst, counting comparisons as O(1).
 * Space: O(n) for the copied list, but the sort itself needs only O(1) extra.
 */
function insertionSortHarvest(rows, key, direction = "asc") {
  if (direction !== "asc" && direction !== "desc") throw new Error(`Unknown direction: ${direction}`);
  const sign = direction === "asc" ? 1 : -1;
  const list = rows.slice();              // the copied display list (the O(n) space)
  for (let i = 1; i < list.length; i++) {
    const current = list[i];              // the row we are inserting
    let j = i - 1;
    // shift bigger (for asc) rows one step right while `current` should come before them
    while (j >= 0 && sign * compareHarvestRows(list[j], current, key) > 0) {
      list[j + 1] = list[j];
      j--;
    }
    list[j + 1] = current;                // drop it into the gap
  }
  return list;
}

/** Convenience: aggregate the backpack, then sort the copy. The backpack is only read. */
function sortedHarvestRows(inventory, key, direction) {
  return insertionSortHarvest(buildHarvestRows(inventory), key, direction);
}


/* =============================================================================
  6. PLAYER  (energy, coins, farming XP & level)
============================================================================= */

class Player {
  constructor() {
    this.coins = START_COINS;
    this.xp = 0;
    this.level = 1;
    this.energy = this.maxEnergy;
  }

  get maxEnergy() { return 20 + 5 * (this.level - 1); }
  get xpNeeded() { return xpForLevel(this.level); }

  spendEnergy(n) {
    if (this.energy < n) return false;
    this.energy -= n;
    return true;
  }

  restoreEnergy(n = Infinity) { this.energy = Math.min(this.maxEnergy, this.energy + n); }

  /** Gain XP; returns how many levels were gained. */
  addXp(n) {
    let gained = 0;
    this.xp += n;
    while (this.level < MAX_LEVEL && this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.level++;
      gained++;
      this.energy = this.maxEnergy; // a level-up refills your energy
    }
    if (this.level >= MAX_LEVEL) this.xp = Math.min(this.xp, this.xpNeeded);
    return gained;
  }

  toJSON() { return { coins: this.coins, xp: this.xp, level: this.level, energy: this.energy }; }

  loadJSON(d) {
    if (!d) return;
    this.level = Math.min(MAX_LEVEL, Math.max(1, Math.floor(Number(d.level)) || 1));
    this.coins = Math.max(0, Math.floor(Number(d.coins)) || 0);
    this.xp = Math.max(0, Math.floor(Number(d.xp)) || 0);
    this.energy = Math.min(this.maxEnergy, Math.max(0, Math.floor(Number(d.energy))));
    if (Number.isNaN(this.energy)) this.energy = this.maxEnergy;
  }
}


/* =============================================================================
  6b. DEQUE  (double-ended queue - used only for the travel "Back" history)
    Array-based: the back of the deque is the end of the array, the front is index 0.
============================================================================= */

class Deque {
  constructor() {
    this.items = [];
  }

  // Add at the front: every item has to shift one place to the right.
  // Time: O(n) for this array-based version (unshift).  Space: O(1) extra.
  addFront(value) { this.items.unshift(value); }

  // Add at the back (the end of the array).
  // Time: O(1) amortized (push).  Space: O(1) extra.
  addBack(value) { this.items.push(value); }

  // Remove and return the front item, or null if empty. Every other item shifts left.
  // Time: O(n) for this array-based version (shift).  Space: O(1) extra.
  removeFront() { return this.items.length ? this.items.shift() : null; }

  // Remove and return the back item, or null if empty.
  // Time: O(1) (pop).  Space: O(1) extra.
  removeBack() { return this.items.length ? this.items.pop() : null; }

  // Look at the front item without removing it, or null if empty.  Time: O(1).
  peekFront() { return this.items.length ? this.items[0] : null; }

  // Look at the back item without removing it, or null if empty.  Time: O(1).
  peekBack() { return this.items.length ? this.items[this.items.length - 1] : null; }

  // How many items are stored.  Time: O(1).
  size() { return this.items.length; }
}


/* =============================================================================
  6c. PLANT HASH TABLE  (separate chaining; keys are "plot|row|col")
    An array of buckets. Each bucket is the head of a singly linked chain of entries, so two keys that land in the
    same bucket (a collision) simply sit in the same chain. When the table gets too full it doubles its bucket
    count and re-files every entry (rehashing), which keeps the chains short. It never shrinks by itself.
    GardenGrid uses one as an index of occupied tiles (the grid's arrays stay the source of truth). Values are small
    records { cropId, plot, row, col }. Hashing does not make lookups "faster than arrays": the grid can already read
    any tile directly by [row][col]; this table is an extra structure used to practise hashing and collision handling.
    Notation: n = entries stored, m = number of buckets, L = key length (a few characters, so it is a small constant).
============================================================================= */

const HASH_INITIAL_BUCKETS = 16;   // a new (or cleared) table starts with this many buckets
const HASH_MAX_LOAD = 0.75;        // load factor (size / buckets) must stay at or below this after every insert

class PlantHashTable {
  constructor() {
    this.buckets = Array(HASH_INITIAL_BUCKETS).fill(null);   // each slot: null or the head of a chain of { key, record, next }
    this.count = 0;
  }

  /** Number of entries stored.  Time: O(1). */
  get size() { return this.count; }

  /** Number of buckets.  Time: O(1). */
  get capacity() { return this.buckets.length; }

  /** Entries per bucket on average (size / buckets).  Time: O(1). */
  get loadFactor() { return this.count / this.buckets.length; }

  /** The text key for a tile, e.g. "Flowers|3|7". Plot names never contain "|", so keys are unique per tile.
   *  Time: O(L) - building a string of L characters.  Space: O(L). */
  static keyOf(plot, row, col) { return `${plot}|${row}|${col}`; }

  /** Hash a string key to a non-negative 32-bit number (djb2: h = h * 33 + character code).
   *  Time: O(L) - one step per character of the key; with keys of a few characters this is effectively O(1).
   *  Space: O(1). */
  static hash(key) {
    let h = 5381;
    for (let i = 0; i < key.length; i++) h = (h * 33 + key.charCodeAt(i)) >>> 0;   // >>> 0 keeps it an unsigned 32-bit integer
    return h;
  }

  /** Which bucket a tile's key belongs in right now.  Time: O(L) (build the key, then hash it).  Space: O(L). */
  bucketIndexOf(plot, row, col) {
    return PlantHashTable.hash(PlantHashTable.keyOf(plot, row, col)) % this.buckets.length;
  }

  /** Only real tiles are allowed: a plot named in PLOT_NAMES and a whole-number row and column inside the grid
   *  (GardenGrid.inBounds uses GRID_SIZE, so nothing here hard-codes 3 plots or 10x10).
   *  Time: O(p) for the plot-name check (p = number of plots, 3) - effectively O(1). */
  static _valid(plot, row, col) {
    return PLOT_NAMES.includes(plot) && GardenGrid.inBounds(row, col);
  }

  /** Walk one chain looking for `key`. Returns the entry node, or null.
   *  Time: O(k) where k = length of that chain: O(1) on average when the load factor is bounded (about n / m,
   *  and at most 0.75 here), but O(n) in the worst case if every key collides into one chain.  Space: O(1). */
  _find(key, index) {
    for (let node = this.buckets[index]; node; node = node.next) {
      if (node.key === key) return node;
    }
    return null;
  }

  /**
   * Store the plant at a tile. A new key is added; an existing key just has its record replaced (size is unchanged
   * and no resizing happens). Before adding a NEW key that would push size / buckets above 0.75, the table doubles
   * its buckets and redistributes everything first. Returns true if stored, false if the arguments are invalid.
   * Time: O(L + k) to hash and search the chain, O(1) average. Adding a key that triggers a rehash costs O(n + m)
   * for that one insert; spread over many inserts the doubling makes inserts O(1) amortized.
   * Space: O(1) extra for the new node (O(m) for the new bucket array when it rehashes).
   */
  put(plot, row, col, cropId) {
    if (!PlantHashTable._valid(plot, row, col) || typeof cropId !== "string" || cropId.length === 0) return false;
    const key = PlantHashTable.keyOf(plot, row, col);
    const record = { cropId, plot, row, col };

    let index = PlantHashTable.hash(key) % this.buckets.length;
    const existing = this._find(key, index);
    if (existing) {                       // update in place: same key, so same size and no resize check
      existing.record = record;
      return true;
    }

    if ((this.count + 1) / this.buckets.length > HASH_MAX_LOAD) {
      let target = this.buckets.length * 2;                       // double until the new entry fits under the limit
      while ((this.count + 1) / target > HASH_MAX_LOAD) target *= 2;
      this._relink(target);                                       // moves nodes directly; it does not call put()
      index = PlantHashTable.hash(key) % this.buckets.length;     // the bucket count changed, so find the bucket again
    }
    this.buckets[index] = { key, record, next: this.buckets[index] };   // new entries go at the head of the chain
    this.count++;
    return true;
  }

  /** The stored record for a tile (a copy, so callers can't change the table by accident), or null if absent.
   *  Time: O(L + k) - hash the key, then walk one chain: O(1) average, O(n) worst case.  Space: O(1). */
  get(plot, row, col) {
    if (!PlantHashTable._valid(plot, row, col)) return null;
    const key = PlantHashTable.keyOf(plot, row, col);
    const node = this._find(key, PlantHashTable.hash(key) % this.buckets.length);
    return node ? { ...node.record } : null;
  }

  /** Is there a plant stored at this tile?  Time: O(L + k) - same as get().  Space: O(1). */
  has(plot, row, col) {
    if (!PlantHashTable._valid(plot, row, col)) return false;
    const key = PlantHashTable.keyOf(plot, row, col);
    return this._find(key, PlantHashTable.hash(key) % this.buckets.length) !== null;
  }

  /** Remove a tile's entry, relinking its chain around it so the other entries are untouched. Never shrinks the table.
   *  Returns true if something was removed.
   *  Time: O(L + k) - hash, then walk the chain keeping a pointer to the previous node: O(1) average, O(n) worst case.
   *  Space: O(1). */
  remove(plot, row, col) {
    if (!PlantHashTable._valid(plot, row, col)) return false;
    const key = PlantHashTable.keyOf(plot, row, col);
    const index = PlantHashTable.hash(key) % this.buckets.length;
    let previous = null;
    for (let node = this.buckets[index]; node; previous = node, node = node.next) {
      if (node.key !== key) continue;
      if (previous) previous.next = node.next; else this.buckets[index] = node.next;
      this.count--;
      return true;
    }
    return false;
  }

  /** A plain-number summary for display (nothing inside the table is exposed):
   *  { size, capacity, loadFactor, occupiedBuckets, collisionBuckets (buckets holding 2+ entries), longestChain }.
   *  Time: O(m + n) - visits every bucket and every entry once.  Space: O(1). */
  stats() {
    let occupiedBuckets = 0, collisionBuckets = 0, longestChain = 0;
    for (let i = 0; i < this.buckets.length; i++) {
      let length = 0;
      for (let node = this.buckets[i]; node; node = node.next) length++;
      if (length > 0) occupiedBuckets++;
      if (length > 1) collisionBuckets++;
      if (length > longestChain) longestChain = length;
    }
    return { size: this.count, capacity: this.buckets.length, loadFactor: this.loadFactor, occupiedBuckets, collisionBuckets, longestChain };
  }

  /** Empty the table and go back to the starting 16 buckets, exactly like a new table.  Time: O(1) - a fresh array of
   *  16 buckets (a constant) is made and the old chains are simply dropped.  Space: O(1). */
  clear() {
    this.buckets = Array(HASH_INITIAL_BUCKETS).fill(null);
    this.count = 0;
  }

  /**
   * Re-file every entry into `newCapacity` buckets (default: double the current number). The new capacity must be a
   * whole number big enough to keep the load factor at or below 0.75; otherwise nothing changes and false is returned.
   * Returns true when the table was rebuilt.
   * Time: O(n + m + m') - visit every old bucket and every entry once, and build the m' new buckets. Each entry's hash
   * is recomputed once (O(L) each), so with short keys this is O(n + m). Space: O(m') for the new bucket array.
   */
  rehash(newCapacity = this.buckets.length * 2) {
    if (!Number.isInteger(newCapacity) || newCapacity < 1 || this.count / newCapacity > HASH_MAX_LOAD) return false;
    this._relink(newCapacity);
    return true;
  }

  /** Move every existing node into a new bucket array of `newCapacity` buckets. It is a plain loop over the old buckets
   *  and chains (no recursion and no calls to put()), so it can never trigger another resize.
   *  Time: O(n + m + m') with one hash per entry.  Space: O(m'). */
  _relink(newCapacity) {
    const fresh = Array(newCapacity).fill(null);
    for (let i = 0; i < this.buckets.length; i++) {
      let node = this.buckets[i];
      while (node) {
        const next = node.next;                                       // remember it: re-linking overwrites node.next
        const j = PlantHashTable.hash(node.key) % newCapacity;
        node.next = fresh[j];
        fresh[j] = node;
        node = next;
      }
    }
    this.buckets = fresh;
  }
}


/* =============================================================================
  6d. SEASON HARVEST TRACKER  (data only: what you harvested in each season occurrence)

  Why: a later phase will rank seasons. This phase only RECORDS the numbers.

  - A "season occurrence" is one particular Spring, Summer... in time. The 1st Spring and the
    2nd Spring are different occurrences. Each gets a stable serial number (0, 1, 2, ...):
    serial 0 = "Spring - Cycle 1", 1 = "Summer - Cycle 1", 2 = "Autumn - Cycle 1",
    3 = "Winter - Cycle 1", 4 = "Spring - Cycle 2", ...
    season name = SEASONS[serial % 4]    cycle = floor(serial / 4) + 1    id = "season-" + (serial + 1)
    The game's own calendar agrees: serial = floor((dayCounter - 1) / DAYS_PER_SEASON) (the tests check this).
  - One season record: { serial, partial, crops: [ { cropId, quantity, value }, ... ] }
    quantity  crops really received from successful harvests
    value     quantity x the BASE sell price (CROPS[id].sellPrice) at the moment of the harvest.
    It is stored as a plain number, never recomputed, so a later price change cannot rewrite history.
    The ORDER of the crops array is the first-harvest order (the crop first harvested this season comes
    first). Putting the order in the array position means it is saved, loaded and undone with no extra field.
    partial   true when tracking started in the middle of this season (an old save). Then the numbers are
    only "since tracking began" and a later ranking should say so. We never invent earlier history.
  - `current` is the season being played now; `archive` holds finished seasons, oldest first, one per
    serial (empty seasons are archived too). A season is archived exactly once: when the calendar moves on.
  - Loading a save or Undo only REPLACES this data (loadJSON). It never records or archives anything.

  Cost (k = distinct crops, at most 12; A = archived seasons):
    recordHarvest: O(k)   closeSeason: O(1)   toJSON / loadJSON: O(A x k)
  The archive grows by one small record per season (7 game days) and is saved in the save file and in each
  undo snapshot, so those get slightly larger over very long games. No limit is applied yet.
============================================================================= */

class SeasonHarvestTracker {
  constructor() {
    this.current = SeasonHarvestTracker.newRecord(0, false);
    this.archive = [];
  }

  static newRecord(serial, partial) { return { serial, partial: !!partial, crops: [] }; }
  static seasonOf(serial) { return SEASONS[serial % SEASONS.length]; }
  static cycleOf(serial) { return Math.floor(serial / SEASONS.length) + 1; }
  static idOf(serial) { return `season-${serial + 1}`; }
  static labelOf(serial) { return `${SeasonHarvestTracker.seasonOf(serial)} — Cycle ${SeasonHarvestTracker.cycleOf(serial)}`; }

  /** Add one successful harvest to the current season. Time: O(k). */
  recordHarvest(cropId, quantity) {
    if (!CROPS[cropId] || !Number.isInteger(quantity) || quantity <= 0) return false;   // nothing received = nothing recorded
    const value = quantity * CROPS[cropId].sellPrice;          // base price right now, frozen as a number
    let entry = null;
    for (const e of this.current.crops) if (e.cropId === cropId) { entry = e; break; }
    if (!entry) {                                              // first harvest of this crop this season: it goes last in the order
      entry = { cropId, quantity: 0, value: 0 };
      this.current.crops.push(entry);
    }
    entry.quantity += quantity;
    entry.value += value;
    return true;
  }

  /** The season ended: move `current` into the archive (once) and open the next occurrence. Time: O(A) for the duplicate check. */
  closeSeason() {
    const done = this.current;
    if (!this.archive.some((r) => r.serial === done.serial)) this.archive.push(done);   // never archive a serial twice
    this.current = SeasonHarvestTracker.newRecord(done.serial + 1, false);
    return done;
  }

  /** Crops of a season record in first-harvest order, with that order made explicit (0 = first). Time: O(k). */
  static rows(record) {
    return record.crops.map((e, i) => ({ cropId: e.cropId, name: CROPS[e.cropId].name, quantity: e.quantity, value: e.value, firstOrder: i }));
  }

  /** Which serial matches the calendar right now (day counter + season name)? Falls back to cycle 1 if they disagree. */
  static serialFromTime(time) {
    const byDay = Math.floor((time.dayCounter - 1) / DAYS_PER_SEASON);
    return SeasonHarvestTracker.seasonOf(byDay) === time.season ? byDay : SEASONS.indexOf(time.season);
  }

  /** Start tracking from the calendar as it is now. `partial` = we are joining a season that already began. */
  startFromTime(time, partial) {
    this.current = SeasonHarvestTracker.newRecord(SeasonHarvestTracker.serialFromTime(time), partial);
    this.archive = [];
  }

  toJSON() {
    const rec = (r) => ({ serial: r.serial, partial: r.partial, crops: r.crops.map((e) => ({ cropId: e.cropId, quantity: e.quantity, value: e.value })) });
    return { current: rec(this.current), archive: this.archive.map(rec) };
  }

  /**
   * Replace the data from a save or an Undo snapshot. Optional and validated: anything missing or odd gets a safe default.
   * No save field (an old save) -> tracking starts now from the calendar and is marked partial. Never awards or archives.
   */
  loadJSON(data, time) {
    const clean = SeasonHarvestTracker._sanitize(data);
    if (!clean || SeasonHarvestTracker.seasonOf(clean.current.serial) !== time.season) {
      this.startFromTime(time, true);                          // old/invalid save: we cannot know what happened before now
      if (clean) this.archive = clean.archive.filter((r) => r.serial < this.current.serial);   // keep valid history
      return false;
    }
    this.current = clean.current;
    this.archive = clean.archive;
    return true;
  }

  static _int(n) { return Number.isSafeInteger(n) && n >= 0 ? n : null; }

  static _cleanRecord(r) {
    if (!r || typeof r !== "object") return null;
    const serial = SeasonHarvestTracker._int(r.serial);
    if (serial === null || !Array.isArray(r.crops)) return null;
    const seen = {}, crops = [];
    for (const e of r.crops) {                                 // array position = first-harvest order; keep it
      if (!e || !CROPS[e.cropId] || seen[e.cropId]) continue;  // unknown or duplicate crop: skip
      const quantity = SeasonHarvestTracker._int(e.quantity), value = SeasonHarvestTracker._int(e.value);
      if (quantity === null || value === null || quantity === 0) continue;
      seen[e.cropId] = true;
      crops.push({ cropId: e.cropId, quantity, value });
    }
    return { serial, partial: r.partial === true, crops };
  }

  static _sanitize(data) {
    if (!data || typeof data !== "object") return null;
    const current = SeasonHarvestTracker._cleanRecord(data.current);
    if (!current) return null;
    const archive = [], used = {};
    for (const r of Array.isArray(data.archive) ? data.archive : []) {
      const c = SeasonHarvestTracker._cleanRecord(r);
      if (c && c.serial < current.serial && !used[c.serial]) { used[c.serial] = true; archive.push(c); }   // one per serial, only finished seasons
    }
    return { current, archive };
  }

  /**
   * The seasons you can look at, newest first: the current one, then completed ones (newest to oldest).
   * Returns NEW small objects { key, serial, id, label, status, partial }; changing them changes nothing here.
   * Time: O(A) for A archived seasons.
   */
  seasonChoices() {
    const info = (r, status, key) => ({ key, serial: r.serial, id: SeasonHarvestTracker.idOf(r.serial), label: SeasonHarvestTracker.labelOf(r.serial), status, partial: r.partial });
    const out = [info(this.current, "current", "current")];
    for (let i = this.archive.length - 1; i >= 0; i--) out.push(info(this.archive[i], "completed", String(this.archive[i].serial)));
    return out;
  }

  /** The record of the current season (serial === current) or an archived one; null if there is none. Time: O(A). */
  findSeason(serial) {
    if (serial === this.current.serial) return this.current;
    for (const r of this.archive) if (r.serial === serial) return r;
    return null;
  }
}

/* =============================================================================
  6e. SEASON RANKINGS  (Merge Sort on COPIED records; ranks crops inside ONE season)

  The tracker (6d) is the real record. To show a ranking we:
    1. COPY   - rows(record) makes new row objects { cropId, name, quantity, value, firstOrder }.
                Sorting moves these copies around; the tracker's own entries are never touched.
    2. SORT   - our own Merge Sort puts the copies in order, biggest first.
    3. SHOW   - the Crop Guide "Rankings" tab draws them (rank 1, 2, 3 ... = position in the sorted list).
  Values are the ones STORED when each harvest happened. Nothing is recalculated from today's prices.

  How Merge Sort works (splitting, then merging):
    - SPLIT: cut the list in half, again and again, until each piece has 0 or 1 rows. A piece that small is
      already sorted. We do not copy the pieces; we just remember "from index lo to index hi".
    - MERGE: join two sorted neighbours into one sorted piece. Keep one finger (index) at the front of each
      piece, look at the two rows under the fingers, and write the better one to the output, then move that
      finger. We move indexes instead of using shift(), so each step is O(1) (shift() would move every item).
    - Merging builds the piece in a helper array `aux`, then copies it back into place.
  Stable ties: if two crops have the same metric, the one harvested FIRST this season goes first. The merge
  takes from the left piece unless the right row is strictly better (or tied but with a smaller firstOrder),
  so equal rows never swap places and the result does not depend on how the input happened to be arranged.

  Cost (n = crops in the season, at most 12 right now; A = archived seasons):
    - Merge Sort time: O(n log n) in the best, average and worst case (log n levels of splitting, O(n) merging each).
    - Auxiliary space: O(n) for `aux` (plus O(log n) for the recursive calls).
    - Copying the display records: O(n) time and O(n) space. Looking a season up: O(A). Drawing the table: O(n).============================================================================= */

// Ranking metrics: key -> the row field it compares. Both are "highest first".
const RANK_METRICS = { value: "value", quantity: "quantity" };

/** Is row `b` strictly better than row `a`? Bigger metric wins; on a tie the earlier first-harvest wins. */
function rankRowBeats(b, a, field) {
  if (b[field] !== a[field]) return b[field] > a[field];
  return typeof a.firstOrder === "number" && typeof b.firstOrder === "number" && b.firstOrder < a.firstOrder;
}

/** Sort list[lo..hi) in place: split in half, sort each half, merge. `aux` is a helper array as long as the list. */
function mergeSortRange(list, aux, lo, hi, field) {
  if (hi - lo < 2) return;                          // 0 or 1 rows: already sorted
  const mid = (lo + hi) >> 1;                       // where we split
  mergeSortRange(list, aux, lo, mid, field);        // sort the left half
  mergeSortRange(list, aux, mid, hi, field);        // sort the right half
  let left = lo, right = mid, out = lo;             // three indexes: front of each half, and the next output spot
  while (left < mid && right < hi) {
    // take from the right only when it is strictly better, so ties keep the left (earlier) row first
    aux[out++] = rankRowBeats(list[right], list[left], field) ? list[right++] : list[left++];
  }
  while (left < mid) aux[out++] = list[left++];     // one half ran out: copy what is left of the other
  while (right < hi) aux[out++] = list[right++];
  for (let i = lo; i < hi; i++) list[i] = aux[i];   // put the merged piece back
}

/**
 * Merge Sort a COPY of `rows` by `metric` ("value" or "quantity"), highest first. The input list is not changed.
 * Time: O(n log n). Auxiliary space: O(n) (the helper array) + O(log n) calls. The copy itself is O(n).
 */
function mergeSortRankRows(rows, metric = "value") {
  const field = RANK_METRICS[metric];
  if (!field) throw new Error(`Unknown ranking metric: ${metric}`);
  const list = rows.slice();                        // the copied display list
  if (list.length < 2) return list;
  mergeSortRange(list, new Array(list.length), 0, list.length, field);
  return list;
}

/**
 * Rank the crops of ONE season record: copy the tracker's entries into rows (first-harvest order), Merge Sort them,
 * and number them 1, 2, 3... (a tie still gets different numbers; the earlier first harvest gets the better one).
 * Returns new objects: { rank, cropId, name, quantity, value, firstOrder }. The record is only read.
 */
function rankSeasonCrops(record, metric = "value") {
  const sorted = mergeSortRankRows(SeasonHarvestTracker.rows(record), metric);
  return sorted.map((r, i) => ({ rank: i + 1, ...r }));
}


/* =============================================================================
  7. WORLD GRAPH  (places = nodes, roads = edges, BFS finds the shortest route)
============================================================================= */

class WorldGraph {
  constructor() {
    this.adjacency = new Map(); // place id -> array of neighbour ids
  }

  addNode(id) {
    if (!this.adjacency.has(id)) this.adjacency.set(id, []);
  }

  /** A road works both ways. */
  addEdge(a, b) {
    this.addNode(a);
    this.addNode(b);
    if (!this.adjacency.get(a).includes(b)) this.adjacency.get(a).push(b);
    if (!this.adjacency.get(b).includes(a)) this.adjacency.get(b).push(a);
  }

  neighbors(id) { return this.adjacency.get(id) || []; }

  /** Breadth-first search. Returns the list of places from `from` to `to` (inclusive), or null. */
  // Time: O(V + E) — BFS visits each location and road at most once.
  // Space: O(V) — stores visited locations, queue data, and the final path.
  // (The queue is read with a head index, so dequeuing is O(1). The final path is built with unshift,
  //  which is O(V^2) in the worst case, but this world has only 4 places.)
  shortestPath(from, to) {
    if (!this.adjacency.has(from) || !this.adjacency.has(to)) return null;
    const cameFrom = new Map([[from, null]]);
    const queue = [from];
    let head = 0;
    while (head < queue.length) {
      const here = queue[head++];
      if (here === to) break;
      for (const next of this.neighbors(here)) {
        if (!cameFrom.has(next)) {
          cameFrom.set(next, here);
          queue.push(next);
        }
      }
    }
    if (!cameFrom.has(to)) return null;
    const path = [];
    for (let at = to; at !== null; at = cameFrom.get(at)) path.unshift(at);
    return path;
  }
}


/* =============================================================================
  8. GARDEN GAME  (all the rules; the UI only calls these and shows the result)
      Every action returns { ok, msg, ... } and changes nothing when ok is false.
============================================================================= */

class GardenGame {
  constructor() {
    this.grid = new GardenGrid();
    this.time = new TimeSystem(this.grid);
    this.stack = new ActionStack();
    this.inventory = new Inventory();
    this.player = new Player();
    this.world = new WorldGraph();
    ROADS.forEach(([a, b]) => this.world.addEdge(a, b));
    this.location = START_LOCATION;
    this.selected = 0; // hotbar slot in the player's hand
    this.travelHistory = new Deque();   // previous places for the Back button (never saved)
    this.clock = () => Date.now();   // the game's clock (tests can swap it)
    this.time.onNewDay = () => this.player.restoreEnergy();
    this.tracker = new SeasonHarvestTracker();   // harvest totals per season (saved; see 6d)
    this.time.onSeasonChange = () => this.tracker.closeSeason();
    this._syncPlot();
    this._starterKit();
  }

  _starterKit() {
    this.inventory.add("shears");
    this.inventory.add("can");
    ["daisy", "carrot", "tomato"].forEach((c) => this.inventory.add(seedIdOf(c), 4));
  }

  get place() { return LOCATIONS[this.location]; }
  get atMarket() { return this.place.kind === "market"; }
  get atGarden() { return this.place.kind === "garden"; }

  /**
   * Real-time growth: check every watered plant against the clock and update its stage.
   * Returns { changed, matured, cells } (cells = the plants whose stage changed).
   */
  refreshGrowth(now = this.clock()) {
    const cells = this.grid.refresh(now);
    return { changed: cells.length, matured: cells.filter((c) => c.to === STAGE.MATURE).length, cells };
  }

  /** Keep the grid's active plot in step with where the player is standing. */
  _syncPlot() {
    if (this.place.plot) this.grid.switchPlot(this.place.plot);
  }

  get heldItem() {
    const s = this.inventory.slots[this.selected];
    return s ? ITEMS[s.id] : null;
  }

  selectSlot(i) {
    if (Number.isInteger(i) && i >= 0 && i < HOTBAR_SLOTS) this.selected = i;
  }

  // ---- Undo (stack of snapshots) --------------------------------------------
  snapshot() {
    return JSON.stringify({
      grid: this.grid.toJSON(), time: this.time.toJSON(), inv: this.inventory.toJSON(),
      player: this.player.toJSON(), location: this.location,
      harvests: this.tracker.toJSON(),   // so Undo also takes back a harvest's season record
    });
  }

  restore(json) {
    const d = JSON.parse(json);
    this.grid.loadJSON(d.grid, this.clock());
    this.time.loadJSON(d.time);
    this.inventory.loadJSON(d.inv);
    this.player.loadJSON(d.player);
    this.tracker.loadJSON(d.harvests, this.time);   // replaces the data only: no points, no archive
    if (LOCATIONS[d.location]) this.location = d.location;
    this._syncPlot();
  }

  /** Run `fn` (which returns a result); if it succeeded, record a snapshot taken BEFORE it. */
  _record(description, fn) {
    const before = this.snapshot();
    const result = fn();
    if (result.ok) this.stack.push({ description, snapshot: before });
    return result;
  }

  undo() {
    const action = this.stack.pop();
    if (!action) return { ok: false, msg: "Nothing to undo yet." };
    this.restore(action.snapshot);
    return { ok: true, msg: `Undid: ${action.description}`, action };
  }

  // ---- Using the held item on a tile ------------------------------------------
  /** Click a tile: the item in your hand decides what happens. */
  useOnTile(row, col) {
    this.refreshGrowth();
    if (!this.atGarden) return { ok: false, msg: "There's no soil here. Travel to a garden first." };
    if (!GardenGrid.inBounds(row, col)) return { ok: false, msg: "That tile is outside the garden." };
    const item = this.heldItem;
    if (!item) return { ok: false, msg: "Your hand is empty. Pick an item from the hotbar." };
    if (item.id === "shears") return this.harvestTile(row, col);
    if (item.id === "can") return this.waterTile(row, col);
    if (item.type === "seed") return this.plantTile(row, col, item.crop);
    return { ok: false, msg: `${item.name} can't be used on soil. Try seeds, the can or the shears.` };
  }

  _tired() { return { ok: false, msg: "You're too tired! Eat a crop, or sleep to refill your energy.", tired: true }; }

  plantTile(row, col, cropId) {
    this.refreshGrowth();
    const crop = CROPS[cropId];
    const plot = this.place.plot;
    if (crop.plot !== plot) {
      return { ok: false, msg: `${crop.name}s only grow in the ${GARDEN_FOR_PLOT[crop.plot].name}.` };
    }
    if (this.grid.getStage(row, col, plot) !== STAGE.EMPTY) return { ok: false, msg: "Something is already growing there." };
    if (this.inventory.count(seedIdOf(cropId)) < 1) return { ok: false, msg: `You have no ${crop.name} seeds.` };
    if (this.player.energy < ENERGY_COST.plant) return this._tired();
    return this._record(`planted ${crop.name} at [${row},${col}]`, () => {
      this.grid.plantSeed(row, col, cropId, plot);
      this.inventory.remove(seedIdOf(cropId), 1);
      this.player.spendEnergy(ENERGY_COST.plant);
      return { ok: true, msg: `Planted ${crop.name}.`, kind: "plant" };
    });
  }

  waterTile(row, col) {
    this.refreshGrowth();
    const plot = this.place.plot;
    const stage = this.grid.getStage(row, col, plot);
    if (stage === STAGE.EMPTY) return { ok: false, msg: "There's nothing to water here." };
    if (stage === STAGE.MATURE) return { ok: false, msg: "That plant is ripe already. Use the shears!" };
    if (!this.grid.isThirsty(row, col, plot)) return { ok: false, msg: "It's not thirsty. It's already growing." };
    if (this.player.energy < ENERGY_COST.water) return this._tired();
    const crop = CROPS[this.grid.getPlantId(row, col, plot)];
    return this._record(`watered ${crop.name} at [${row},${col}]`, () => {
      this.grid.water(row, col, plot, this.clock());
      this.player.spendEnergy(ENERGY_COST.water);
      return { ok: true, msg: `Watered the ${crop.name}.`, kind: "water" };
    });
  }

  harvestTile(row, col) {
    this.refreshGrowth();
    const plot = this.place.plot;
    const stage = this.grid.getStage(row, col, plot);
    if (stage === STAGE.EMPTY) return { ok: false, msg: "There's nothing to harvest here." };
    if (stage !== STAGE.MATURE) {
      const left = this.grid.remainingMs(row, col, plot, this.clock());
      return { ok: false, msg: this.grid.isThirsty(row, col, plot)
        ? "Not ripe yet, and it's thirsty. Water it first!"
        : `Not ripe yet. ${formatDuration(left)} left.` };
    }
    const cropId = this.grid.getPlantId(row, col, plot);
    const crop = CROPS[cropId];
    if (!this.inventory.canAdd(cropId, crop.yield)) return { ok: false, msg: "Your backpack is full! Sell or drop something.", full: true };
    if (this.player.energy < ENERGY_COST.harvest) return this._tired();
    return this._record(`harvested ${crop.name} at [${row},${col}]`, () => {
      this.grid.harvest(row, col, plot);
      const leftover = this.inventory.add(cropId, crop.yield);
      this.tracker.recordHarvest(cropId, crop.yield - leftover);   // only what was really received counts
      this.player.spendEnergy(ENERGY_COST.harvest);
      const levels = this.player.addXp(crop.xp);
      return {
        ok: true, kind: "harvest", item: cropId, qty: crop.yield, xp: crop.xp, levels,
        msg: `Harvested ${crop.yield} x ${crop.name}! +${crop.xp} XP` + (levels ? ` Level up! You are now level ${this.player.level}.` : ""),
      };
    });
  }

  // ---- Backpack actions -------------------------------------------------------
  eat(slotIndex) {
    const s = this.inventory.slots[slotIndex];
    if (!s) return { ok: false, msg: "That slot is empty." };
    const item = ITEMS[s.id];
    if (!item.food) return { ok: false, msg: `${item.name} isn't edible.` };
    if (this.player.energy >= this.player.maxEnergy) return { ok: false, msg: "You're not tired. Save it for later!" };
    return this._record(`ate a ${item.name}`, () => {
      this.inventory.removeFromSlot(slotIndex, 1);
      this.player.restoreEnergy(item.food);
      return { ok: true, msg: `Yum! ${item.name} restored ${item.food} energy.`, kind: "eat" };
    });
  }

  drop(slotIndex, qty = Infinity) {
    const s = this.inventory.slots[slotIndex];
    if (!s) return { ok: false, msg: "That slot is empty." };
    const item = ITEMS[s.id];
    if (item.type === "tool") return { ok: false, msg: `You need your ${item.name}!` };
    return this._record(`dropped ${item.name}`, () => {
      const n = this.inventory.removeFromSlot(slotIndex, qty);
      return { ok: true, msg: `Dropped ${n} x ${item.name}.`, kind: "drop" };
    });
  }

  swapSlots(a, b) {
    this.inventory.swap(a, b);
    return { ok: true, msg: "" };
  }

  // ---- Market -----------------------------------------------------------------
  /** Seeds the merchant sells right now (all of them, with a lock for ones above your level). */
  shopStock() {
    return Object.entries(CROPS).map(([id, c]) => ({
      id: seedIdOf(id), crop: id, price: c.seedPrice, level: c.level, locked: this.player.level < c.level,
    }));
  }

  buy(itemId, qty = 1) {
    if (!this.atMarket) return { ok: false, msg: "You can only shop at Market Square." };
    const item = ITEMS[itemId];
    if (!item || item.type !== "seed") return { ok: false, msg: "The merchant doesn't sell that." };
    const crop = CROPS[item.crop];
    if (this.player.level < crop.level) return { ok: false, msg: `${item.name} unlocks at level ${crop.level}.` };
    const cost = crop.seedPrice * qty;
    if (this.player.coins < cost) return { ok: false, msg: "Not enough coins." };
    if (!this.inventory.canAdd(itemId, qty)) return { ok: false, msg: "Your backpack is full!", full: true };
    return this._record(`bought ${qty} x ${item.name}`, () => {
      this.player.coins -= cost;
      this.inventory.add(itemId, qty);
      return { ok: true, msg: `Bought ${qty} x ${item.name} for ${cost} coins.`, kind: "buy", coins: -cost };
    });
  }

  sell(slotIndex, qty = 1) {
    if (!this.atMarket) return { ok: false, msg: "You can only sell at Market Square." };
    const s = this.inventory.slots[slotIndex];
    if (!s) return { ok: false, msg: "That slot is empty." };
    const item = ITEMS[s.id];
    if (!item.sell) return { ok: false, msg: `The merchant won't buy your ${item.name}.` };
    return this._record(`sold ${item.name}`, () => {
      const n = this.inventory.removeFromSlot(slotIndex, qty);
      const gain = n * item.sell;
      this.player.coins += gain;
      return { ok: true, msg: `Sold ${n} x ${item.name} for ${gain} coins.`, kind: "sell", coins: gain };
    });
  }

  /** Sell every harvested crop in the backpack at once. */
  sellAllCrops() {
    if (!this.atMarket) return { ok: false, msg: "You can only sell at Market Square." };
    const crops = this.inventory.slots.filter((s) => s && ITEMS[s.id].type === "crop");
    if (!crops.length) return { ok: false, msg: "You have no crops to sell." };
    return this._record("sold all crops", () => {
      let gain = 0, n = 0;
      this.inventory.slots.forEach((s, i) => {
        if (s && ITEMS[s.id].type === "crop") {
          gain += s.qty * ITEMS[s.id].sell;
          n += s.qty;
          this.inventory.slots[i] = null;
        }
      });
      this.player.coins += gain;
      return { ok: true, msg: `Sold ${n} crops for ${gain} coins!`, kind: "sell", coins: gain };
    });
  }

  // ---- Travel (graph + BFS) -----------------------------------------------------
  /** Route to a place, or null. Does not move the player. */
  routeTo(placeId) {
    return this.world.shortestPath(this.location, placeId);
  }

  /** Walk to another place. Returns the route so the UI can animate it. Travelling is free and isn't undoable. */
  travel(placeId, { remember = true } = {}) {
    if (!LOCATIONS[placeId]) return { ok: false, msg: "Unknown place." };
    if (placeId === this.location) return { ok: false, msg: `You're already in the ${LOCATIONS[placeId].name}.` };
    const route = this.routeTo(placeId);
    if (!route) return { ok: false, msg: "There is no road there." };
    if (remember) this._rememberPlace(this.location);      // the place we are leaving goes on the Back history
    this.location = placeId;
    this._syncPlot();
    return { ok: true, route, msg: `You arrived at ${LOCATIONS[placeId].name}.`, kind: "travel" };
  }

  /** Put a place at the back of the travel history; keep at most MAX_TRAVEL_HISTORY, dropping the oldest from the front.
   *  Time: O(1) for addBack, plus O(n) for removeFront when the limit is passed (n is at most 5, so tiny). */
  _rememberPlace(placeId) {
    this.travelHistory.addBack(placeId);
    if (this.travelHistory.size() > MAX_TRAVEL_HISTORY) this.travelHistory.removeFront();
  }

  /** The Back button: take the most recent previous place off the back of the deque and travel there with the
   *  normal travel() (so BFS still finds the route). Going Back is not itself remembered, so pressing Back
   *  again keeps walking further back instead of bouncing between two places.
   *  Time: O(1) for removeBack + the cost of travel() (BFS, O(V + E)). */
  goBack() {
    let previous = null;
    while (this.travelHistory.size() > 0 && !previous) {
      const place = this.travelHistory.removeBack();
      if (place !== this.location) previous = place;       // skip a stale entry for the place we are already in
    }
    if (!previous) return { ok: false, msg: "There is no previous place to go back to." };
    const res = this.travel(previous, { remember: false });
    if (!res.ok) this.travelHistory.addBack(previous);      // couldn't go: keep it for later
    return res;
  }

  // ---- Time -------------------------------------------------------------------
  /** Sleep: jump to the next morning. Plants grow, energy refills, and undo history resets. */
  sleep() {
    const info = this.time.advanceDay();
    this.stack.clear();
    return { ok: true, info, kind: "sleep" };
  }

  /** Day <-> Night. Going from Night to Day is a new day. */
  togglePhase() {
    const res = this.time.advancePhase();
    if (res.newDay) this.stack.clear();
    return { ok: true, phase: res.phase, info: res.newDay, kind: res.newDay ? "sleep" : "phase" };
  }

  // ---- Saving -----------------------------------------------------------------
  toJSON() {
    return {
      v: 2, grid: this.grid.toJSON(), time: this.time.toJSON(), inv: this.inventory.toJSON(),
      player: this.player.toJSON(), location: this.location, selected: this.selected,
      harvests: this.tracker.toJSON(),   // optional field: old version-2 saves simply don't have it
    };
  }

  loadJSON(d) {
    if (!d || d.v !== 2) return false;
    this.grid.loadJSON(d.grid, this.clock());
    this.time.loadJSON(d.time);
    this.inventory.loadJSON(d.inv);
    this.player.loadJSON(d.player);
    this.tracker.loadJSON(d.harvests, this.time);   // missing/invalid -> start tracking now, marked partial
    if (LOCATIONS[d.location]) this.location = d.location;
    this.selected = Number.isInteger(d.selected) && d.selected >= 0 && d.selected < HOTBAR_SLOTS ? d.selected : 0;
    this.stack.clear();
    this._syncPlot();
    return true;
  }

  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.toJSON())); } catch (e) { /* storage blocked: ignore */ }
  }

  /** Try to load the autosave. Returns true if one was found and valid. */
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? this.loadJSON(JSON.parse(raw)) : false;
    } catch (e) {
      return false;
    }
  }

  static clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  }
}


/* =============================================================================
  9. GARDEN UI  (HUD, hotbar, backpack, world map, market, characters, scene)
      The UI never changes the game by itself: it calls GardenGame methods,
      then draws whatever the game now looks like.
============================================================================= */

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A little pixel icon (tool, seed, crop, coin...) drawn on its own canvas. */
function makeIcon(id, className = "icon") {
  const canvas = document.createElement("canvas");
  canvas.className = className;
  PixelArt.drawItem(canvas, id);
  return canvas;
}

class GardenUI {
  constructor(game) {
    this.game = game;
    const $ = (id) => document.getElementById(id);
    this.el = {
      // HUD
      energyBar: $("hud-energy-bar"), energyText: $("hud-energy-text"),
      coins: $("hud-coins"), level: $("hud-level"), xpBar: $("hud-xp-bar"), xpText: $("hud-xp-text"),
      btnMap: $("btn-map"), btnBack: $("btn-back"), btnPack: $("btn-pack"), btnNew: $("btn-new"),
      chipTime: $("chip-time"), chipTimeIcon: $("chip-time-icon"), chipHistory: $("chip-history"),
      // side cards
      day: $("status-day"), season: $("status-season"), phase: $("status-phase"),
      seasonFace: $("season-face"), seasonMascot: $("season-mascot"),
      gardenerFace: $("gardener-face"), gardenerName: $("gardener-name"), gardenerTitle: $("gardener-title"),
      btnDay: $("btn-day"), btnPhase: $("btn-phase"), btnUndo: $("btn-undo"),
      // stage
      placeName: $("place-name"), placeInfo: $("place-info"),
      scene: $("garden-scene"), sceneCanvas: $("scene-canvas"), fx: $("scene-fx"),
      bed: $("bed"), grid: $("grid"), shop: $("shop"),
      shopCoins: $("shop-coins"), shopTitle: $("shop-title"), shopList: $("shop-list"), shopTabs: $("shop-tabs"),
      shopFoot: $("shop-foot"),
      gardenerSprite: $("scene-gardener"), keeperSprite: $("scene-keeper"),
      castGardenerName: $("cast-gardener-name"), castKeeperName: $("cast-keeper-name"),
      castKeeper: $("cast-keeper"), scene: $("garden-scene"),
      popover: $("character-popover"),
      popoverName: $("character-popover-name"), popoverText: $("character-popover-text"),
      popoverPlace: $("character-popover-place"), toastRegion: $("toast-region"),
      popoverClose: $("character-popover-close"),
      cropSearchForm: $("crop-search-form"), cropSearch: $("crop-search"), cropDetail: $("crop-detail"),
      cropTabGarden: $("crop-tab-garden"), cropTabAz: $("crop-tab-az"),
      cropViewGarden: $("crop-view-garden"), cropViewAz: $("crop-view-az"),
      cropTabLevel: $("crop-tab-level"), cropViewLevel: $("crop-view-level"),
      cropTabTree: $("crop-tab-tree"), cropViewTree: $("crop-view-tree"), cropPanel: $("panel-crops"),
      cropTabRank: $("crop-tab-rank"), cropViewRank: $("crop-view-rank"), rankSeason: $("rank-season"), rankMetric: $("rank-metric"),
      rankStatus: $("rank-status"), rankPartial: $("rank-partial"), rankEmpty: $("rank-empty"), rankTable: $("rank-table"), rankBody: $("rank-body"),
      treeStatus: $("tree-status"), treeBox: { crop: $("tree-diagram-crop"), bst: $("tree-diagram-bst") },
      treeOrder: { crop: $("tree-order-crop"), bst: $("tree-order-bst") },
      hotbar: $("hotbar"), legend: $("legend"), cellInfo: $("cell-info"),
      // dialogue + history
      srMessage: $("sr-message"),
      history: $("history-list"), historyCount: $("history-count"),
      hashDetails: $("hash-details"), hashSize: $("hash-size"), hashBuckets: $("hash-buckets"),
      hashLoad: $("hash-load"), hashCollisions: $("hash-collisions"),
      // dialogs
      mapDialog: $("map-dialog"), mapCanvas: $("map-canvas"), mapNodes: $("map-nodes"),
      mapHint: $("map-hint"), mapClose: $("map-close"),
      packDialog: $("pack-dialog"), packGrid: $("pack-grid"), packDetail: $("pack-detail"),
      packCount: $("pack-count"), packClose: $("pack-close"),
      harvestBox: $("harvest-inv"), harvestSummary: $("harvest-summary"), harvestKey: $("harvest-sort-key"),
      harvestDir: $("harvest-sort-dir"), harvestBody: $("harvest-body"), harvestEmpty: $("harvest-empty"),
      harvestTable: $("harvest-table"),
    };

    this.cells = [];
    this.hotbarButtons = [];
    this.packButtons = [];
    this.legendCanvases = [];
    this.mapButtons = {};
    this.mapMarker = null;
    this.packSelected = null;
    this.harvestSort = { key: "name", direction: "asc" };   // view setting only; never saved
    this.shopTab = "buy";
    this.traveling = false;
    this.renderedPlace = null;
    this.renderedSeason = null;
    this.toasts = [];
    this.sceneKey = "";
    this.fxKey = "";
    this.gardenerId = DEFAULT_GARDENER;   // the player is always Pinky

    this.buildGrid();
    this.buildHotbar();
    this.buildPack();
    this.buildLegend();
    this.buildCropGuide();
    this.buildMap();
    this.buildHudIcons();
    this.buildScene();
    this.bindEvents();
    this.renderGardener();
    this.render();

    // Real-time growth: check the clock every second (and straight away when the tab comes back).
    this.growthTimer = setInterval(() => this.tickGrowth(), 1000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) this.tickGrowth(); });
  }

  // ---- The garden scene (scenery canvas + weather) --------------------------
  buildScene() {
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(() => this.drawScene()).observe(this.el.scene);
    }
    window.addEventListener("load", () => this.drawScene());
  }

  /** Draw the scenery behind the bed (or the market stalls). Only redraws when something it depends on changed. */
  drawScene() {
    const { scene, bed, sceneCanvas } = this.el;
    const width = scene.clientWidth, height = scene.clientHeight;
    if (!width || !height) return;

    const s = scene.getBoundingClientRect(), r = bed.getBoundingClientRect();
    const bedBox = {
      x: Math.round(r.left - s.left - scene.clientLeft), y: Math.round(r.top - s.top - scene.clientTop),
      w: Math.round(r.width), h: Math.round(r.height),
    };

    const { season, phase } = this.game.time;
    const plot = this.game.place.plot || "Market";
    const key = [season, phase, plot, width, height, bedBox.x, bedBox.y, bedBox.w, bedBox.h].join("|");
    if (key === this.sceneKey) return;
    this.sceneKey = key;

    PixelArt.drawGarden(sceneCanvas, { width, height, bed: bedBox, season, phase, plot });
    sceneCanvas.style.width = `${sceneCanvas.width * PixelArt.SCENE_SCALE}px`;
    sceneCanvas.style.height = `${sceneCanvas.height * PixelArt.SCENE_SCALE}px`;

    this.buildFx(season, phase, height);
  }

  /** Petals, leaves, snow, butterflies or fireflies - whatever suits the season and time of day. */
  buildFx(season, phase, height) {
    const key = `${season}|${phase}`;
    this.el.fx.style.setProperty("--h", `${height}px`);
    if (key === this.fxKey) return;
    this.fxKey = key;
    this.el.fx.replaceChildren();

    const rnd = (a, b) => a + Math.random() * (b - a);
    const add = (kind, vars) => {
      const span = document.createElement("span");
      span.className = `fx fx--${kind}`;
      Object.entries(vars).forEach(([k, v]) => span.style.setProperty(k, v));
      this.el.fx.appendChild(span);
    };
    const faller = (kind, extra = {}) =>
      add(kind, { "--x": `${rnd(0, 98)}%`, "--t": `${rnd(8, 14)}s`, "--d": `-${rnd(0, 14)}s`,
                  "--sway": `${rnd(-40, 40)}px`, ...extra });
    const butterfly = (colors) =>
      add("butterfly", {
        "--x": `${rnd(10, 85)}%`, "--y": `${rnd(48, 85)}%`, "--t": `${rnd(7, 12)}s`, "--d": `-${rnd(0, 8)}s`,
        "--dx": `${rnd(-90, 90)}px`, "--dy": `${rnd(-60, 20)}px`,
        "--img": `url("${PixelArt.butterflyURL(colors[Math.floor(Math.random() * colors.length)])}")`,
      });

    if (season === "Winter") {
      for (let i = 0; i < 30; i++) faller("snow");
    } else if (phase === "Night") {
      for (let i = 0; i < 16; i++) {
        add("firefly", { "--x": `${rnd(4, 96)}%`, "--y": `${rnd(40, 92)}%`, "--t": `${rnd(4, 9)}s`,
                        "--d": `-${rnd(0, 8)}s`, "--dx": `${rnd(-50, 50)}px`, "--dy": `${rnd(-40, 30)}px` });
      }
    } else if (season === "Spring") {
      for (let i = 0; i < 14; i++) faller("petal");
      for (let i = 0; i < 3; i++) butterfly(["#ff8fb8", "#ffd23f", "#9fd8ff"]);
    } else if (season === "Summer") {
      for (let i = 0; i < 5; i++) butterfly(["#ffd23f", "#ff9800", "#ffffff", "#c9a7ff"]);
    } else {
      const leaf = ["#f58a3c", "#d9622b", "#f7c548"];
      for (let i = 0; i < 14; i++) faller("leaf", { "--c": leaf[i % leaf.length] });
    }
  }

  // ---- One-time DOM building ------------------------------------------------
  buildGrid() {
    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
      const [row, col] = GardenGrid.fromFlat(i);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cell" + ((row + col) % 2 ? " alt" : "");
      btn.dataset.row = String(row);
      btn.dataset.col = String(col);
      btn.setAttribute("aria-label", `Row ${row}, column ${col}`);
      const canvas = document.createElement("canvas");
      btn.appendChild(canvas);
      this.el.grid.appendChild(btn);
      this.cells.push({ btn, canvas });
    }
  }

  buildHotbar() {
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "slot";
      btn.dataset.slot = String(i);
      this.el.hotbar.appendChild(btn);
      this.hotbarButtons.push(btn);
    }
  }

  buildPack() {
    for (let i = 0; i < BACKPACK_SLOTS; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "slot" + (i < HOTBAR_SLOTS ? " slot--hot" : "");
      btn.dataset.slot = String(i);
      this.el.packGrid.appendChild(btn);
      this.packButtons.push(btn);
    }
  }

  buildLegend() {
    const entries = STAGE_NAMES.map((name, stage) => ({ name: `${STAGE_SYMBOLS[stage]} ${name}`, stage }));
    entries.forEach(({ name, stage }) => {
      const li = document.createElement("li");
      const canvas = document.createElement("canvas");
      const label = document.createElement("span");
      label.textContent = name;
      li.append(canvas, label);
      this.el.legend.appendChild(li);
      this.legendCanvases.push({ canvas, stage });
    });
    const li = document.createElement("li");
    const thirsty = document.createElement("canvas");
    thirsty.className = "legend-thirsty";
    this.legendThirsty = thirsty;
    const label = document.createElement("span");
    label.textContent = "Thirsty";
    li.append(thirsty, label);
    this.el.legend.appendChild(li);
  }

  buildHudIcons() {
    document.querySelectorAll("[data-icon]").forEach((holder) => holder.replaceChildren(makeIcon(holder.dataset.icon, "icon icon--hud")));
  }


  /** The world map: a painted canvas with one clickable button per place. */
  buildMap() {
    Object.values(LOCATIONS).forEach((loc) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "map-node";
      btn.dataset.place = loc.id;
      btn.style.left = `${loc.x}%`;
      btn.style.top = `${loc.y}%`;
      const name = document.createElement("span");
      name.className = "map-name";
      name.textContent = loc.name;
      const badge = document.createElement("span");
      badge.className = "map-badge";
      const pin = document.createElement("span");
      pin.className = "map-pin";
      const icon = document.createElement("canvas");
      icon.className = "map-icon";
      PixelArt.drawMapIcon(icon, loc.id);
      pin.appendChild(icon);
      btn.append(pin, name, badge);
      this.el.mapNodes.appendChild(btn);
      this.mapButtons[loc.id] = { btn, badge };
    });
    const marker = document.createElement("div");
    marker.className = "map-marker";
    this.mapMarker = marker;
    this.el.mapNodes.appendChild(marker);
  }

  // ---- Events ---------------------------------------------------------------
  bindEvents() {
    const { el } = this;

    // guardian popover: click the guardian to open/close it, X or any outside click closes it
    el.castKeeper.addEventListener("click", () => this.toggleGuardianPopover());
    el.popoverClose.addEventListener("click", () => this.hideGuardianPopover({ refocus: true }));
    document.addEventListener("pointerdown", (e) => {
      if (el.popover.hidden) return;
      if (el.popover.contains(e.target) || el.castKeeper.contains(e.target)) return;
      this.hideGuardianPopover();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !el.popover.hidden) this.hideGuardianPopover({ refocus: true });
    });
    window.addEventListener("resize", () => { if (!el.popover.hidden) this.positionGuardianPopover(); });
    window.addEventListener("load", () => { if (!el.popover.hidden) this.positionGuardianPopover(); });

    el.grid.addEventListener("click", (e) => {
      const btn = e.target.closest(".cell");
      if (btn) this.handleCellClick(Number(btn.dataset.row), Number(btn.dataset.col), btn);
    });
    // Hover / focus a tile: show its label with the countdown. Leave it: drop the countdown again.
    const cellArgs = (btn) => {
      const row = Number(btn.dataset.row), col = Number(btn.dataset.col);
      return [btn, row, col, GardenGrid.toFlat(row, col), this.game.place.plot, this.game.clock()];
    };
    const showInfo = (e) => {
      const btn = e.target.closest(".cell");
      if (!btn || !this.game.place.plot) return;
      this.setCellLabel(...cellArgs(btn), true);
      el.cellInfo.textContent = btn.title;
    };
    const hideInfo = (e) => {
      const btn = e.target.closest(".cell");
      if (!btn || !this.game.place.plot) return;
      if (e.relatedTarget && btn.contains(e.relatedTarget)) return;
      this.setCellLabel(...cellArgs(btn), document.activeElement === btn);
    };
    el.grid.addEventListener("mouseover", showInfo);
    el.grid.addEventListener("focusin", showInfo);
    el.grid.addEventListener("mouseout", hideInfo);
    el.grid.addEventListener("focusout", hideInfo);
    el.grid.addEventListener("mouseleave", () => this.renderCellInfo());

    el.hotbar.addEventListener("click", (e) => {
      const btn = e.target.closest(".slot");
      if (btn) this.pickHotbar(Number(btn.dataset.slot));
    });

    el.btnDay.addEventListener("click", () => this.handleSleep());
    el.btnPhase.addEventListener("click", () => this.handleTogglePhase());
    el.btnUndo.addEventListener("click", () => this.handleUndo());
    this.bindPanels();
    el.btnMap.addEventListener("click", () => this.openMap());
    el.btnBack.addEventListener("click", () => this.handleBack());
    el.btnPack.addEventListener("click", () => this.openPack());
    el.btnNew.addEventListener("click", () => this.handleNewGame());
    el.mapClose.addEventListener("click", () => this.closeMap());
    el.packClose.addEventListener("click", () => el.packDialog.close());
    el.hashDetails.addEventListener("toggle", () => this.renderHashDetails());
    el.harvestKey.addEventListener("change", () => { this.harvestSort.key = el.harvestKey.value; this.renderHarvestInventory(); });
    el.harvestDir.addEventListener("click", () => {
      this.harvestSort.direction = this.harvestSort.direction === "asc" ? "desc" : "asc";
      this.renderHarvestInventory();
    });

    el.mapNodes.addEventListener("click", (e) => {
      const btn = e.target.closest(".map-node");
      if (btn) this.handleTravel(btn.dataset.place);
    });

    // backpack: click a slot to select it, click another to swap
    el.packGrid.addEventListener("click", (e) => {
      const btn = e.target.closest(".slot");
      if (btn) this.handlePackClick(Number(btn.dataset.slot));
    });
    el.packDetail.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (btn) this.handlePackAction(btn.dataset.act);
    });

    // market
    el.shopTabs.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-tab]");
      if (btn) { this.shopTab = btn.dataset.tab; this.renderShop(); }
    });
    el.shopList.addEventListener("click", (e) => {
      const buy = e.target.closest("button[data-buy]");
      const sell = e.target.closest("button[data-sell]");
      if (buy) this.handleBuy(buy.dataset.buy, Number(buy.dataset.qty), buy);
      if (sell) this.handleSell(Number(sell.dataset.sell), sell.dataset.qty === "all" ? Infinity : Number(sell.dataset.qty), sell);
    });
    el.shopFoot.addEventListener("click", (e) => {
      if (e.target.closest("button[data-sellall]")) this.handleSellAll(e.target);
    });

    // Dialogs close when you click the dark backdrop
    [el.mapDialog, el.packDialog].forEach((dlg) =>
      dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); })
    );
    el.packDialog.addEventListener("close", () => { this.packSelected = null; this.renderPack(); });

    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (["SELECT", "INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
      const key = e.key.toLowerCase();
      if (key === "m") { el.mapDialog.open ? this.closeMap() : this.openMap(); return; }
      if (key === "b") { el.packDialog.open ? el.packDialog.close() : this.openPack(); return; }
      if (el.mapDialog.open || el.packDialog.open) return;
      if (/^[1-8]$/.test(key)) this.pickHotbar(Number(key) - 1);
      else if (key === "n") this.handleSleep();
      else if (key === "t") this.handleTogglePhase();
      else if (key === "u") this.handleUndo();
      else if (key === "e") this.handleEatQuick();
    });
  }

  // ---- Handlers -------------------------------------------------------------
  /** Common tail of every action: show the result, save, redraw. */
  finish(result) {
    if (result.ok) {
      this.speak(result.msg);                      // no popups for actions; screen readers still hear it
      this.game.save();
    } else {
      this.speak(result.msg);                      // errors: no popup, screen readers still hear them
    }
    this.render();
  }

  pickHotbar(i) {
    this.game.selectSlot(i);
    this.game.save();
    this.renderHotbar();
    this.renderCellInfo();
  }

  handleCellClick(row, col, btn) {
    const result = this.game.useOnTile(row, col);
    if (result.ok) {
      this.finish(result);
      this.popCell(row, col);
      this.hopGardener();
      if (result.kind === "harvest") {
        this.floatAt(btn, `+${result.qty}`, result.item);
        if (result.levels) this.pulse(this.el.level);
      }
    } else {
      this.finish(result);
    }
  }

  handleSleep() {
    const res = this.game.sleep();
    this.finish({ ok: true });
    this.speak(this.describeNewDay(res.info));
  }

  handleTogglePhase() {
    const res = this.game.togglePhase();
    this.finish({ ok: true });
    const text = res.info ? `It is morning. ${this.describeNewDay(res.info)}` : "Night falls. Sleep to start a new day and grow your plants.";
    this.speak(text);
  }

  handleUndo() {
    const res = this.game.undo();
    this.finish(res);
  }

  handleEatQuick() {
    const held = this.game.inventory.slots[this.game.selected];
    let index = held && ITEMS[held.id].food ? this.game.selected : this.game.inventory.slots.findIndex((s) => s && ITEMS[s.id].food);
    if (index < 0) { this.speak("You have nothing to eat. Harvest some crops!"); return; }
    this.finish(this.game.eat(index));
  }

  handleNewGame() {
    if (!window.confirm("Start a new game? Your garden, backpack and coins will be reset.")) return;
    GardenGame.clearSave();
    window.location.reload();
  }

  describeNewDay(info) {
    const parts = [`Good morning! Day ${info.day}, ${info.season}. Energy refilled!`];
    if (info.seasonChanged) parts.push(`The season changed to ${info.season}!`);
    let ready = 0;
    PLOT_NAMES.forEach((p) => { ready += this.game.grid.stats(p).ready; });
    if (ready) parts.push(`${ready} crop${ready === 1 ? " is" : "s are"} ready to harvest.`);
    return parts.join(" ");
  }

  // ---- Backpack ---------------------------------------------------------------
  openPack() {
    this.closePanels();
    if (this.traveling || this.el.packDialog.open) return;
    this.renderPack();
    this.el.packDialog.showModal();
  }

  handlePackClick(i) {
    const inv = this.game.inventory;
    if (this.packSelected === null) {
      this.packSelected = inv.slots[i] ? i : null;
    } else if (this.packSelected === i) {
      this.packSelected = null;
    } else {
      this.game.swapSlots(this.packSelected, i);
      this.game.save();
      this.packSelected = i;
      this.renderHotbar();
    }
    this.renderPack();
  }

  handlePackAction(act) {
    const i = this.packSelected;
    if (i === null) return;
    const slot = this.game.inventory.slots[i];
    if (!slot) return;
    let res = { ok: false, msg: "" };
    if (act === "eat") res = this.game.eat(i);
    else if (act === "drop1") res = this.game.drop(i, 1);
    else if (act === "drop") res = this.game.drop(i);
    else if (act === "hold") { this.game.selectSlot(i); res = { ok: true, msg: `${ITEMS[slot.id].name} is in your hand.` }; }
    if (!this.game.inventory.slots[i]) this.packSelected = null;
    this.finish(res);
    this.renderPack();
  }

  // ---- Market -------------------------------------------------------------------
  handleBuy(itemId, qty, btn) {
    const res = this.game.buy(itemId, qty);
    this.finish(res);
    if (res.ok) this.floatAt(btn, `${res.coins}`, "coin");
  }

  handleSell(slot, qty, btn) {
    const res = this.game.sell(slot, qty);
    this.finish(res);
    if (res.ok) this.floatAt(btn, `+${res.coins}`, "coin");
  }

  handleSellAll(btn) {
    const res = this.game.sellAllCrops();
    this.finish(res);
    if (res.ok) this.floatAt(btn, `+${res.coins}`, "coin");
  }

  // ---- World map --------------------------------------------------------------
  openMap() {
    this.closePanels();
    if (this.traveling || this.el.mapDialog.open) return;
    this.el.mapDialog.showModal();
    this.drawMap();
    this.placeMarker(this.game.location, false);
    this.renderMapNodes();
    this.el.mapHint.textContent = "Click a place to walk there.";
  }

  closeMap() {
    if (!this.traveling) this.el.mapDialog.close();
  }

  /** Paint the map picture at its real art size (3 screen pixels per art pixel, like the garden). */
  drawMap(route = null) {
    const W = 192, H = 128;
    const nodes = Object.values(LOCATIONS).map((l) => ({ id: l.id, x: Math.round(l.x * W / 100), y: Math.round(l.y * H / 100) }));
    PixelArt.drawWorldMap(this.el.mapCanvas, {
      width: W, height: H, nodes, roads: ROADS, route,
      season: this.game.time.season, phase: this.game.time.phase,
    });
  }

  renderMapNodes() {
    const g = this.game;
    Object.values(LOCATIONS).forEach((loc) => {
      const { btn, badge } = this.mapButtons[loc.id];
      btn.classList.toggle("here", loc.id === g.location);
      btn.setAttribute("aria-label", `${loc.name}${loc.id === g.location ? " (you are here)" : ""}`);
      btn.setAttribute("aria-current", loc.id === g.location ? "location" : "false");
      if (loc.plot) {
        const st = g.grid.stats(loc.plot);
        const bits = [];
        if (st.ready) bits.push(`${st.ready} ripe`);
        if (st.thirsty) bits.push(`${st.thirsty} thirsty`);
        badge.textContent = bits.length ? bits.join(" · ") : `${st.planted} planted`;
        badge.classList.toggle("alert", st.ready > 0 || st.thirsty > 0);
      } else {
        badge.textContent = "shop";
        badge.classList.remove("alert");
      }
    });
  }

  placeMarker(placeId, animate = true) {
    const loc = LOCATIONS[placeId];
    const m = this.mapMarker;
    m.style.transition = animate && !prefersReducedMotion() ? "left 0.5s linear, top 0.5s linear" : "none";
    m.style.left = `${loc.x}%`;
    m.style.top = `${loc.y}%`;
    if (!m.firstChild) m.appendChild(PixelArt.createFace(this.gardenerId, "sm"));
    else m.replaceChildren(PixelArt.createFace(this.gardenerId, "sm"));
  }

  /** Walk the shortest route (found with BFS) one stop at a time, then arrive. */
  async handleTravel(placeId) {
    if (this.traveling) return;
    const from = this.game.location;
    const res = this.game.travel(placeId);
    if (!res.ok) { this.el.mapHint.textContent = res.msg; return; }

    this.traveling = true;
    const route = res.route;
    this.drawMap(route);
    this.el.mapHint.textContent = `Route: ${route.map((id) => LOCATIONS[id].name).join(" → ")}`;
    this.placeMarker(from, false);
    void this.mapMarker.offsetWidth;
    for (let i = 1; i < route.length; i++) {
      this.placeMarker(route[i], true);
      await sleep(prefersReducedMotion() ? 0 : 560);
    }
    this.renderMapNodes();
    await sleep(prefersReducedMotion() ? 0 : 150);
    this.traveling = false;
    this.el.mapDialog.close();

    this.game.save();
    this.render();
    const loc = LOCATIONS[placeId];
    this.speak(`You arrived at ${loc.name}.`);
  }

  /** The "Back" button: walk to the most recent previous place (no map animation, same travel rules). */
  handleBack() {
    if (this.traveling || this.el.mapDialog.open || this.el.packDialog.open) return;
    this.closePanels();
    const res = this.game.goBack();
    if (!res.ok) { this.speak(res.msg); this.render(); return; }
    this.game.save();
    this.render();
    this.speak(`You went back to ${this.game.place.name}.`);
  }

  /** Tell screen readers something happened, without showing anything on screen. */
  speak(text) {
    if (!text) return;
    this.el.srMessage.textContent = "";                    // clear first so repeated text is read again
    setTimeout(() => { this.el.srMessage.textContent = text; }, 30);
  }

  // ---- Toasts: small, short-lived feedback that never blocks clicks ---------------
  /**
   * Show a small toast (about 2 seconds; a little longer for long text) and read it out through the
   * sr-only live region. `warn` = red toast for errors, `big` = larger toast (used for harvests).
   */
  toast(text, { warn = false, big = false } = {}) {
    if (!text) return;
    this.speak(text);

    const region = this.el.toastRegion;
    const t = document.createElement("div");
    t.className = "toast" + (warn ? " toast--warn" : "") + (big ? " toast--big" : "");
    t.textContent = text;
    region.appendChild(t);
    // FIFO behavior: when more than 3 toasts exist, the oldest toast is removed first.
    while (region.children.length > 3) region.firstElementChild.remove();   // keep the stack small
    const ms = (big ? 2800 : 2000) + Math.min(1500, Math.max(0, text.length - 40) * 30);
    setTimeout(() => {
      t.classList.add("toast--out");
      setTimeout(() => t.remove(), 250);
    }, ms);
  }

  // ---- Crop Guide (floating panel): CropTree by garden, CropBST A-Z + search ----------
  /** Builds both views once. The data is fixed, so nothing here needs to re-render while you play. */
  buildCropGuide() {
    this.cropTree = new CropTree();     // root -> garden -> crop
    this.cropBst = new CropBST();       // alphabetical catalog
    this.cropTab = "garden";

    this.el.cropTabGarden.addEventListener("click", () => this.setCropTab("garden"));
    this.el.cropTabAz.addEventListener("click", () => this.setCropTab("az"));
    this.el.cropTabLevel.addEventListener("click", () => this.setCropTab("level"));
    this.el.cropTabTree.addEventListener("click", () => this.setCropTab("tree"));
    this.el.cropTabRank.addEventListener("click", () => this.setCropTab("rank"));
    this.rankSeason = "current";          // which season the Rankings tab shows: "current" or a completed season's serial (a view setting, never saved)
    this.rankMetric = "value";            // "value" (default) or "quantity"
    this.el.rankSeason.addEventListener("change", () => { this.rankSeason = this.el.rankSeason.value; this.renderRankings(); });
    this.el.rankMetric.addEventListener("change", () => { this.rankMetric = this.el.rankMetric.value; this.renderRankings(); });
    this.el.cropSearchForm.addEventListener("submit", (e) => { e.preventDefault(); this.searchCrop(); });
    this.el.cropSearch.addEventListener("input", () => this.searchCrop());

    // By Garden: preorder DFS lists root, then each garden, then that garden's crops (summaries come from postorder)
    const summaries = this.cropTree.summarize();   // postorder DFS: crops first, then each category's totals
    const list = document.createElement("ul");
    list.className = "crop-tree";
    this.cropTree.preorder(this.cropTree.root, (node) => {
      const depth = node.parent ? (node.parent.parent ? 2 : 1) : 0;
      const li = document.createElement("li");
      li.className = `crop-node crop-node--${depth}`;
      if (depth < 2) {
        li.textContent = depth === 0 ? `🌳 ${node.name}` : `${CROP_PLOT_EMOJI[node.name] || "🌿"} ${node.name}`;
      } else {
        li.appendChild(this.makeCropButton(node.name, node.cropId));
      }
      list.appendChild(li);
      if (depth === 1) {                         // the summary sits right under its category name
        const sum = summaries.get(node);
        const note = document.createElement("li");
        note.className = "crop-summary";
        note.textContent = `${sum.count} crops · seeds ${sum.seedTotal} coins · ${sum.xpTotal} XP`;
        note.setAttribute("aria-label", `${node.name} summary: ${sum.count} crops, total seed price ${sum.seedTotal} coins, total XP ${sum.xpTotal}`);
        list.appendChild(note);
      }
    });
    this.el.cropViewGarden.replaceChildren(list);

    // A-Z Catalog: inorder DFS of the BST gives the names alphabetically
    this.cropNames = {};                 // cropId -> its current catalog name (changes if the player renames a crop)
    Object.keys(CROPS).forEach((id) => { this.cropNames[id] = CROPS[id].name; });
    this.cropEditOpen = false;
    this.cropEditNote = "";
    this.renderCropAz();
    this.treeRun = 0;                    // id of the running traversal animation (0 = none)
    this.treeTimer = null;
    this.treeCropEls = new Map();
    this.treeBstEls = new Map();
    this.el.cropViewTree.querySelectorAll("[data-traversal]").forEach((b) => {
      b.addEventListener("click", () => this.runTraversal(b.dataset.traversal));
    });
    this.renderCropTreeDiagram();
    this.renderBstDiagram();

    // Level View: BFS level-order, one labelled row per level of the tree
    const LEVEL_LABELS = ["Level 0 · Root", "Level 1 · Gardens", "Level 2 · Crops"];
    const levels = document.createElement("div");
    levels.className = "crop-levels";
    this.cropTree.levels().forEach((nodes, depth) => {
      const row = document.createElement("section");
      row.className = "crop-level";
      row.setAttribute("aria-label", LEVEL_LABELS[depth] || `Level ${depth}`);
      const label = document.createElement("h3");
      label.className = "crop-level-label";
      label.textContent = LEVEL_LABELS[depth] || `Level ${depth}`;
      const items = document.createElement("ul");
      items.className = "crop-level-items";
      nodes.forEach((node) => {
        const li = document.createElement("li");
        if (node.cropId) li.appendChild(this.makeCropButton(node.name, node.cropId));
        else li.textContent = node.name;
        li.className = node.cropId ? "crop-chip crop-chip--crop" : "crop-chip";
        items.appendChild(li);
      });
      row.append(label, items);
      levels.appendChild(row);
    });
    this.el.cropViewLevel.replaceChildren(levels);
  }

  /** (Re)draws the A-Z Catalog from the BST. Called at start and again after every edit.
   *  Time: O(n) for the inorder walk, plus O(log n) average per name for the search that finds its cropId. */
  renderCropAz() {
    const az = document.createElement("ol");
    az.className = "crop-az";
    this.cropBst.inorder().forEach((name) => {
      const li = document.createElement("li");
      li.appendChild(this.makeCropButton(name, this.cropBst.search(name).cropId));
      az.appendChild(li);
    });
    this.el.cropViewAz.replaceChildren(az);
  }

  // ---- Tree View: animated diagrams of CropTree and CropBST ---------------------------
  /** Lays a tree out left to right (depth = column) and draws it as SVG: a box per node, elbow lines to children.
   *  `kids(node)` lists a node's children; with `inorderRows` (a BST) kids is [left, right] and a node's row is
   *  its inorder position, otherwise a parent sits in the middle of its children's rows.
   *  Returns Map key -> <g> element, where key(node) says how to find a node's box again.
   *  Time: O(n) - one layout pass and one drawing pass over n nodes.  Space: O(n) for the positions and the SVG. */
  drawTreeDiagram(holder, root, kids, key, label, inorderRows = false) {
    const NH = 20, GAP = 20, ROW = 26, PAD = 6;
    const boxW = (n) => Math.max(44, String(n.name).length * 6 + 14);   // box width follows the name's length
    const pos = new Map();
    let nextRow = 0, maxDepth = 0;
    const place = (node, depth) => {
      maxDepth = Math.max(maxDepth, depth);
      const kid = kids(node);
      if (inorderRows) {                                   // left subtree, this node, right subtree
        if (kid[0]) place(kid[0], depth + 1);
        pos.set(node, { depth, row: nextRow++ });
        if (kid[1]) place(kid[1], depth + 1);
        return;
      }
      kid.forEach((k) => place(k, depth + 1));
      const rows = kid.map((k) => pos.get(k).row);
      pos.set(node, { depth, row: rows.length ? (Math.min(...rows) + Math.max(...rows)) / 2 : nextRow++ });
    };
    if (root) place(root, 0);

    // Every depth is one column, as wide as its widest box
    const colW = Array(maxDepth + 1).fill(0);
    pos.forEach((p, node) => { colW[p.depth] = Math.max(colW[p.depth], boxW(node)); });
    const colX = [];
    colW.forEach((w, d) => { colX[d] = d === 0 ? PAD : colX[d - 1] + colW[d - 1] + GAP; });

    const NS = "http://www.w3.org/2000/svg";
    const el = (name, attrs = {}) => {
      const e = document.createElementNS(NS, name);
      Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
      return e;
    };
    const xy = (n) => ({ x: colX[pos.get(n).depth], y: PAD + pos.get(n).row * ROW });
    const svg = el("svg", {
      class: "tree-svg", role: "img", "aria-label": label,
      width: colX[maxDepth] + colW[maxDepth] + PAD + 2, height: PAD * 2 + Math.max(nextRow - 1, 0) * ROW + NH + 2,
    });
    const lines = el("g"), boxes = el("g");
    const els = new Map();
    pos.forEach((_, node) => {
      const p = xy(node), w = boxW(node);
      kids(node).filter(Boolean).forEach((k) => {         // elbow line: right edge of parent -> left edge of child
        const q = xy(k), mid = q.x - GAP / 2;
        lines.appendChild(el("path", { class: "tree-line", d: `M${p.x + w} ${p.y + NH / 2} H${mid} V${q.y + NH / 2} H${q.x}` }));
      });
      const g = el("g", { class: "tn" + (pos.get(node).depth === 0 ? " tn--root" : ""), transform: `translate(${p.x} ${p.y})` });
      g.appendChild(el("rect", { class: "tn-shadow", x: 2, y: 2, width: w, height: NH, rx: 4 }));
      g.appendChild(el("rect", { class: "tn-box", x: 0, y: 0, width: w, height: NH, rx: 4 }));
      const t = el("text", { class: "tn-text", x: w / 2, y: NH / 2 });
      t.textContent = node.name;
      g.appendChild(t);
      boxes.appendChild(g);
      els.set(key(node), g);
    });
    svg.append(lines, boxes);
    holder.replaceChildren(svg);
    return els;
  }

  /** CropTree diagram: root -> three gardens -> 12 crops (never changes while playing). */
  renderCropTreeDiagram() {
    const t = this.cropTree;
    this.treeCropEls = this.drawTreeDiagram(this.el.treeBox.crop, t.root, (n) => n.children, (n) => n, "CropTree diagram");
    // Gardens get the butter colour too so the three levels read at a glance
    t.root.children.forEach((c) => this.treeCropEls.get(c).classList.add("tn--root"));
  }

  /** CropBST diagram: the real tree made by inserting the crops alphabetically. Redrawn after an Edit Crop save. */
  renderBstDiagram() {
    this.stopTraversal();
    this.treeBstEls = this.drawTreeDiagram(this.el.treeBox.bst, this.cropBst.root, (n) => [n.left, n.right],
      (n) => n.name.toLowerCase(), "CropBST diagram", true);
  }

  stopTraversal() {
    this.treeRun++;
    clearTimeout(this.treeTimer);
    this.treeTimer = null;
    this.el.cropViewTree.querySelectorAll("[data-traversal]").forEach((b) => b.setAttribute("aria-pressed", "false"));
  }

  /** Runs one traversal and animates it: each visited node lights up in turn (TRAVERSAL_DELAY_MS apart)
   *  and its name is added to the visiting-order list under the diagram.
   *  Preorder, postorder and BFS walk the CropTree; inorder uses CropBST.inorder().
   *  Time: O(n) for the traversal that collects the visiting order + n animation steps of O(1) DOM work each.
   *  Space: O(n) for the order array. */
  runTraversal(kind) {
    const tree = this.cropTree;
    const TRAVERSALS = {
      // Preorder DFS: node first, then each child.  Time O(n), extra space O(h) call stack.
      preorder: { on: "crop", text: "Preorder DFS (CropTree): visit the node, then each child.",
        order: () => { const o = []; tree.preorder(tree.root, (n) => o.push(n)); return o; } },
      // Inorder DFS: left, node, right.  CropBST.inorder() returns the names alphabetically.  Time O(n), space O(h).
      inorder: { on: "bst", text: "Inorder DFS (CropBST): left subtree, node, right subtree. Alphabetical!",
        order: () => this.cropBst.inorder() },
      // Postorder DFS: all children first, then the node.  Time O(n), extra space O(h).
      postorder: { on: "crop", text: "Postorder DFS (CropTree): visit all children, then the node.",
        order: () => { const o = []; tree.postorder(tree.root, (n) => o.push(n)); return o; } },
      // BFS level-order: a queue visits the tree one level at a time.  Time O(n), extra space O(w) for the widest level.
      bfs: { on: "crop", text: "BFS Level-Order (CropTree): a queue visits level by level.",
        order: () => { const o = []; tree.bfs((n) => o.push(n)); return o; } },
    };
    const run = TRAVERSALS[kind];
    if (!run) return;

    this.stopTraversal();                                  // a new click restarts the demo
    const myRun = this.treeRun;
    ["crop", "bst"].forEach((k) => {                       // clear both diagrams and lists
      (k === "crop" ? this.treeCropEls : this.treeBstEls).forEach((g) => g.classList.remove("tn--current", "tn--seen"));
      this.el.treeOrder[k].replaceChildren();
    });
    this.el.cropViewTree.querySelectorAll("[data-traversal]")
      .forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.traversal === kind)));

    const visits = run.order();
    const els = run.on === "crop" ? this.treeCropEls : this.treeBstEls;
    const list = this.el.treeOrder[run.on];
    this.el.treeStatus.textContent = run.text;
    let i = 0, last = null;
    const step = () => {
      if (myRun !== this.treeRun) return;                  // cancelled or restarted
      if (last) last.classList.replace("tn--current", "tn--seen");
      if (i >= visits.length) {
        this.el.treeStatus.textContent = `${run.text} Done: ${visits.length} nodes visited.`;
        this.treeTimer = null;
        return;
      }
      const v = visits[i++];
      const name = typeof v === "string" ? v : v.name;
      last = els.get(typeof v === "string" ? v.toLowerCase() : v);
      if (last) last.classList.add("tn--current");
      const li = document.createElement("li");
      li.textContent = name;
      list.appendChild(li);
      this.treeTimer = setTimeout(step, TRAVERSAL_DELAY_MS);
    };
    step();
  }

  /** A crop name with its little pixel icon; clicking it shows the crop's details. */
  makeCropButton(name, cropId) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "crop-link";
    b.title = `Show details for ${name}`;
    if (cropId) b.appendChild(makeIcon(cropId, "icon icon--crop"));
    b.appendChild(document.createTextNode(name));
    b.addEventListener("click", () => {
      this.el.cropSearch.value = (cropId && this.cropNames[cropId]) || name;   // the garden/level views show original names
      this.searchCrop();
    });
    return b;
  }

  setCropTab(tab) {
    this.cropTab = tab;
    const garden = tab === "garden";
    this.el.cropTabGarden.setAttribute("aria-selected", String(garden));
    this.el.cropTabAz.setAttribute("aria-selected", String(tab === "az"));
    this.el.cropTabLevel.setAttribute("aria-selected", String(tab === "level"));
    this.el.cropViewGarden.hidden = !garden;
    this.el.cropViewAz.hidden = tab !== "az";
    this.el.cropViewLevel.hidden = tab !== "level";
    this.el.cropTabTree.setAttribute("aria-selected", String(tab === "tree"));
    this.el.cropViewTree.hidden = tab !== "tree";
    this.el.cropTabRank.setAttribute("aria-selected", String(tab === "rank"));
    this.el.cropViewRank.hidden = tab !== "rank";
    if (tab === "rank") this.renderRankings();
    this.el.cropPanel.classList.toggle("float-panel--wide", tab === "tree");   // the diagrams need more room
    if (tab !== "tree") this.stopTraversal();
  }

  /**
   * Crop Guide > Rankings: crops of ONE chosen season, ranked with Merge Sort (see section 6e).
   * It only READS the tracker. render() calls it whenever the tab is showing, so it follows harvests, Undo,
   * season changes and loading. "Current" follows the current season; a completed season stays where you put it.
   */
  renderRankings() {
    const el = this.el, tracker = this.game.tracker;
    const choices = tracker.seasonChoices();
    if (!choices.some((c) => c.key === this.rankSeason)) this.rankSeason = "current";   // e.g. after New game or loading
    const choice = choices.find((c) => c.key === this.rankSeason);

    el.rankSeason.replaceChildren(...choices.map((c) => {
      const o = document.createElement("option");
      o.value = c.key;
      o.textContent = `${c.label} (${c.status}${c.partial ? ", partial" : ""})`;
      return o;
    }));
    el.rankSeason.value = choice.key;
    el.rankMetric.value = this.rankMetric;

    const current = choice.status === "current";
    el.rankStatus.textContent = `${choice.label} · ${current ? "Current season (still in progress)" : "Completed season"}`;
    el.rankPartial.hidden = !choice.partial;
    el.rankPartial.textContent = current
      ? "Partial tracking: this season began before harvest tracking started, so it only counts harvests since then."
      : "Partial tracking: this season began before harvest tracking started, so it only counts harvests made after that.";

    const rows = rankSeasonCrops(tracker.findSeason(choice.serial), this.rankMetric);
    el.rankEmpty.hidden = rows.length > 0;
    el.rankEmpty.textContent = current
      ? "No harvests recorded yet this season. Harvest a ripe crop and it will appear here."
      : "Nothing was harvested in this season.";
    el.rankTable.hidden = rows.length === 0;
    const cell = (text, cls) => { const td = document.createElement("td"); td.textContent = text; if (cls) td.className = cls; return td; };
    el.rankBody.replaceChildren(...rows.map((r) => {
      const tr = document.createElement("tr");
      tr.append(cell(String(r.rank), "num"), cell(this.cropNames[r.cropId] || r.name, "harvest-name"), cell(String(r.quantity), "num"), cell(String(r.value), "num"));
      return tr;
    }));
  }

  /** Looks the typed name up with CropBST.search(name) and shows the details, or "Crop not found". */
  searchCrop() {
    const query = this.el.cropSearch.value.trim();
    const box = this.el.cropDetail;
    if (!query) { box.hidden = true; box.replaceChildren(); return; }
    box.hidden = false;
    const node = this.cropBst.search(query);
    if (!node) {
      const p = document.createElement("p");
      p.className = "crop-missing";
      p.textContent = `Crop not found: "${query}"`;
      box.className = "crop-detail crop-detail--missing";
      box.replaceChildren(p);
      return;
    }
    const d = node.data;
    const head = document.createElement("div");
    head.className = "crop-detail-head";
    if (node.cropId) head.appendChild(makeIcon(node.cropId, "icon icon--crop-big"));
    const title = document.createElement("div");
    const strong = document.createElement("b");
    strong.textContent = node.name;
    const small = document.createElement("small");
    small.textContent = d.plot;
    title.append(strong, small);
    head.appendChild(title);

    const rows = [
      ["Unlocks at level", d.level], ["Grows in", `${d.growMinutes} min after watering`],
      ["Seed price", `${d.seedPrice} coins`], ["Sells for", `${d.sellPrice} coins each`],
      ["Harvest yield", d.yield], ["XP", d.xp], ["Energy if eaten", d.food || "not food"],
    ];
    const dl = document.createElement("dl");
    rows.forEach(([k, v]) => {
      const dt = document.createElement("dt"); dt.textContent = k;
      const dd = document.createElement("dd"); dd.textContent = String(v);
      dl.append(dt, dd);
    });
    box.className = "crop-detail";
    box.replaceChildren(head, dl, this.buildCropEditor(node));
  }

  /** The small "Edit Crop" form under a crop's details. It edits the Crop Guide's catalog copy only:
   *  the real CROPS table (planting, market prices, saves, growth) is never touched. */
  buildCropEditor(node) {
    const d = node.data;
    const wrap = document.createElement("details");
    wrap.className = "crop-edit";
    wrap.open = this.cropEditOpen;
    wrap.addEventListener("toggle", () => { this.cropEditOpen = wrap.open; });
    const sum = document.createElement("summary");
    sum.textContent = "✏️ Edit Crop";
    const form = document.createElement("form");
    form.className = "crop-edit-form";
    form.autocomplete = "off";

    const field = (label, name, type, value, attrs = {}) => {
      const l = document.createElement("label");
      l.textContent = label;
      const i = document.createElement("input");
      i.type = type; i.name = name; i.value = value;
      Object.assign(i, attrs);
      l.appendChild(i);
      form.appendChild(l);
      return i;
    };
    field("Name", "name", "text", node.name, { maxLength: 20, required: true });
    field("Seed price", "seedPrice", "number", d.seedPrice, { min: 1, max: 9999, step: 1, required: true });
    field("Growth time (min)", "growMinutes", "number", d.growMinutes, { min: 1, max: 999, step: 1, required: true });
    field("Unlock level", "level", "number", d.level, { min: 1, max: 99, step: 1, required: true });

    const row = document.createElement("div");
    row.className = "crop-edit-actions";
    const save = document.createElement("button");
    save.type = "submit"; save.className = "btn btn--sm"; save.textContent = "Save";
    const reset = document.createElement("button");
    reset.type = "button"; reset.className = "btn btn--sm btn--quiet"; reset.textContent = "Reset";
    reset.title = "Put this crop back to its original catalog values";
    row.append(save, reset);
    const note = document.createElement("p");
    note.className = "crop-edit-note";
    note.setAttribute("role", "status");
    note.textContent = this.cropEditNote || "Guide only: changes here don't affect your game.";
    form.append(row, note);

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const f = new FormData(form);
      this.editCrop(node.name, {
        name: String(f.get("name")).trim(),
        seedPrice: Number(f.get("seedPrice")),
        growMinutes: Number(f.get("growMinutes")),
        level: Number(f.get("level")),
      });
    });
    reset.addEventListener("click", () => {
      const o = CROPS[node.cropId];
      if (o) this.editCrop(node.name, { name: o.name, seedPrice: o.seedPrice, growMinutes: o.growMinutes, level: o.level }, "Back to the original values.");
    });
    wrap.append(sum, form);
    return wrap;
  }

  /** Applies an edit with CropBST.update(name, changes) and refreshes the A-Z Catalog and the search result.
   *  The BST is not rebuilt: update() changes the existing node in place, and only a new name makes it
   *  remove and reinsert that one node (its alphabetical position changes).
   *  Time: O(log n) average for the update (O(n) worst case) + O(n) to redraw the A-Z list. */
  editCrop(currentName, changes, okMessage = "Saved!") {
    const bad = (m) => { this.cropEditNote = m; this.cropEditOpen = true; this.searchCrop(); };
    const whole = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
    if (!changes.name) return bad("Please type a name.");
    if (!whole(changes.seedPrice, 1, 9999)) return bad("Seed price must be a whole number from 1 to 9999.");
    if (!whole(changes.growMinutes, 1, 999)) return bad("Growth time must be a whole number from 1 to 999.");
    if (!whole(changes.level, 1, 99)) return bad("Unlock level must be a whole number from 1 to 99.");

    const node = this.cropBst.update(currentName, changes);
    if (!node) return bad(`"${changes.name}" is already another crop's name.`);
    if (node.cropId) this.cropNames[node.cropId] = node.name;
    this.cropEditNote = okMessage;
    this.cropEditOpen = true;
    this.renderCropAz();                       // refresh the A-Z Catalog
    this.renderBstDiagram();                   // the BST diagram follows the edited tree
    this.el.cropSearch.value = node.name;      // refresh the search result (follows a rename)
    this.searchCrop();
  }

  // ---- Floating panels (upper left): Time, Controls, Actions, Gardener -------------
  /** Each top-bar button opens its panel; only one is open at a time. Same button, outside click or Esc closes it. */
  bindPanels() {
    this.panels = [
      ["btn-time", "panel-time"], ["btn-controls", "panel-controls"],
      ["btn-history", "panel-history"], ["btn-gardener", "panel-gardener"], ["btn-crops", "panel-crops"],
    ].map(([b, p]) => ({ btn: document.getElementById(b), panel: document.getElementById(p) }));

    this.panels.forEach(({ btn, panel }) => {
      btn.addEventListener("click", () => this.togglePanel(panel.id));
    });
    document.addEventListener("pointerdown", (e) => {
      const open = this.panels.find((p) => !p.panel.hidden);
      if (!open || open.panel.contains(e.target) || open.btn.contains(e.target)) return;
      this.closePanels();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.panels.some((p) => !p.panel.hidden)) this.closePanels({ refocus: true });
    });
  }

  togglePanel(id) {
    const wasOpen = this.panels.find((p) => p.panel.id === id && !p.panel.hidden);
    this.closePanels();
    if (wasOpen) return;
    this.hideGuardianPopover();
    const { btn, panel } = this.panels.find((p) => p.panel.id === id);
    panel.hidden = false;
    btn.setAttribute("aria-expanded", "true");
  }

  closePanels({ refocus = false } = {}) {
    this.panels.forEach(({ btn, panel }) => {
      if (panel.hidden) return;
      panel.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      if (refocus) btn.focus();
    });
  }

  // ---- Guardian popover -------------------------------------------------------
  toggleGuardianPopover() {
    if (this.el.popover.hidden) this.showGuardianPopover();
    else this.hideGuardianPopover();
  }

  /** Clicking the guardian: show who they are and the greeting for this place. Nothing else opens this. */
  showGuardianPopover() {
    const { popover, popoverName, popoverText, popoverPlace, castKeeper } = this.el;
    const place = this.game.place;
    const ch = PixelArt.getCharacter(place.keeper);
    popoverPlace.textContent = `📍 ${place.name}`;
    popoverName.textContent = `${ch.name} · ${place.role}`;
    popoverText.textContent = place.hello;
    popover.setAttribute("aria-label", `${ch.name}, ${place.role}`);
    popover.hidden = false;
    castKeeper.setAttribute("aria-expanded", "true");
    this.positionGuardianPopover();
  }

  hideGuardianPopover({ refocus = false } = {}) {
    if (this.el.popover.hidden) return;
    this.el.popover.hidden = true;
    this.el.castKeeper.setAttribute("aria-expanded", "false");
    if (refocus) this.el.castKeeper.focus();
  }

  /** Put the popover above the guardian, centred on them, kept inside the garden scene. */
  positionGuardianPopover() {
    const { popover, castKeeper, scene } = this.el;
    const s = scene.getBoundingClientRect();
    const k = castKeeper.getBoundingClientRect();
    const margin = 8, gap = 10;
    popover.style.maxWidth = `${Math.max(160, s.width - margin * 2)}px`;
    const pw = popover.offsetWidth, ph = popover.offsetHeight;
    const keeperCx = k.left - s.left + k.width / 2;

    let left = keeperCx - pw / 2;
    left = Math.min(Math.max(left, margin), Math.max(margin, s.width - pw - margin));
    let top = k.top - s.top - ph - gap;                         // above their head
    let below = false;
    if (top < margin) {                                         // no room above: go below, else clamp
      const lower = k.bottom - s.top + gap;
      if (lower + ph <= s.height - margin) { top = lower; below = true; }
      else top = margin;
    }
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
    popover.classList.toggle("below", below);
    const arrowX = Math.min(Math.max(keeperCx - left, 18), Math.max(18, pw - 18));
    popover.style.setProperty("--arrow-x", `${Math.round(arrowX)}px`);
  }

  // ---- Small animations -----------------------------------------------------
  popCell(row, col) {
    const { btn } = this.cells[GardenGrid.toFlat(row, col)];
    btn.classList.remove("pop");
    void btn.offsetWidth;
    btn.classList.add("pop");
    btn.addEventListener("animationend", () => btn.classList.remove("pop"), { once: true });
  }

  hopGardener() {
    const sprite = this.el.gardenerSprite;
    sprite.classList.remove("hop");
    void sprite.offsetWidth;
    sprite.classList.add("hop");
    sprite.addEventListener("animationend", () => sprite.classList.remove("hop"), { once: true });
  }

  pulse(el) {
    el.classList.remove("pulse");
    void el.offsetWidth;
    el.classList.add("pulse");
  }

  /** A little "+2 [carrot]" that floats up from an element and fades out. */
  floatAt(anchor, text, itemId) {
    if (!anchor || !anchor.isConnected) return;
    const r = anchor.getBoundingClientRect();
    const f = document.createElement("div");
    f.className = "float";
    f.style.left = `${r.left + r.width / 2}px`;
    f.style.top = `${r.top}px`;
    if (itemId) f.appendChild(makeIcon(itemId, "icon icon--float"));
    const t = document.createElement("span");
    t.textContent = text;
    f.appendChild(t);
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 1100);
  }

  // ---- Rendering ------------------------------------------------------------
  renderGardener() {
    const ch = PixelArt.getCharacter(this.gardenerId);
    this.el.gardenerSprite.src = ch.src;
    this.el.gardenerSprite.alt = ch.name;
    this.el.castGardenerName.textContent = ch.name;
    this.el.gardenerFace.replaceChildren(PixelArt.createFace(ch.id, "md"));
    this.el.gardenerName.textContent = ch.name;
    this.el.gardenerTitle.textContent = ch.title;
    if (this.mapMarker) this.placeMarker(this.game.location, false);
  }

  /** Fill a slot button: item icon, quantity badge and (for the hotbar) its key number. */
  fillSlot(btn, slot, keyLabel = "") {
    const kids = [];
    if (slot) {
      const item = ITEMS[slot.id];
      kids.push(makeIcon(slot.id));
      if (item.stack > 1) {
        const q = document.createElement("span");
        q.className = "qty";
        q.textContent = String(slot.qty);
        kids.push(q);
      }
      btn.title = item.stack > 1 ? `${item.name} x${slot.qty}` : item.name;
      btn.setAttribute("aria-label", btn.title);
    } else {
      btn.title = "Empty slot";
      btn.setAttribute("aria-label", "Empty slot");
    }
    if (keyLabel) {
      const k = document.createElement("span");
      k.className = "key";
      k.textContent = keyLabel;
      kids.push(k);
    }
    btn.replaceChildren(...kids);
  }

  renderHotbar() {
    const { slots } = this.game.inventory;
    this.hotbarButtons.forEach((btn, i) => {
      this.fillSlot(btn, slots[i], String(i + 1));
      btn.setAttribute("aria-pressed", String(i === this.game.selected));
    });
  }

  renderPack() {
    const inv = this.game.inventory;
    this.packButtons.forEach((btn, i) => {
      this.fillSlot(btn, inv.slots[i], i < HOTBAR_SLOTS ? String(i + 1) : "");
      btn.setAttribute("aria-pressed", String(i === this.packSelected));
    });
    this.el.packCount.textContent = `${inv.usedSlots()} / ${inv.size}`;
    this.renderHarvestInventory();

    // detail panel for the selected slot
    const d = this.el.packDetail;
    const slot = this.packSelected === null ? null : inv.slots[this.packSelected];
    if (!slot) {
      d.innerHTML = "<p class='pack-hint'>Click an item to see what it does. Click a second slot to swap them.<br>Slots 1-8 (gold) are your hotbar.</p>";
      return;
    }
    const item = ITEMS[slot.id];
    const lines = [`<b>${item.name}</b>${item.stack > 1 ? ` <span class="muted">x${slot.qty}</span>` : ""}`, `<span>${item.desc}</span>`];
    if (item.sell) lines.push(`<span class="muted">Market price: ${item.sell} coins each</span>`);
    const buttons = [];
    if (this.packSelected < HOTBAR_SLOTS) buttons.push(`<button class="btn" type="button" data-act="hold">Hold</button>`);
    if (item.food) buttons.push(`<button class="btn" type="button" data-act="eat">Eat (+${item.food})</button>`);
    if (item.type !== "tool") {
      if (slot.qty > 1) buttons.push(`<button class="btn" type="button" data-act="drop1">Drop 1</button>`);
      buttons.push(`<button class="btn" type="button" data-act="drop">Drop${slot.qty > 1 ? " all" : ""}</button>`);
    }
    d.innerHTML = `<div class="pack-item"></div><div class="pack-text">${lines.join("<br>")}<div class="pack-actions">${buttons.join("")}</div></div>`;
    d.querySelector(".pack-item").appendChild(makeIcon(slot.id, "icon icon--big"));
  }

  /**
   * "Harvest Inventory" inside the backpack: harvested crops merged into one row each,
   * sorted with our Insertion Sort. It only READS the backpack (see section 5b), so the
   * real slots, hotbar and selection are never touched. renderPack() calls this, and
   * renderPack() already runs whenever the open backpack changes, so the view stays current.
   */
  renderHarvestInventory() {
    const el = this.el, { key, direction } = this.harvestSort;
    const rows = sortedHarvestRows(this.game.inventory, key, direction);

    el.harvestSummary.textContent = `Harvest Inventory (${rows.length} ${rows.length === 1 ? "crop" : "crops"})`;
    el.harvestKey.value = key;
    el.harvestDir.textContent = direction === "asc" ? "↑ Ascending" : "↓ Descending";
    el.harvestDir.setAttribute("aria-label", `Direction: ${direction === "asc" ? "ascending" : "descending"}. Click to switch.`);
    el.harvestEmpty.hidden = rows.length > 0;
    el.harvestTable.hidden = rows.length === 0;

    const cell = (text, cls) => {
      const td = document.createElement("td");
      td.textContent = text;
      if (cls) td.className = cls;
      return td;
    };
    el.harvestBody.replaceChildren(...rows.map((r) => {
      const tr = document.createElement("tr");
      tr.append(cell(r.name, "harvest-name"), cell(String(r.quantity), "num"), cell(String(r.unitValue), "num"),
                cell(String(r.totalValue), "num"), cell(`${r.growMinutes} min`, "num"));
      return tr;
    }));
  }

  renderShop() {
    const g = this.game;
    const { shopList, shopTabs, shopFoot, shopCoins } = this.el;
    shopCoins.textContent = String(g.player.coins);
    shopTabs.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tab === this.shopTab)));
    shopList.replaceChildren();
    shopFoot.replaceChildren();

    const row = (icon, title, sub, buttons) => {
      const li = document.createElement("li");
      li.appendChild(makeIcon(icon));
      const text = document.createElement("div");
      text.className = "shop-text";
      const b = document.createElement("b");
      b.textContent = title;
      const s = document.createElement("small");
      s.textContent = sub;
      text.append(b, s);
      li.appendChild(text);
      buttons.forEach((x) => li.appendChild(x));
      shopList.appendChild(li);
    };
    const button = (label, attrs, disabled = false) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn--sm";
      b.textContent = label;
      b.disabled = disabled;
      Object.entries(attrs).forEach(([k, v]) => b.setAttribute(k, v));
      return b;
    };

    if (this.shopTab === "buy") {
      g.shopStock().forEach((s) => {
        const crop = CROPS[s.crop];
        if (s.locked) {
          row(s.id, `${crop.name} Seed`, `Unlocks at level ${s.level}`, [button(`Lv ${s.level}`, {}, true)]);
        } else {
          const afford = (n) => g.player.coins >= s.price * n;
          row(s.id, `${crop.name} Seed`, `${s.price} coins · ripe ${crop.growMinutes} min after watering · sells ${crop.sellPrice}`, [
            button(`Buy ${s.price}`, { "data-buy": s.id, "data-qty": "1" }, !afford(1)),
            button(`x5`, { "data-buy": s.id, "data-qty": "5", title: `Buy 5 for ${s.price * 5} coins` }, !afford(5)),
          ]);
        }
      });
    } else {
      let any = false;
      g.inventory.slots.forEach((s, i) => {
        if (!s || !ITEMS[s.id].sell) return;
        any = true;
        const item = ITEMS[s.id];
        row(s.id, `${item.name} x${s.qty}`, `${item.sell} coins each`, [
          button("Sell 1", { "data-sell": String(i), "data-qty": "1" }),
          button(`All ${item.sell * s.qty}`, { "data-sell": String(i), "data-qty": "all" }),
        ]);
      });
      if (!any) {
        const li = document.createElement("li");
        li.className = "shop-empty";
        li.textContent = "Nothing to sell yet. Harvest some crops first!";
        shopList.appendChild(li);
      }
      const total = g.inventory.slots.reduce((sum, s) => sum + (s && ITEMS[s.id].type === "crop" ? s.qty * ITEMS[s.id].sell : 0), 0);
      const all = button(`Sell all crops (${total})`, { "data-sellall": "1" }, total === 0);
      shopFoot.appendChild(all);
    }
  }

  /**
   * The tile's tooltip / screen-reader label. The countdown is only included while the tile is hovered
   * or focused (`live`), e.g. "Daisy - Growing - 1m 42s left · [0,2] flat #2".
   * Nothing is drawn on the tile itself.
   */
  setCellLabel(btn, row, col, i, plot, now = this.game.clock(), live = btn.matches(":hover") || document.activeElement === btn) {
    const grid = this.game.grid;
    // Hash lookup: is this tile in the plant index? (null = empty soil.) Current stage, thirst and time left are then read from the grid.
    const plant = grid.inspectCell(row, col, plot, now);
    const stage = plant ? plant.stage : STAGE.EMPTY;
    const crop = plant ? plant.cropId : null;
    let title;
    if (!crop) {
      title = `Empty soil`;
    } else {
      title = `${CROPS[crop].name} - ${STAGE_NAMES[stage]}`;
      if (stage === STAGE.MATURE) title += " - ready to harvest";
      else if (plant.thirsty) title += live ? ` - thirsty (ripe ${CROPS[crop].growMinutes} min after watering)` : " - thirsty";
      else if (live) title += ` - ${formatDuration(plant.remainingMs)} left`;
    }
    title += ` · [${row},${col}] flat #${i}`;
    if (btn.title !== title) {
      btn.title = title;
      btn.setAttribute("aria-label", title);
      if (live) this.el.cellInfo.textContent = title;      // keep the info line under the garden live
    }
  }

  /** "Hash Index Details" (inside the Today's Actions panel): read-only numbers about the plant index. Only drawn while open. */
  renderHashDetails() {
    if (!this.el.hashDetails.open) return;
    const st = this.game.grid.indexStats();
    this.el.hashSize.textContent = String(st.size);
    this.el.hashBuckets.textContent = String(st.capacity);
    this.el.hashLoad.textContent = st.loadFactor.toFixed(2);
    this.el.hashCollisions.textContent = String(st.collisionBuckets);
  }

  /** Tile under the mouse or keyboard focus (the only one whose countdown is shown). */
  activeCell() {
    const btn = this.el.grid.querySelector(".cell:hover") || (document.activeElement && document.activeElement.closest && document.activeElement.closest(".cell"));
    return btn || null;
  }

  // ---- Real-time growth timer -------------------------------------------------
  /** Runs every second: ripen plants by the clock, redraw if a stage changed, else refresh the hovered tile's countdown. */
  tickGrowth() {
    const res = this.game.refreshGrowth();
    if (res.changed) {
      this.game.save();
      this.render();
      if (this.el.mapDialog.open && !this.traveling) this.renderMapNodes();
      return;
    }
    const plot = this.game.place.plot;
    const btn = plot && this.activeCell();
    if (!btn) return;
    const row = Number(btn.dataset.row), col = Number(btn.dataset.col);
    this.setCellLabel(btn, row, col, GardenGrid.toFlat(row, col), plot, this.game.clock(), true);
  }

  renderCellInfo() {
    const held = this.game.heldItem;
    const base = this.game.atGarden ? "Hover a tile to see its flat index." : "Browse the market, or open the map to travel.";
    this.el.cellInfo.textContent = `${base}  In hand: ${held ? held.name : "nothing"}.`;
  }

  render() {
    const g = this.game;
    const { time, player, grid } = g;
    const place = g.place;
    const plot = place.plot;

    // HUD
    const ePct = Math.round((player.energy / player.maxEnergy) * 100);
    this.el.energyBar.style.width = `${ePct}%`;
    this.el.energyBar.parentElement.classList.toggle("low", ePct <= 25);
    this.el.energyText.textContent = `${player.energy}/${player.maxEnergy}`;
    this.el.coins.textContent = String(player.coins);
    this.el.level.textContent = `Lv ${player.level}`;
    const maxed = player.level >= MAX_LEVEL;
    this.el.xpBar.style.width = `${maxed ? 100 : Math.round((player.xp / player.xpNeeded) * 100)}%`;
    this.el.xpText.textContent = maxed ? "MAX" : `${player.xp}/${player.xpNeeded} XP`;

    // Time + season mascot
    this.el.day.textContent = String(time.dayCounter);
    this.el.season.textContent = `${SEASON_ICONS[time.season]} ${time.season} (${time.daysIntoSeason}/${DAYS_PER_SEASON})`;
    this.el.phase.textContent = `${PHASE_ICONS[time.phase]} ${time.phase}`;
    this.el.chipTime.textContent = String(time.dayCounter);                        // small day-number badge
    this.el.chipTimeIcon.textContent = `${SEASON_ICONS[time.season]}${PHASE_ICONS[time.phase]}`;
    const timeLabel = `Time & Season: Day ${time.dayCounter}, ${time.season}, ${time.phase}`;
    this.el.chipTime.parentElement.title = timeLabel;
    this.el.chipTime.parentElement.setAttribute("aria-label", timeLabel);
    document.body.dataset.season = time.season;
    document.body.dataset.phase = time.phase;
    if (this.renderedSeason !== time.season) {
      const mascot = PixelArt.getCharacter(SEASON_MASCOTS[time.season]);
      this.el.seasonFace.replaceChildren(PixelArt.createFace(mascot.id, "sm"));
      this.el.seasonMascot.textContent = `${mascot.name} · ${mascot.title}`;
      this.renderedSeason = time.season;
    }

    // Where we are
    this.el.placeName.textContent = place.name;
    if (plot) {
      const st = grid.stats(plot);
      this.el.placeInfo.textContent = `${st.planted} planted · ${st.ready} ripe · ${st.thirsty} thirsty`;
    } else {
      this.el.placeInfo.textContent = "Buy seeds, sell crops";
    }
    this.el.bed.dataset.mode = g.atMarket ? "market" : "garden";
    this.el.legend.hidden = !g.atGarden;

    if (this.renderedPlace !== place.id) {
      this.hideGuardianPopover();
      const keeper = PixelArt.getCharacter(place.keeper);
      const sprite = this.el.keeperSprite;
      sprite.src = keeper.src;
      sprite.alt = keeper.name;
      this.el.castKeeperName.textContent = `${keeper.name} · ${place.role}`;
      if (this.renderedPlace !== null) {
        sprite.classList.remove("swap");
        void sprite.offsetWidth;
        sprite.classList.add("swap");
      }
      this.renderedPlace = place.id;
    }
    this.el.scene.dataset.plot = plot || "Market";

    // Garden cells (only meaningful in a garden; the market covers them)
    if (plot) {
      this.cells.forEach(({ btn, canvas }, i) => {
        const [row, col] = GardenGrid.fromFlat(i);
        const stage = grid.getStage(row, col, plot);
        const crop = grid.getPlantId(row, col, plot);
        const thirsty = grid.isThirsty(row, col, plot);
        PixelArt.drawCell(canvas, plot, stage, crop, thirsty);
        this.setCellLabel(btn, row, col, i, plot);
      });
      const example = Object.keys(CROPS).find((id) => CROPS[id].plot === plot);
      this.legendCanvases.forEach(({ canvas, stage }) => PixelArt.drawCell(canvas, plot, stage, stage ? example : null));
      PixelArt.drawItem(this.legendThirsty, "drop");
    }

    this.renderHotbar();
    this.renderCellInfo();
    if (g.atMarket) this.renderShop();
    if (this.el.packDialog.open) this.renderPack();
    this.drawScene();

    // History (today's actions, newest first)
    this.el.history.replaceChildren();
    const recent = g.stack.recent(8);
    if (!recent.length) {
      const li = document.createElement("li");
      li.textContent = "Nothing yet today.";
      this.el.history.appendChild(li);
    } else {
      recent.forEach((action, i) => {
        const li = document.createElement("li");
        if (i === 0) li.className = "latest";
        li.textContent = action.description;
        this.el.history.appendChild(li);
      });
    }
    this.el.historyCount.textContent = String(g.stack.size());
    this.el.chipHistory.textContent = String(g.stack.size());
    this.el.btnUndo.disabled = g.stack.isEmpty();
    if (this.el.hashDetails.open) this.renderHashDetails();
    if (this.cropTab === "rank") this.renderRankings();   // keep an open Rankings tab current after harvest, undo, new season, load

    // Back button: only usable when the Back history has a place in it
    const prev = g.travelHistory.peekBack();
    const backText = prev && LOCATIONS[prev] ? `Back to ${LOCATIONS[prev].name}` : "Back (no previous place yet)";
    this.el.btnBack.disabled = g.travelHistory.size() === 0;
    this.el.btnBack.title = `⬅ ${backText}`;
    this.el.btnBack.setAttribute("aria-label", `Back: ${backText}`);
  }
}


/* =============================================================================
  10. START-UP
============================================================================= */

function init() {
  const game = new GardenGame();
  const loaded = game.load();
  const ui = new GardenUI(game);
  window.garden = { game, ui }; // handy for poking around in the browser console
  if (loaded) {
    ui.toast("Welcome back! Check on your plants.");
  } else {
    ui.toast("Welcome to your garden! Click the guardian to say hello.");
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", init);
}

// Lets the logic be tested in Node (ignored in the browser)
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    GardenGrid, TreeNode, CropTree, BSTNode, CropBST, Deque, CircularDoublyLinkedList, TimeSystem, ActionStack, Inventory, Player, PlantHashTable, SeasonHarvestTracker,
    RANK_METRICS, mergeSortRankRows, rankSeasonCrops, HARVEST_SORT_KEYS, buildHarvestRows, compareHarvestRows, insertionSortHarvest, sortedHarvestRows, WorldGraph, GardenGame,
    SEASONS, DAYS_PER_SEASON, STAGE, GRID_SIZE, PLOT_NAMES, MAX_TRAVEL_HISTORY, CROPS, ITEMS, LOCATIONS, ROADS, HOTBAR_SLOTS, BACKPACK_SLOTS, seedIdOf,
  };
}
