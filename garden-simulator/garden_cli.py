#!/usr/bin/env python3
"""
garden_cli.py — Pixel Garden Simulator (CLI)

Contents
    1. Constants & Config
    2. Garden Grid (2D matrix, 3 plots, flat-index helper)
    3. Circular Doubly Linked List (Time & Seasons)
    4. Action Stack (Undo history)
    5. Pixel / CLI Display UI
    6. Game glue (planting + undo)
    7. Demo / test loop

Run:  python garden_cli.py
"""

# [Prototype] — This is the ORIGINAL terminal prototype (Phase 1). It has only: a 3-plot grid, a circular doubly linked list for
# seasons and day/night, and an undo stack for planting. It has NONE of the later browser features (growth timestamps, market,
# backpack, world map, Crop Guide trees, hash index, sorting, season archive). Those live in script.js.
import os
import sys
from dataclasses import dataclass
from typing import Any, Iterator, List, Optional, Union


# =============================================================================
# 1. CONSTANTS & CONFIG
# =============================================================================

GRID_SIZE = 10

# Plant growth stages
STAGE_EMPTY = 0
STAGE_SEED = 1
STAGE_GROWING = 2
STAGE_MATURE = 3

STAGE_SYMBOLS = {
    STAGE_EMPTY: ".",
    STAGE_SEED: "🌱",
    STAGE_GROWING: "🌿",
    STAGE_MATURE: "🌸",
}

STAGE_NAMES = {
    STAGE_EMPTY: "Empty",
    STAGE_SEED: "Seed",
    STAGE_GROWING: "Growing",
    STAGE_MATURE: "Mature",
}

# The three garden plots
PLOT_NAMES = ["Flowers", "Root Crops", "Vegetables/Fruits"]

# Time settings
DAYS_PER_SEASON = 7
SEASONS = ["Spring", "Summer", "Autumn", "Winter"]
DAY_PHASES = ["Day", "Night"]

SEASON_ICONS = {"Spring": "🌼", "Summer": "🌻", "Autumn": "🍂", "Winter": "❄️"}
PHASE_ICONS = {"Day": "🌞", "Night": "🌙"}

# How many growth steps plants receive per new day in each season.
# Winter = 0 means plants are dormant. Tweak freely.
SEASON_GROWTH = {"Spring": 1, "Summer": 1, "Autumn": 1, "Winter": 0}


# =============================================================================
# 2. GARDEN GRID  (2D matrix, 3 plots, view switching, flat-index helper)
# =============================================================================

# [2D matrix] — Garden grid — three 10x10 lists of lists (stages and plant names), one per plot
class GardenGrid:
    """Holds three separate 10x10 plots and tracks which one is being viewed."""

    def __init__(self) -> None:
        self.stages = {
            name: [[STAGE_EMPTY] * GRID_SIZE for _ in range(GRID_SIZE)]
            for name in PLOT_NAMES
        }
        self.plant_names = {
            name: [[None] * GRID_SIZE for _ in range(GRID_SIZE)]
            for name in PLOT_NAMES
        }
        self.active_index = 0

    # ---- Flat-index helpers -------------------------------------------------
    # Time: O(1) — one multiply and one add.
    @staticmethod
    def to_flat(row: int, col: int) -> int:
        """(row, col) -> flat index  (row * 10 + col)."""
        return row * GRID_SIZE + col

    # Time: O(1) — one divmod.
    @staticmethod
    def from_flat(index: int) -> tuple:
        """flat index -> (row, col)."""
        return divmod(index, GRID_SIZE)

    # Time: O(1) — two comparisons.
    @staticmethod
    def in_bounds(row: int, col: int) -> bool:
        return 0 <= row < GRID_SIZE and 0 <= col < GRID_SIZE

    # ---- View switching -----------------------------------------------------
    # Time: O(1) — direct list index.
    @property
    def active_plot(self) -> str:
        return PLOT_NAMES[self.active_index]

    # Time: O(1) by index; O(P) by name for P plots (P = 3).
    def switch_plot(self, target: Union[int, str]) -> bool:
        """Switch view by index (0-2) or by plot name. Returns True on success."""
        if isinstance(target, int) and 0 <= target < len(PLOT_NAMES):
            self.active_index = target
            return True
        if isinstance(target, str):
            for i, name in enumerate(PLOT_NAMES):
                if name.lower() == target.lower():
                    self.active_index = i
                    return True
        return False

    # Time: O(1) — modular arithmetic.
    def cycle_plot(self, step: int = 1) -> str:
        """Move to the next (+1) or previous (-1) plot, wrapping around."""
        self.active_index = (self.active_index + step) % len(PLOT_NAMES)
        return self.active_plot

    # ---- Cell access --------------------------------------------------------
    # Time: O(1) — direct 2D list index lookup.
    def get_stage(self, row: int, col: int, plot: Optional[str] = None) -> int:
        plot = plot or self.active_plot
        return self.stages[plot][row][col]

    # Time: O(1) — direct 2D list index lookup.
    def get_plant_name(self, row: int, col: int, plot: Optional[str] = None) -> Optional[str]:
        plot = plot or self.active_plot
        return self.plant_names[plot][row][col]

    # Time: O(1) — two 2D list assignments.
    def set_cell(self, row: int, col: int, stage: int,
                plant_name: Optional[str] = None, plot: Optional[str] = None) -> None:
        plot = plot or self.active_plot
        self.stages[plot][row][col] = stage
        self.plant_names[plot][row][col] = plant_name if stage != STAGE_EMPTY else None

    # Time: O(1) — bounds check plus one cell update.
    def plant_seed(self, row: int, col: int, plant_name: str,
                plot: Optional[str] = None) -> bool:
        """Plant a seed in an empty, in-bounds cell. Returns True on success."""
        plot = plot or self.active_plot
        if not self.in_bounds(row, col):
            return False
        if self.stages[plot][row][col] != STAGE_EMPTY:
            return False
        self.set_cell(row, col, STAGE_SEED, plant_name, plot)
        return True

    # ---- Growth -------------------------------------------------------------
    # Time: O(P × R × C) — checks every garden tile (3 × 10 × 10 = 300).
    # Space: O(1) extra.
    # Growth here is STEP based (each new day moves plants forward); the browser game grows plants by the real-time clock instead.
    def advance_growth(self, steps: int = 1) -> int:
        """
        Advance every planted cell (in all 3 plots) by `steps` growth stages,
        capped at Mature. Returns the number of cells that changed.
        """
        changed = 0
        for plot in PLOT_NAMES:
            for r in range(GRID_SIZE):
                for c in range(GRID_SIZE):
                    stage = self.stages[plot][r][c]
                    if STAGE_EMPTY < stage < STAGE_MATURE:
                        self.stages[plot][r][c] = min(STAGE_MATURE, stage + steps)
                        changed += 1
        return changed

    # Time: O(R × C) — checks every tile of one plot.
    def count_plants(self, plot: Optional[str] = None) -> int:
        plot = plot or self.active_plot
        return sum(1 for row in self.stages[plot] for s in row if s != STAGE_EMPTY)


# =============================================================================
# 3. CIRCULAR DOUBLY LINKED LIST  (Time & Seasons)
# =============================================================================

class Node:
    def __init__(self, data: Any) -> None:
        self.data = data
        self.next: "Node" = self
        self.prev: "Node" = self


# [Circular doubly linked list] — Time and seasons — the last node links back to the first, so seasons and day/night repeat forever
class CircularDoublyLinkedList:
    """Circular doubly linked list with a movable 'current' pointer."""

    def __init__(self) -> None:
        self.head: Optional[Node] = None
        self.current: Optional[Node] = None
        self.size = 0

    # Time: O(1) — the tail is found through head.prev.
    def append(self, data: Any) -> None:
        node = Node(data)
        if self.head is None:
            self.head = self.current = node
        else:
            tail = self.head.prev
            tail.next = node
            node.prev = tail
            node.next = self.head
            self.head.prev = node
        self.size += 1

    # Time: O(1) — follow one next pointer.
    def move_next(self) -> Any:
        self.current = self.current.next
        return self.current.data

    # Time: O(1) — follow one prev pointer.
    def move_prev(self) -> Any:
        self.current = self.current.prev
        return self.current.data

    # Time: O(1) — read the current node.
    def current_data(self) -> Any:
        return self.current.data if self.current else None

    # Time: O(n) — walks every node once.
    def __iter__(self) -> Iterator[Any]:
        node = self.head
        for _ in range(self.size):
            yield node.data
            node = node.next


# [Time cycle] — Day/night and seasons — two circular lists; moving next/prev walks around the ring
class TimeSystem:
    """
    Tracks the day/night cycle and the seasons using two circular doubly linked lists.
        Day phases : Day <-> Night
        Seasons    : Spring -> Summer -> Autumn -> Winter -> (Spring ...)
    """

    def __init__(self, grid: GardenGrid) -> None:
        self.grid = grid
        self.day_counter = 1
        self.days_into_season = 1

        self.seasons = CircularDoublyLinkedList()
        for s in SEASONS:
            self.seasons.append(s)

        self.phases = CircularDoublyLinkedList()
        for p in DAY_PHASES:
            self.phases.append(p)

    # Time: O(1) — read the current season node.
    @property
    def season(self) -> str:
        return self.seasons.current_data()

    # Time: O(1) — read the current phase node.
    @property
    def phase(self) -> str:
        return self.phases.current_data()

    # Time: O(1) for Day -> Night; a new day also costs the _start_new_day() work below.
    def advance_phase(self) -> str:
        """Toggle Day <-> Night. Night -> Day starts a new day (grows plants)."""
        if self.phase == "Night":
            self.phases.move_next()
            self._start_new_day()
        else:
            self.phases.move_next()
        return self.phase

    # Time: O(1) list moves plus _start_new_day().
    def advance_day(self) -> dict:
        """
        Skip ahead to the start of the next day. Increments the day counter,
        changes season when due, and triggers plant growth.
        Returns a summary dict: {"day", "season", "season_changed", "grown"}.
        """
        while self.phase != "Night":          # finish out the current day
            self.phases.move_next()
        self.phases.move_next()               # Night -> Day
        return self._start_new_day()

    # Time: O(P × R × C) — advance_growth() checks every garden tile.
    # A new day: count days, move to the next season when due, then grow plants.
    def _start_new_day(self) -> dict:
        self.day_counter += 1
        self.days_into_season += 1
        season_changed = False

        if self.days_into_season > DAYS_PER_SEASON:
            self.seasons.move_next()
            self.days_into_season = 1
            season_changed = True

        grown = self.grid.advance_growth(SEASON_GROWTH[self.season])
        return {
            "day": self.day_counter,
            "season": self.season,
            "season_changed": season_changed,
            "grown": grown,
        }

    # Time: O(1) — one prev-pointer move.
    # Walking BACKWARDS around the ring (the 'doubly' part of the list).
    def rewind_season(self) -> str:
        """Demonstrates backwards traversal of the doubly linked list."""
        self.seasons.move_prev()
        self.days_into_season = 1
        return self.season


# =============================================================================
# 4. ACTION STACK  (LIFO undo history)
# =============================================================================

@dataclass
class PlayerAction:
    """A recorded, reversible player action."""
    description: str
    plot: str
    row: int
    col: int
    prev_stage: int
    prev_plant: Optional[str]


# [Stack] — Undo — last in, first out: undo always removes the newest action (a Python list used as a stack)
class ActionStack:
    """Simple LIFO stack backed by a list."""

    def __init__(self) -> None:
        self._items: List[PlayerAction] = []

    # Time: O(1) amortized — list append.
    def push(self, action: PlayerAction) -> None:
        self._items.append(action)

    # Time: O(1) — list pop from the end (LIFO).
    def pop(self) -> Optional[PlayerAction]:
        """Remove and return the most recent action (Undo). None if empty."""
        return self._items.pop() if self._items else None

    # Time: O(1) — read the last item.
    def peek(self) -> Optional[PlayerAction]:
        """Look at the most recent action without removing it."""
        return self._items[-1] if self._items else None

    # Time: O(1).
    def is_empty(self) -> bool:
        return not self._items

    # Time: O(1).
    def size(self) -> int:
        return len(self._items)

    # Time: O(n) — copies and reverses the last n actions.
    def recent(self, n: int = 5) -> List[PlayerAction]:
        """Most recent n actions, newest first."""
        return list(reversed(self._items[-n:]))


# =============================================================================
# 5. PIXEL / CLI DISPLAY UI
# =============================================================================

def clear_screen() -> None:
    os.system("cls" if os.name == "nt" else "clear")


def _cell_text(stage: int) -> str:
    """Every cell is exactly 2 terminal columns wide so the grid stays aligned."""
    symbol = STAGE_SYMBOLS[stage]
    return ". " if stage == STAGE_EMPTY else symbol


# Time: O(R × C) — prints every tile of the active plot.
def render_garden(grid: GardenGrid, time_sys: TimeSystem, stack: ActionStack) -> None:
    """Print the status bar, plot tabs, and the framed 10x10 grid."""
    inner_width = GRID_SIZE * 2 + 2
    status = (
        f"Day {time_sys.day_counter}  |  "
        f"{SEASON_ICONS[time_sys.season]} {time_sys.season} "
        f"({time_sys.days_into_season}/{DAYS_PER_SEASON})  |  "
        f"{PHASE_ICONS[time_sys.phase]} {time_sys.phase}"
    )

    tabs = "  ".join(
        f"[{name}]" if i == grid.active_index else f" {name} "
        for i, name in enumerate(PLOT_NAMES)
    )

    print("=" * 44)
    print("   🌳  PIXEL GARDEN SIMULATOR  🌳")
    print("=" * 44)
    print(f" {status}")
    print(f" Plots: {tabs}")
    print(f" Viewing: {grid.active_plot}   (plants: {grid.count_plants()})")
    print()

    # Column header
    print("    " + "".join(f"{c} " for c in range(GRID_SIZE)))
    print("  ╔" + "═" * inner_width + "╗")
    for r in range(GRID_SIZE):
        cells = "".join(_cell_text(grid.get_stage(r, c)) for c in range(GRID_SIZE))
        print(f"{r} ║ {cells} ║")
    print("  ╚" + "═" * inner_width + "╝")

    legend = "  ".join(f"{STAGE_SYMBOLS[s]} {STAGE_NAMES[s]}" for s in STAGE_SYMBOLS)
    print(f"  {legend}")

    last = stack.peek()
    print(f"\n Last action: {last.description if last else '(none)'}")


# =============================================================================
# 6. GAME GLUE  (planting + undo)
# =============================================================================

# Time: O(1) — a few list lookups and one stack push.
# [Stack push] — Plant — remember what the tile held BEFORE (prev_stage, prev_plant) so undo can restore it.
def plant_and_record(grid: GardenGrid, stack: ActionStack,
                    row: int, col: int, plant_name: str) -> str:
    """Plant a seed in the active plot and push the action onto the stack."""
    plot = grid.active_plot
    if not grid.in_bounds(row, col):
        return f"Out of bounds: [{row},{col}] (use 0-{GRID_SIZE - 1})."
    if grid.get_stage(row, col) != STAGE_EMPTY:
        return f"Cell [{row},{col}] is already occupied."

    prev_stage, prev_plant = grid.get_stage(row, col), grid.get_plant_name(row, col)
    grid.plant_seed(row, col, plant_name)
    desc = f"Planted {plant_name} at [{row},{col}] in {plot}"
    stack.push(PlayerAction(desc, plot, row, col, prev_stage, prev_plant))
    return desc


# Time: O(1) — one stack pop and one cell update.
# [Stack pop] — Undo — restores the saved previous values of the tile.
def undo_last_action(grid: GardenGrid, stack: ActionStack) -> str:
    """Pop the latest action and restore the cell it changed."""
    action = stack.pop()
    if action is None:
        return "Nothing to undo."
    grid.set_cell(action.row, action.col, action.prev_stage,
                    action.prev_plant, plot=action.plot)
    return f"Undid: {action.description}"


# =============================================================================
# 7. DEMO / TEST LOOP
# =============================================================================

HELP_TEXT = """
Commands:
    plant <row> <col> <name>   plant a seed in the current plot  (e.g. plant 0 0 Sunflower)
    view <1|2|3>               switch plot (1=Flowers, 2=Root Crops, 3=Vegetables/Fruits)
    next / prev                cycle to next / previous plot
    day                        advance one full day (grows plants)
    phase                      toggle Day/Night (new day begins after Night)
    undo                       undo your last action
    history                    show recent actions
    flat <row> <col>           show the flat index for a cell
    help                       show this list
    quit                       exit
"""


def main() -> None:
    # Make sure emoji / box characters print correctly on Windows terminals
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    grid = GardenGrid()
    time_sys = TimeSystem(grid)
    stack = ActionStack()
    message = "Welcome! Type 'help' for commands."

    while True:
        clear_screen()
        render_garden(grid, time_sys, stack)
        print(f"\n >> {message}")

        try:
            raw = input("\n garden> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nGoodbye!")
            break

        if not raw:
            message = ""
            continue

        parts = raw.split()
        cmd, args = parts[0].lower(), parts[1:]

        if cmd in ("quit", "exit", "q"):
            print("Goodbye! 🌻")
            break

        elif cmd == "help":
            message = HELP_TEXT

        elif cmd == "plant":
            if len(args) < 3 or not (args[0].lstrip("-").isdigit() and args[1].lstrip("-").isdigit()):
                message = "Usage: plant <row> <col> <name>"
            else:
                message = plant_and_record(grid, stack, int(args[0]), int(args[1]), " ".join(args[2:]))

        elif cmd == "view":
            if args and args[0].isdigit() and grid.switch_plot(int(args[0]) - 1):
                message = f"Now viewing: {grid.active_plot}"
            else:
                message = "Usage: view <1|2|3>"

        elif cmd == "next":
            message = f"Now viewing: {grid.cycle_plot(1)}"

        elif cmd == "prev":
            message = f"Now viewing: {grid.cycle_plot(-1)}"

        elif cmd == "day":
            info = time_sys.advance_day()
            message = f"A new day dawns (Day {info['day']}). {info['grown']} plant(s) grew."
            if info["season_changed"]:
                message += f" The season changed to {info['season']}!"

        elif cmd == "phase":
            before = time_sys.day_counter
            time_sys.advance_phase()
            message = f"It is now {time_sys.phase}."
            if time_sys.day_counter != before:
                message += f" A new day begins (Day {time_sys.day_counter})."

        elif cmd == "undo":
            message = undo_last_action(grid, stack)

        elif cmd == "history":
            recent = stack.recent(5)
            message = ("Recent actions:\n   " + "\n   ".join(a.description for a in recent)
                    if recent else "No actions yet.")

        elif cmd == "flat":
            if len(args) == 2 and all(a.isdigit() for a in args) and grid.in_bounds(int(args[0]), int(args[1])):
                r, c = int(args[0]), int(args[1])
                message = f"[{r},{c}] -> flat index {GardenGrid.to_flat(r, c)}"
            else:
                message = "Usage: flat <row> <col>"

        else:
            message = f"Unknown command '{cmd}'. Type 'help'."


if __name__ == "__main__":
    main()
