"""Optional browser check for the plant index. Run from anywhere:  python3 tests/browser_check.py
Needs Python 3 + Playwright (pip install playwright; playwright install chromium). Opens garden-simulator.html from this project."""
import pathlib
import sys
from playwright.sync_api import sync_playwright

URL = (pathlib.Path(__file__).resolve().parent.parent / "garden-simulator.html").as_uri()
problems = []


def check(name, ok, detail=""):
    print(("ok   - " if ok else "FAIL - ") + name + ("" if ok else f"  ({detail})"))
    if not ok:
        problems.append(name)


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_context(viewport={"width": 1100, "height": 1300}).new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "ERR_" not in m.text else None)
    page.clock.install(time=1_800_000_000_000)
    page.goto(URL)
    page.wait_for_timeout(100)
    page.clock.run_for(500)

    cell = lambda r, c: page.locator(f'.cell[data-row="{r}"][data-col="{c}"]')
    slot = lambda i: page.locator(f'#hotbar .slot[data-slot="{i}"]')
    stats = lambda: {k: page.locator(f"#{k}").inner_text() for k in ("hash-size", "hash-buckets", "hash-load", "hash-collisions")}

    # The panel: open "Today's Actions", then expand the collapsible details
    page.locator("#chip-history").click()
    page.locator("#hash-details summary").click()
    check("Hash Index Details opens and starts empty", stats() == {"hash-size": "0", "hash-buckets": "16", "hash-load": "0.00", "hash-collisions": "0"}, str(stats()))
    page.keyboard.press("Escape")

    check("empty tile title unchanged", cell(0, 0).get_attribute("title").startswith("Empty soil"), cell(0, 0).get_attribute("title"))
    slot(2).click()                         # daisy seeds
    cell(0, 0).click()
    check("planted tile title uses the index", cell(0, 0).get_attribute("title").startswith("Daisy - Seed - thirsty"), cell(0, 0).get_attribute("title"))
    check("index has the plant", page.evaluate("window.garden.game.grid.plantIndex.has('Flowers',0,0) && window.garden.game.grid.indexMatchesGrid()"))
    check("details show 1 entry", stats()["hash-size"] == "1", str(stats()))
    slot(1).click()                         # watering can
    cell(0, 0).click()
    cell(0, 0).hover()
    page.clock.run_for(1100)
    check("watered tile shows time left", "left" in cell(0, 0).get_attribute("title"), cell(0, 0).get_attribute("title"))
    page.clock.run_for(4 * 60 * 1000)
    check("ripe tile title", "ready to harvest" in cell(0, 0).get_attribute("title"), cell(0, 0).get_attribute("title"))
    slot(0).click()                         # shears
    cell(0, 0).click()
    check("harvest empties tile and index", cell(0, 0).get_attribute("title").startswith("Empty soil") and page.evaluate("window.garden.game.grid.plantIndex.size") == 0)
    tracked = lambda: page.evaluate("JSON.stringify(window.garden.game.tracker.toJSON())")
    check("harvest was recorded for this season (1 daisy, value 12)", '"crops":[{"cropId":"daisy","quantity":1,"value":12}]' in tracked() and '"partial":false' in tracked(), tracked())
    page.evaluate("window.garden.ui.handleUndo()")
    check("undo takes the harvest record back", '"current":{"serial":0,"partial":false,"crops":[]}' in tracked(), tracked())
    check("undo restores the plant and the index", cell(0, 0).get_attribute("title").startswith("Daisy") and page.evaluate("window.garden.game.grid.indexMatchesGrid() && window.garden.game.grid.plantIndex.size") == 1, cell(0, 0).get_attribute("title"))
    cell(0, 1).focus()   # (the info line only refreshes when a tile's title changes, as in the original game)
    check("keyboard focus on an empty tile shows its title", page.locator("#cell-info").inner_text().startswith("Empty soil"), page.locator("#cell-info").inner_text())
    cell(0, 0).focus()
    check("keyboard focus still shows the tile title", "Daisy" in page.locator("#cell-info").inner_text(), page.locator("#cell-info").inner_text())
    page.reload()
    page.wait_for_timeout(300)
    check("after reload the saved plant is indexed", cell(0, 0).get_attribute("title").startswith("Daisy") and page.evaluate("window.garden.game.grid.indexMatchesGrid() && window.garden.game.grid.plantIndex.size") == 1)
    page.clock.run_for(6 * 60 * 1000)
    slot(0).click()
    cell(0, 0).click()
    page.reload()
    page.wait_for_timeout(300)
    check("after reload the harvest record is still there (saved with the game)", '"crops":[{"cropId":"daisy","quantity":1,"value":12}]' in tracked(), tracked())
    page.evaluate("() => { const k = 'pixel-garden-save-v2'; const d = JSON.parse(localStorage.getItem(k)); delete d.harvests; localStorage.setItem(k, JSON.stringify(d)); }")
    page.reload()
    page.wait_for_timeout(300)
    check("an old save (no harvests field) loads; tracking starts now and is marked partial", '"partial":true' in tracked() and '"crops":[]' in tracked() and cell(0, 0).get_attribute("title") is not None, tracked())
    page.once("dialog", lambda d: d.accept())
    page.evaluate("window.garden.ui.handleNewGame()")
    page.wait_for_timeout(500)
    check("new game starts with an empty index", page.evaluate("window.garden.game.grid.plantIndex.size") == 0 and cell(0, 0).get_attribute("title").startswith("Empty soil"))
    check("new game starts with empty tracking", '"current":{"serial":0,"partial":false,"crops":[]},"archive":[]' in tracked(), tracked())
    check("no console errors", not errors, str(errors))
    browser.close()

print("\nAll browser checks passed" if not problems else f"\n{len(problems)} check(s) failed")
sys.exit(1 if problems else 0)
