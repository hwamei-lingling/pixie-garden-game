# DSA Features of the Pixel Garden Simulator

This is the complete list of game features that use a data structure or algorithm, and how each one is used. All code is in `script.js` unless stated. Search for the labels `[Stack]`, `[Hash table]`, `[Insertion Sort]` and so on to find the code. More detail is in `README.md` ("DSA assignment guide", "Complexity summary").

| # | Data structure / algorithm | Game feature | Code |
|---|----------------------------|--------------|------|
| 1 | 2D arrays (matrices) | Garden tiles | `GardenGrid` (section 2) |
| 2 | General tree + traversals | Crop Guide: By Garden, Level, Tree View | `CropTree` (2b) |
| 3 | Binary search tree + inorder | Crop Guide: A-Z, Find, Edit Crop | `CropBST` (2c) |
| 4 | Circular doubly linked list | Day/night and seasons | `TimeSystem` (3) |
| 5 | Stack (LIFO) | Undo and today's actions | `ActionStack` (4) |
| 6 | Array of slots | Backpack and hotbar | `Inventory` (5) |
| 7 | Insertion Sort | Harvest Inventory | section 5b |
| 8 | Deque | Back button | `Deque` (6b) |
| 9 | Hash table (separate chaining, rehashing) | Plant lookup by tile | `PlantHashTable` (6c) |
| 10 | Season archive (array of records) | Harvests per season | `SeasonHarvestTracker` (6d) |
| 11 | Merge Sort + two tie rules | Seasonal Rankings | section 6e |
| 12 | Graph + BFS | World map travel | `WorldGraph` (7) |

## 1. 2D arrays: garden tiles
`GardenGrid` keeps five parallel 3 x 10 x 10 matrices (one 10 x 10 layer per plot): `stages`, `plantIds`, `thirsty`, `wateredAt` and `readyAt`. A tile is read directly by `[plot][row][col]`, so access is O(1). The grid is the source of truth for every plant. Plants grow by the clock: watering stores `wateredAt` and `readyAt` timestamps, and `refreshGrowth()` turns elapsed time into a stage.

## 2. General tree and traversals: Crop Guide
`CropTree` is a root, then the three garden plots, then the 12 crops. It has preorder, postorder and BFS (level-order) traversals, each O(n). The By Garden and Level views use it, and the Tree View tab runs each traversal as an animation, lighting up nodes in visiting order. DFS uses the call stack (O(h) extra space); BFS uses a queue (O(w) for the widest level).

## 3. Binary search tree: crop catalog
`CropBST` stores crops by name. `insert`, `search`, `update` and `remove` are O(log n) on average and O(n) in the worst case, because the tree is not self-balancing. An inorder traversal returns the names alphabetically in O(n), which is the A-Z tab. Edit Crop changes the catalog copy only, never the real game data; a rename removes and reinserts that node.

## 4. Circular doubly linked list: time
`TimeSystem` uses two circular lists: Day/Night and the four seasons. The last node links back to the first, so time repeats forever with no special wrap-around code. Moving to the next item is O(1). A new day can change the season, and only then is the finished season archived (see feature 10).

## 5. Stack: Undo
`ActionStack` is last in, first out. Before each successful action, the game snapshots its whole state (as JSON) and pushes it with a description. Undo pops the newest snapshot and restores it. `push` and `pop` are O(1); taking or restoring a snapshot costs time proportional to the size of the saved state. Starting a new day clears the stack, so Undo never crosses a season boundary. The History panel lists the newest actions from this stack.

## 6. Array of slots: backpack
`Inventory` is a fixed array of slots, each `{id, qty}` or `null`. Items of the same kind stack up to their limit. Clicking two slots swaps them, which is the only way the real slot order changes. The first 8 slots are the hotbar.

## 7. Insertion Sort: Harvest Inventory
- **Where:** Backpack > Harvest Inventory.
- **What it sorts:** `buildHarvestRows` merges harvested crops into one row each, so it works on a **copy** and the real backpack never changes. It is display-only.
- **Keys:** unit value, total value, quantity, name, growth time, ascending or descending.
- **How:** the sort is hand-written and stable. It slides a row left only past rows that are strictly out of order, so equal rows keep their earlier order. Descending flips the comparison; it does not reverse the list. Names are compared in lowercase.
- **Cost:** O(n) when the list is already in the wanted order, O(n^2) average and worst. Flipping the direction does not by itself give the best case. Aggregating the backpack is O(S) for S slots.
- **Why it fits:** the list is tiny (at most 24 slots), and the sort is simple and stable.

## 8. Deque: Back button
`Deque` is a double-ended queue holding the last 5 places visited. Travelling adds the new place at the back; Back takes the newest place from the back. When more than 5 are stored, the oldest is dropped from the front. Back-end operations are O(1). The deque is backed by a JavaScript array, so removing from the front shifts the items (O(n)), which is trivial with at most 5 places. It is used only for the Back button.

## 9. Hash table: plant lookup
- **Where:** `PlantHashTable` is the index inside `GardenGrid`; it finds a plant by tile location. The tile tooltip uses it (`inspectCell`), and the Hash Index Details panel shows its numbers.
- **Key and hash:** the key is the text `"plot|row|col"`, hashed with djb2 and reduced by the bucket count.
- **Separate chaining:** each bucket holds a chain of entries, so colliding keys share one bucket and a lookup walks one chain.
- **Rehashing:** it starts with 16 buckets. Before adding a new key that would push the load factor (entries / buckets) above 0.75, it doubles the buckets and re-files every entry. It never shrinks; `clear()` returns to 16.
- **Cost:** put, get and remove are O(1) on average and O(n) worst case. A rehash is O(n + m). The grid can already read any tile in O(1), so this index is for teaching, not speed.
- **Synchronisation:** the index only mirrors the grid and is never saved. It is rebuilt from the grid after loading a save or undoing (`rebuildIndex`, O(300 tiles)).

## 10. Season archive: harvest tracking
`SeasonHarvestTracker` records each successful harvest in the current season: crop, quantity and value (fixed at harvest time). Each season occurrence has a serial number, such as "Spring — Cycle 1". When a new day starts a new season, the finished one is archived once. Loading a save or pressing Undo never archives anything. It only records data; the ranking is done in feature 11. Old saves load with the current season marked partial.

## 11. Merge Sort: Seasonal Rankings
- **Where:** Crop Guide > Rankings. It ranks the crops harvested within **one** chosen season (not seasons against each other), by harvest value or quantity.
- **How:** a hand-written top-down Merge Sort on a copy of the rows. It splits at the midpoint, sorts each half, and merges them with a helper array.
- **Two tie rules:** (1) rows the comparator calls equal keep their input order (stability). (2) When the chosen metric is equal, the crop harvested first that season ranks higher.
- **Cost:** O(n log n) time in every case, and O(n) helper space plus O(log n) recursion. Tied crops get different rank numbers; there is no "tied" marker.

## 12. Graph and BFS: world map
`WorldGraph` has the four places as nodes and the roads as edges. `shortestPath()` uses Breadth-First Search (a queue and a visited map that also remembers how each place was reached, O(V + E)), which finds the route with the fewest roads. Clicking a place on the map asks for that route, and the marker then walks it one stop at a time. Each trip is also remembered in the deque (feature 8).

## Where each feature is tested
Run `node tests/run_all.js` (7 files). Features 1, 4, 5, 6 and 12 are covered by `game_logic.test.js`; 7 by `inventory_sort.test.js`; 9 by `plant_hash_table.test.js` and `plant_index.test.js`; 10 by `season_tracking.test.js`; 11 by `season_rankings.test.js` and `audit_ties_and_balance.test.js`. Features 2, 3 and 8 have no dedicated Node test file here; the README notes they were checked with development-time browser scripts that are not included.
