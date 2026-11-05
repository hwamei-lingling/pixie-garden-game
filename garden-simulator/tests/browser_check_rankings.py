"""Optional browser check for the Crop Guide > Rankings tab (Merge Sort, per-season). Run from anywhere:
    python3 tests/browser_check_rankings.py [screenshot_folder]
Needs Python 3 + Playwright. Checks desktop and phone widths."""
import pathlib
import sys
from playwright.sync_api import sync_playwright

URL = (pathlib.Path(__file__).resolve().parent.parent / "garden-simulator.html").as_uri()
SHOTS = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None
problems = []


def check(name, ok, detail=""):
    print(("ok   - " if ok else "FAIL - ") + name + ("" if ok else f"  ({detail})"))
    if not ok:
        problems.append(name)


with sync_playwright() as p:
    browser = p.chromium.launch()
    for width, height in ((1280, 900), (390, 800), (320, 700)):
        tag = f"[{width}px] "
        ctx = browser.new_context(viewport={"width": width, "height": height})
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "ERR_" not in m.text else None)
        page.goto(URL)
        page.wait_for_timeout(400)
        rows = lambda: page.eval_on_selector_all("#rank-body tr", "trs => trs.map(tr => [...tr.children].map(td => td.textContent))")
        text = lambda sel: page.locator(sel).inner_text()
        js = lambda code: page.evaluate(code)
        refresh = "window.garden.ui.render();"

        page.locator("#btn-crops").click()
        check(tag + "existing Crop Guide tabs are all still there", page.locator(".crop-tabs button").all_inner_texts() == ["By Garden", "A-Z Catalog", "Level View", "Tree View", "Rankings"], str(page.locator(".crop-tabs button").all_inner_texts()))
        page.locator("#crop-tab-rank").click()
        check(tag + "Rankings tab opens; other views hidden", page.locator("#crop-view-rank").is_visible() and not page.locator("#crop-view-garden").is_visible())
        check(tag + "honest empty state for a fresh season", "No harvests recorded yet" in text("#rank-empty") and not page.locator("#rank-table").is_visible(), text("#rank-empty"))
        check(tag + "labelled as the current season", text("#rank-status").startswith("Spring — Cycle 1") and "Current season" in text("#rank-status"), text("#rank-status"))
        check(tag + "no partial label on a new game", not page.locator("#rank-partial").is_visible())

        # Real harvests through the game rules (grow quickly by moving the plant's ready time to the past).
        js("""() => { const g = window.garden.game; const T = Date.now();
          const harvest = (id, r, c) => { g.inventory.add(id + '-seed', 1); g.player.energy = g.player.maxEnergy;
            g.location = {daisy:'meadow',carrot:'roots',tomato:'orchard'}[id]; g._syncPlot();
            g.plantTile(r, c, id); g.waterTile(r, c); g.grid.readyAt[g.place.plot][r][c] = T - 1000; g.grid.wateredAt[g.place.plot][r][c] = T - 600000;
            g.player.energy = g.player.maxEnergy; return g.harvestTile(r, c); };
          window.__h = harvest; harvest('carrot', 0, 0); harvest('daisy', 0, 0); harvest('tomato', 0, 0); harvest('tomato', 0, 1); window.garden.ui.render(); }""")
        check(tag + "ranking follows the harvests (value, highest first)", [r[1] for r in rows()] == ["Tomato", "Daisy", "Carrot"] and rows()[0] == ["1", "Tomato", "4", "24"], str(rows()))
        page.select_option("#rank-metric", "quantity")
        check(tag + "quantity ranking (tomato 4, carrot 2, daisy 1)", [r[1] for r in rows()] == ["Tomato", "Carrot", "Daisy"], str(rows()))
        page.select_option("#rank-metric", "value")

        # live update through the real UI path: undo the last harvest
        js("window.garden.ui.handleUndo();")
        check(tag + "open view updates after Undo; the 12/12 tie goes to the crop harvested first (daisy)", [r[1] for r in rows()] == ["Daisy", "Tomato", "Carrot"] and rows()[1][2] == "2", str(rows()))

        # season change
        js("() => { for (let i = 0; i < 7; i++) window.garden.game.sleep(); window.garden.ui.render(); }")
        check(tag + "new season: current is empty, completed season appears in the selector",
              "No harvests recorded yet" in text("#rank-empty") and page.locator("#rank-season option").count() == 2, text("#rank-empty"))
        opts = page.locator("#rank-season option").all_inner_texts()
        check(tag + "selector shows occurrence labels", opts == ["Summer — Cycle 1 (current)", "Spring — Cycle 1 (completed)"], str(opts))
        page.select_option("#rank-season", "0")
        check(tag + "completed season ranking and label", [r[1] for r in rows()] == ["Daisy", "Tomato", "Carrot"] and "Completed season" in text("#rank-status"), text("#rank-status") + str(rows()))
        js("() => { for (let i = 0; i < 7; i++) window.garden.game.sleep(); window.garden.ui.render(); }")
        check(tag + "a chosen completed season stays selected when another season ends", "Completed season" in text("#rank-status") and "Spring" in text("#rank-status"))
        page.select_option("#rank-season", "1")
        check(tag + "an empty completed season is honest", "Nothing was harvested in this season." in text("#rank-empty"), text("#rank-empty"))
        overflow = js("[document.documentElement.scrollWidth, innerWidth, document.getElementById('panel-crops').scrollWidth, document.getElementById('panel-crops').clientWidth]")
        check(tag + "no horizontal overflow", overflow[0] <= overflow[1] and overflow[2] <= overflow[3] + 1, str(overflow))
        if SHOTS:
            SHOTS.mkdir(parents=True, exist_ok=True)
            page.select_option("#rank-season", "0")
            page.locator("#panel-crops").screenshot(path=str(SHOTS / f"rank_{width}.png"))

        # old save (no harvests field): partial label
        js("() => { const k = 'pixel-garden-save-v2'; window.garden.game.save(); const d = JSON.parse(localStorage.getItem(k)); delete d.harvests; localStorage.setItem(k, JSON.stringify(d)); }")
        page.reload()
        page.wait_for_timeout(400)
        page.locator("#btn-crops").click()
        page.locator("#crop-tab-rank").click()
        check(tag + "old save: partial tracking is clearly labelled", page.locator("#rank-partial").is_visible() and "Partial tracking" in text("#rank-partial") and "partial" in page.locator("#rank-season option").first.inner_text(), text("#rank-status"))
        page.locator("#crop-tab-az").click()
        check(tag + "other tabs still work after Rankings", page.locator("#crop-view-az").is_visible() and not page.locator("#crop-view-rank").is_visible())
        page.locator("#crop-tab-tree").click()
        check(tag + "Tree View still works", page.locator("#crop-view-tree").is_visible())
        check(tag + "no console errors", not errors, str(errors))
        ctx.close()
    browser.close()

print("\nAll rankings browser checks passed" if not problems else f"\n{len(problems)} check(s) failed")
sys.exit(1 if problems else 0)
