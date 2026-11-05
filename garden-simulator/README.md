# 🌸 Pixel Garden Simulator

A cozy, kawaii pixel-style garden simulator (inspired by Pixels.xyz) with harvesting, an inventory, a market and a world map. It is also a data-structures project: see "DSA assignment guide" below for where each topic lives in the code.

## Files

| File | What it does |
|------|--------------|
| `garden-simulator.html` | The page: gardener card, time card, tools, plot tabs, the garden, dialogue box, history |
| `pixel-theme.css` | Pastel gingham page, the garden scene, wooden raised beds, characters, weather |
| `pixel-art.js` | Plant sprites, the character roster, and `drawGarden()` which paints the whole garden |
| `script.js` | All game logic and data structures (grid, linked list, stack, trees, graph, hash table, sorts, harvest tracker) and the UI that ties it together |
| `assets/characters/*.png` | The 17 chibi characters (128x128, transparent background) |
| `garden_cli.py` | The core logic (grid, linked list, action stack) as a terminal game (separate from the browser game; none of the later DSA features are in it) |
| `tests/` | Project-owned tests and optional browser checks (see "Running the tests") |

Keep the `assets` folder next to `garden-simulator.html`, or the characters won't load.

| [DSA-FEATURES.md](./DSA-FEATURES.md) | for the complete list of game features, their data structures and algorithms, and how each one is used in the Garden Simulator.

## How to run

**Browser version:** open `garden-simulator.html` (double-click it, or use the *Live Server* extension in VS Code).

**Console version:**

```bash
python garden_cli.py
```

## The garden

The three plots are raised wooden beds standing in a fenced garden, not floating panels:

- A picket fence with a gate, rolling hills, clouds and a sun along the back; fences down both sides.
- A stone path leads from the gate to the bed and out the front, past a pond and bushes.
- A signpost beside the bed shows which plot you're in.
- **Flowers**: a pink painted bed, a bench, a bird bath and flower patches.
- **Root Crops**: a dark timber bed, a scarecrow, hay bales, a wheelbarrow of carrots and rocks.
- **Vegetables/Fruits**: a honey timber bed, crates, berry bushes, cabbages, pumpkins, and a fruit tree.
- The garden changes with the **season** (blossom, green summer, autumn leaves, snow) and goes dark at **night** with a moon, stars, fireflies and a lit shed window.
- Falling petals, leaves and snow, butterflies by day and fireflies at night drift over it (switched off if your system prefers reduced motion).

Your gardener and the current plot's keeper stand on the lawn either side of the path.

## Screen layout

The page scrolls normally and the garden (or Market Square) keeps its natural size. The hotbar is fixed at the bottom centre of the screen so it is always reachable.

- **Upper left:** small buttons for Time & Season (always shows the day), Controls (Sleep, Day/Night, Undo, New game, growth-stage legend), Today's Actions and Gardener. Each opens a small floating panel; click the button again, click outside, or press `Esc` to close it. Only one is open at a time.
- **Upper right:** coins, energy, level/XP, and the Map and Backpack buttons.
- **The sign on the entrance fence** shows where you are and how many plants are planted, ripe and thirsty.

## How to play

1. Pick an item on the **hotbar** (keys `1`-`8`): seeds plant, the **watering can** waters, the **shears** harvest.
2. Click a tile. Planting, watering and harvesting each cost **1 energy**.
3. New seeds are *thirsty* and don't grow until you water them. After watering, a plant grows in **real time** (even if you close the page): Seed for the first 25%, then Growing, then ripe. A tile's tooltip shows the time left, e.g. "2m 14s left". **Sleep** (`N`) only refills energy and starts a new day.
4. Ripe crops go into your **backpack** (24 slots, first 8 = hotbar). Open it with `B`; click an item, then another slot to move it. Eat food crops to refill energy.
5. Open the **Map** (`M`) and click a place to walk there (shortest road found with BFS). Each garden has its own plot and keeper.
6. At **Market Square**, sell crops for coins and buy new seeds. Harvesting gives farming XP; levels unlock better seeds.

| Action | Key |
|--------|-----|
| Hotbar slot | `1`-`8` |
| Map / Backpack | `M` / `B` |
| Sleep (next day) | `N` |
| Day ↔ Night | `T` |
| Undo (today's actions) | `U` |

Your game autosaves in the browser. **New game** wipes it.

## Crops

| Garden | Crops (unlock level) |
|--------|----------------------|
| Flower Meadow | Daisy (1), Tulip (2), Sunflower (3), Rose (5) |
| Root Field | Carrot (1), Radish (2), Potato (3), Beet (4) |
| Orchard Garden | Tomato (1), Cabbage (2), Strawberry (3), Eggplant (4) |

Growth time comes from the crop's unlock level: `growMinutes = 3 + (level - 1) * 2` (level 1 = 3 min, 2 = 5, 3 = 7, 4 = 9, 5 = 11). Edit the `CROPS` table at the top of `script.js` to change levels, prices, yields and XP.

## The characters

- **Your gardener**: Pinky.
- **Plot keepers**: Daisy (Flowers), Moss (Root Crops), Fraise (Vegetables/Fruits).
- **Season spirits**: Lian (Spring), Lemon (Summer), Cocoa (Autumn), Mochi (Winter).

To change who plays which role, edit `PLOT_KEEPERS`, `SEASON_MASCOTS` and `DEFAULT_GARDENER` (your gardener) near the top of `script.js`. To rename a character or add a new one, edit the roster in `pixel-art.js` and drop a matching `<id>.png` into `assets/characters/`.

## Data structures

1. **2D arrays**: `GardenGrid` holds three 10x10 plots (stage, crop, thirsty, wateredAt, readyAt).
2. **Circular doubly linked list**: `TimeSystem` cycles Day/Night and the four seasons.
3. **Stack (LIFO)**: `ActionStack` keeps today's actions; each entry stores a snapshot so `pop()` = Undo.
4. **Array of slots**: `Inventory` is the backpack (stacking, swap, hotbar = first 8).
5. **Graph + BFS**: `WorldGraph` links the 4 places by roads; `shortestPath()` gives the travel route.
6. **Hash table (separate chaining)**: `PlantHashTable` is the plant index inside `GardenGrid` (see "Plant index" below).
7. **Insertion Sort**: the backpack's "Harvest Inventory" view sorts a copied list of harvested crops (see "Harvest Inventory" below).
8. **Season harvest tracker** (data only): `SeasonHarvestTracker` records what you harvest in each season occurrence (see "Seasonal harvest tracking" below).
9. **Merge Sort**: the Crop Guide's "Rankings" tab ranks the crops of one chosen season with a hand-written stable Merge Sort (see "Season rankings" below).

## HUD layout

The top buttons are small square icon buttons in one horizontal row on each side: Time & Season, Controls, Actions and Gardener on the left; coins, energy, level/XP, Map and Backpack on the right. Each has a title and aria-label. On very narrow screens the rows wrap and center.

## Crop Guide

The 🌱 button in the upper-left menu opens the Crop Guide. "By Garden" lists the crops using `CropTree.preorder`, "A-Z Catalog" lists them with `CropBST.inorder()`, and the search box uses `CropBST.search(name)` to show a crop's details or "Crop not found". It only reads crop data and never changes the game.

The "By Garden" tab also shows a summary under each garden (crop count, total seed price, total XP). `CropTree.summarize()` calculates it with postorder DFS: the crops are visited first, then each garden adds up its crops, and the root adds up the gardens.

The Crop Guide has a third tab, "Level View". `CropTree.levels()` uses `bfs()` to group the tree by level: Level 0 is the root, Level 1 the three gardens, Level 2 the 12 crops.

**Edit Crop** (inside the Crop Guide): after you search for or click a crop, open "✏️ Edit Crop" to change its name, seed price, growth time and unlock level. It calls `CropBST.update(name, changes)`, which changes the existing node in place. Only a new name removes and reinserts that one node. The A-Z Catalog and the search result refresh afterwards. These edits only change the guide's catalog copy for the current session: planting, market prices, saves and growth are not affected. "Reset" puts a crop back to its original values.

**Tree View** (Crop Guide, fourth tab; a fifth tab, **Rankings**, is described under "Season rankings"): draws the CropTree and the CropBST as diagrams (a box per node, lines to children). Four buttons run a traversal and light up each visited node 500 ms apart while the visiting order builds in a list under the diagram. Preorder, postorder and BFS use `CropTree`; inorder uses `CropBST.inorder()`. The BST diagram is redrawn after an Edit Crop save.

## Back button (Deque)

The ⬅ button next to the Map button goes back to the previous place. Each time you travel, the place you left is added to the back of a `Deque` (at most 5; a sixth entry drops the oldest from the front). Back takes the newest place with `removeBack()` and travels there with the normal travel system (BFS). It is disabled when the history is empty. The history is not saved, so the save format is unchanged.


## Plant index (hash table)

`GardenGrid` keeps a `PlantHashTable` (`grid.plantIndex`) listing the occupied tiles as small `{cropId, plot, row, col}` records. The 2D arrays remain the real garden: stage, thirst and timestamps are never copied into the index. The grid arrays can already be read directly by `[row][col]`, so the index is an extra lookup structure for practising hashing, not a speed-up claim.

- **Keys** are text like `"Flowers|3|7"` hashed with djb2. The table starts with 16 buckets, each a linked chain, so keys that collide share a chain. Before a new key would push the load factor (entries / buckets) above 0.75, the bucket count doubles and every entry is re-filed (rehash). It never shrinks by itself; `clear()` goes back to 16 buckets.
- **Kept in step** by `plantSeed` (adds), `clearCell` (removes; harvest uses it) and `loadJSON` (rebuilds from the arrays once, which covers loading a save and Undo). The index is never saved, so existing saves still work. "New game" reloads the page, so the index starts empty.
- **Used in the game**: hovering or focusing a tile asks the index for the plant (`GardenGrid.inspectCell`), then reads stage, thirst and time left from the arrays to build the same tile titles as before.
- **See it**: open the Today's Actions panel (upper-left menu) and expand "Hash Index Details": entries, buckets, load factor and buckets holding 2+ entries. It is read-only.
- **Limitation**: plots and coordinates are checked against `PLOT_NAMES` and `GRID_SIZE`, so the index follows those if they change, but a future plot name must not contain the `|` character.

## Harvest Inventory (Insertion Sort, display only)

Open the Backpack (B) and expand **Harvest Inventory**. It lists harvested crops only (no seeds or tools), with one row per crop: name, total quantity, unit sell value, total stack value (quantity x unit value) and growth duration. If a crop sits in two stacks, they are added together into one row.

Pick what to sort by (unit sell value, total stack value, quantity, name, growth duration) and flip Ascending/Descending. Names are compared ignoring upper/lower case. Rows that are equal for the chosen key stay in the order the crop first appears when scanning the backpack from slot 1, in both directions.

- The sort is a hand-written Insertion Sort (`insertionSortHarvest` in `script.js`, section 5b). It does not use `sort()` or `toSorted()`.
- It sorts a **copy** (`buildHarvestRows` makes new row objects). Your real backpack order, hotbar, selected slot, quantities and capacity are never changed, and nothing about the view is saved.
- The view is rebuilt from the backpack each time the open backpack changes.
- Complexity (S = backpack slots, n = distinct crops): merging the stacks is O(S) time and O(n) space for the copied list. Insertion Sort is O(n) best case and O(n^2) average/worst case, counting each comparison as O(1), with O(1) extra space for the sort itself. Comparing names costs O(L) per comparison (L = name length), counted separately from the number of comparisons.

## Seasonal harvest tracking (data only)

The game quietly records harvests per season. The tracker has no screen of its own: the Rankings tab (below) is what reads it.

- **What is recorded** (per crop, per season): the quantity you actually received from successful harvests, the harvest value (quantity x the base sell price **at the moment of harvest**, stored as a plain number so later price changes never rewrite it), and the order in which each crop was first harvested that season. Failed or repeated harvests, planting, watering, eating, dropping, selling and travelling record nothing.
- **Season IDs:** every individual season gets a serial number: 0 = "Spring — Cycle 1", 1 = "Summer — Cycle 1", 2 = "Autumn — Cycle 1", 3 = "Winter — Cycle 1", 4 = "Spring — Cycle 2", and so on. The ID is `season-<serial + 1>` (e.g. `season-5`). It matches the calendar: serial = floor((day - 1) / 7).
- **Archive:** when a new day starts a new season, the finished season is archived exactly once (empty seasons too) and a fresh one begins. Loading a save or pressing Undo never archives or awards anything. Undo restores the harvest record along with everything else; day changes still clear the Undo history, so Undo never crosses a season boundary.
- **Old saves:** a version-2 save without the new optional `harvests` field loads normally. Tracking starts at that moment and the current season is marked **partial** (no history is invented). A damaged `harvests` field is ignored the same way.
- **Limits:** the archive grows by one small record per season and is included in every save and Undo snapshot, so very long games make those slightly larger. `rewindSeason()` (an old method on `TimeSystem`) is untouched and nothing calls it, so it cannot disturb tracking.

## Season rankings (Merge Sort)

Open the Crop Guide (🌱 button) and pick the **Rankings** tab (the other four tabs are unchanged).

- **Choose a season** from the list: the current season first, then completed seasons, newest first, each labelled like "Spring — Cycle 1 (completed)". Seasons are never ranked against each other; each list ranks only the crops harvested in that one season.
- **Rank by** harvest value (the default) or quantity harvested, highest first. The table shows rank, crop, quantity and value.
- **Ties** go to the crop you harvested first in that season (see "The two tie rules" below).
- **Honest labels:** the season is marked *Current season (still in progress)* or *Completed season*. A season whose tracking began part-way through (an old save) says **Partial tracking**. Empty seasons say so; nothing is invented.
- **Values are historical.** They are the numbers stored when each harvest happened, not recalculated from today's prices.
- The open tab updates by itself after a harvest, Undo, a new season or loading a save. The season and "rank by" choices are view settings and are not saved.

How it works (`mergeSortRankRows` in `script.js`, section 6e): the tracker's crop entries are **copied** into display rows; the copy is split in half again and again until each piece has at most one row, then neighbouring pieces are merged back together by moving an index along each (no `shift()`), taking the left row unless the right one is strictly better. That makes the sort stable. It does not use `sort()` or `toSorted()`, and it never changes the tracker data. Time is O(n log n) for n crops in the season; extra space is O(n) for the helper array (plus O(log n) for the recursive calls). Copying the rows is O(n) time and space, finding a season is O(A) for A archived seasons, and drawing the table is O(n), all counted separately from the sort.

### The two tie rules

These are two separate statements, and the tests check them separately (`tests/audit_ties_and_balance.test.js`):

1. **Merge Sort (the algorithm):** rows that its comparator calls equal stay in their **input order**. It only moves a row from the right half ahead of one from the left half when it is strictly better. If rows carry no `firstOrder`, or carry the same `firstOrder`, input order decides.
2. **Seasonal rankings (the feature):** the comparator also treats a smaller `firstOrder` (the position in which a crop was first harvested that season) as "better" when the metric is equal. So first-harvest order is the tie-breaker even if rows were handed over in a different order.

In the game the two agree, because the tracker stores a season's crops in first-harvest order and passes them to the sort in that order.

## DSA assignment guide

| Topic | Where it is used in the game | Main code (`script.js`) | Tests |
|-------|------------------------------|--------------------------|-------|
| Insertion Sort | Backpack > Harvest Inventory: harvested crops, five sort keys, ascending/descending | Section 5b: `buildHarvestRows`, `compareHarvestRows`, `insertionSortHarvest`, `sortedHarvestRows`; UI `GardenUI.renderHarvestInventory` | `inventory_sort.test.js`, `browser_check_harvest.py` |
| Merge Sort | Crop Guide > Rankings: crops of one season by value or quantity | Section 6e: `mergeSortRankRows`, `mergeSortRange`, `rankRowBeats`, `rankSeasonCrops`; UI `GardenUI.renderRankings` | `season_rankings.test.js`, `audit_ties_and_balance.test.js`, `browser_check_rankings.py` |
| Hash table (separate chaining, rehashing) | Index of occupied garden tiles, used when a tile's title is built | Section 6c: `PlantHashTable`; in `GardenGrid`: `plantSeed`, `clearCell`, `inspectCell`, `rebuildIndex`, `indexMatchesGrid`; UI `GardenUI.setCellLabel`, `renderHashDetails` | `plant_hash_table.test.js`, `plant_index.test.js`, `browser_check.py` |
| Season harvest data (feeds the rankings) | Records harvests per season occurrence | Section 6d: `SeasonHarvestTracker`; `TimeSystem.onSeasonChange`; `GardenGame.harvestTile`, `snapshot`, `restore`, `toJSON`, `loadJSON` | `season_tracking.test.js`, `browser_check.py` |
| Earlier topics (unchanged) | 2D arrays (`GardenGrid`), circular doubly linked list (`TimeSystem`), stack (`ActionStack`), tree and BST (`CropTree`, `CropBST`), deque (`Deque`), graph + BFS (`WorldGraph`) | see "Data structures" above | `game_logic.test.js` (graph/BFS, stack/undo, inventory, time, saves) and `browser_check.py`. The trees, BST, deque and Crop Guide screens were checked with development-time browser scripts that are not included in this folder |

### Why these two sorts

The data is tiny (at most 24 backpack slots, 12 crops), so either sort is instant here; the choice is about what each one teaches and what each suits.

- **Insertion Sort** for the Harvest Inventory: the list is short, it is simple to read, it is stable and in place, and it is O(n) when the list is already in order. It sorts a small copied list (rebuilt from the backpack each time), which is where its O(n^2) worst case does not matter.
- **Merge Sort** for the season rankings: it is stable by design (needed for the first-harvest tie rule), its O(n log n) time does not depend on the input order, and it shows divide-and-conquer with a clear split step and merge step. It would also stay fine if more crops were added later.

### Inventory-object sorting example

This was run against the real code. The backpack holds these slots (a real inventory is an array of `{id, qty}` or `null`):

```js
inv.slots = [{id:"rose",qty:3}, {id:"carrot",qty:10}, {id:"daisy",qty:4}, {id:"carrot",qty:5}, null, ...];

const rows = buildHarvestRows(inv);
// [ {cropId:"rose",   name:"Rose",   quantity:3,  unitValue:70, totalValue:210, growMinutes:11},
//   {cropId:"carrot", name:"Carrot", quantity:15, unitValue:5,  totalValue:75,  growMinutes:3},    // two stacks merged
//   {cropId:"daisy",  name:"Daisy",  quantity:4,  unitValue:12, totalValue:48,  growMinutes:3} ]

insertionSortHarvest(rows, "total", "desc");   // a new array: Rose 210, Carrot 75, Daisy 48
// inv.slots is exactly as it was: carrot still appears in slots 1 and 3, and nothing moved on the hotbar.
```

### Hash table details

- **Keys and values:** the key is the text `"plot|row|col"` (for example `"Flowers|3|7"`); the stored value is `{cropId, plot, row, col}`. Only occupied tiles are indexed. Growth, thirst and timestamps stay in the `GardenGrid` arrays, which remain the source of truth.
- **Hash function:** djb2 (`h = h * 33 + character code`, kept as an unsigned 32-bit number), then `% bucket count`.
- **Separate chaining:** each bucket is `null` or the head of a singly linked chain of `{key, record, next}`. Colliding keys share a chain; new entries go at the head. Looking a key up walks one chain.
- **Load factor and doubling policy:** load factor = entries / buckets. It starts at 16 buckets. Before adding a NEW key that would push the load factor above 0.75, the table doubles its buckets (repeatedly, if ever needed) and re-files every entry. Updating an existing key never changes the size or resizes. It never shrinks; `clear()` returns to 16 buckets. Measured by filling all 300 tiles: 16 buckets hold 12 entries, then 32 (at 13), 64 (at 25), 128 (at 49), 256 (at 97), and 512 (at 193); at 300 entries the load factor is about 0.59, with 186 buckets used, 91 holding two or more entries, and a longest chain of 3.
- **Rehashing cost:** one rehash is O(n + m) time (visit every old bucket and entry once, recompute each hash) and O(m') space for the new bucket array. Because the size doubles, the insert cost averages out to O(1) amortized. `_relink` moves nodes in a plain loop: no recursion and no calls to `put`.
- **Lookup cost:** O(L + k), where L is the key length (a few characters) and k the chain length: O(1) on average while the load factor stays bounded, O(n) worst case if every key collided. The grid already reads any tile directly in O(1), so the index is not a speed claim.
- **Limitations:** a plot name must not contain `|`. The index is rebuilt from the grid rather than saved. The Hash Index Details panel is read-only and shows counts, not individual buckets.

### Complexity summary

| Operation | Time | Extra space |
|-----------|------|-------------|
| Aggregate backpack into harvest rows (S slots, n crops) | O(S) | O(n) (the copied list) |
| Insertion Sort of n rows | O(n) best, O(n^2) average/worst (comparisons counted as O(1)) | O(1) beyond the copy |
| Comparing two names (L = length) | O(L) | O(L) for the lowercase copies |
| Copy season record into display rows | O(n) | O(n) |
| Merge Sort of n rows | O(n log n) best, average and worst | O(n) helper array + O(log n) recursion |
| Find a season among A archived seasons | O(A) | O(1) |
| Record one harvest (k crops in the season) | O(k) | O(1) |
| Archive a finished season | O(A) (duplicate check) | O(1) |
| Save / load / Undo snapshot of tracking | O(A x k) | O(A x k) |
| Hash put / get / remove | O(1) average, O(n) worst | O(1) |
| Hash rehash | O(n + m) | O(m') |
| Hash `stats()` (Hash Index Details) | O(m + n) | O(1) |
| `rebuildIndex()` after load/Undo | O(T) for T = 300 tiles (plus the puts) | O(n) |

### Save compatibility and Undo

- **Save format** is still version 2 (`v: 2`). The only addition is the optional `harvests` field (current season and archive). A version-2 save without it loads normally, and tracking starts at that moment with the season marked **partial**. A damaged `harvests` field is ignored the same way. Hash buckets, sort choices and ranking choices are never saved; the hash index is rebuilt from the grid on every load.
- **Undo** snapshots (`ActionStack`) include the grid, inventory, player, time and the tracking data, so undoing a harvest removes its record, including a crop's first-harvest position. Restoring a snapshot replaces data only: it records nothing and archives nothing. A new day still clears the Undo history, so Undo can never cross a season boundary.
- **Sorting views** read the inventory and tracker but never write to them.

### Known limitations

- Tested in Chromium only (desktop, and 390 px and 320 px emulated phone widths). Not tried in Firefox or Safari, and not on a real phone.
- Fonts come from Google Fonts. In the test sandbox that request is blocked, so fonts fall back; this is an external network failure, not an application error.
- The Harvest Inventory uses the game's item names; the Rankings tab uses the Crop Guide's catalog names, which change if you rename a crop in Edit Crop (that rename does not affect gameplay).
- Rankings give tied crops different rank numbers (ordered by first harvest); there is no "tied" marker.
- The season archive is never trimmed and is copied into every save and Undo snapshot, so extremely long games would make those larger (not measured).
- An old save is always marked partial for its first season, even if loaded just after a season began, because earlier harvests that day were not recorded.
- Name sorting lowercases and compares plain characters, which suits the current English crop names but not accented names.
- `garden_cli.py` is the original terminal version and does not include the later features.

### Completed versus unverified

- **Verified by running** (see "Running the tests"): all Node test files, the three project browser checks (desktop 1280 px, 390 px and 320 px), and the development-time browser and visual-comparison scripts (not included in this folder). The default screens were compared pixel for pixel before and after the hash, inventory and ranking work and showed no difference outside the new panels.
- **Not verified:** other browsers, real devices, very long games, and behavior with the web fonts actually loaded.
- **Not in this project:** the written assignment text (reports, answers, diagrams) is separate work. No separate development journal file is kept in this folder.

## Running the tests

From the project folder (needs Node.js 16 or newer, no packages to install):

```
node tests/run_all.js
```

This runs every `tests/*.test.js` file, each in its own process, and exits with an error if any fails:

- `game_logic.test.js`: the original game-logic tests (growth, undo, saves, market, inventory, graph/BFS).
- `plant_hash_table.test.js`: the hash table by itself (collisions, updates, removal, rehash, clear).
- `plant_index.test.js`: the index inside the garden (planting, harvesting, Undo, saves, collisions at 300 tiles).
- `inventory_sort.test.js`: Harvest Inventory merging and Insertion Sort.
- `season_tracking.test.js`: harvest records, season IDs, archives, saves, old saves, Undo.
- `season_rankings.test.js`: Merge Sort and per-season rankings.
- `audit_ties_and_balance.test.js`: the two tie rules checked separately, and Merge Sort's balanced splitting.

You can also run one file, for example `node tests/plant_hash_table.test.js`.

Optional browser check (needs Python 3 and Playwright with Chromium: `pip install playwright` then `playwright install chromium`): `python3 tests/browser_check.py`. It opens the real page, plays a little, and checks the tile titles, the Hash Index Details numbers, Undo, reload and New game. `python3 tests/browser_check_harvest.py` does the same for the Harvest Inventory, and `python3 tests/browser_check_rankings.py` for the Rankings tab, at desktop and phone widths.