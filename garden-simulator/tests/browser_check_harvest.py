"""Optional browser check for the Harvest Inventory (sorted, display-only backpack view).
Run from anywhere:  python3 tests/browser_check_harvest.py [screenshot_folder]
Needs Python 3 + Playwright. Checks desktop and phone widths. If a folder is given, screenshots go there."""
import json
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
        page = browser.new_context(viewport={"width": width, "height": height}).new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "ERR_" not in m.text else None)
        page.goto(URL)
        page.wait_for_timeout(400)
        inv = lambda: page.evaluate("JSON.stringify(window.garden.game.inventory.slots)")
        rows = lambda: page.eval_on_selector_all("#harvest-body tr", "trs => trs.map(tr => [...tr.children].map(td => td.textContent))")
        names = lambda: [r[0] for r in rows()]

        page.locator("#btn-pack").click()
        page.locator("#harvest-inv summary").click()
        check(tag + "empty state is shown, table hidden", page.locator("#harvest-empty").is_visible() and not page.locator("#harvest-table").is_visible())
        check(tag + "summary says 0 crops", "(0 crops)" in page.locator("#harvest-summary").inner_text())

        # Put crops in the real backpack (two Carrot stacks) and let the game refresh the open dialog.
        page.evaluate("""() => { const i = window.garden.game.inventory;
          i.slots[10] = {id:'rose', qty:3}; i.slots[11] = {id:'carrot', qty:10}; i.slots[12] = {id:'daisy', qty:4};
          i.slots[13] = {id:'carrot', qty:5}; i.slots[14] = {id:'tomato-seed', qty:2}; i.slots[15] = {id:'potato', qty:7};
          window.garden.ui.render(); }""")
        before = inv()
        sel_before = page.evaluate("window.garden.game.selected")
        check(tag + "default view: name ascending, duplicate carrot stacks merged",
              names() == ["Carrot", "Daisy", "Potato", "Rose"] and rows()[0][1] == "15", str(rows()))
        check(tag + "row shows qty, unit, total, growth", rows()[0] == ["Carrot", "15", "5", "75", "3 min"], str(rows()[0]))
        check(tag + "summary updates to 4 crops", "(4 crops)" in page.locator("#harvest-summary").inner_text())

        page.select_option("#harvest-sort-key", "total")
        check(tag + "total value ascending", names() == ["Daisy", "Carrot", "Potato", "Rose"], str(names()))
        page.locator("#harvest-sort-dir").click()
        check(tag + "direction button flips to descending", names() == ["Rose", "Potato", "Carrot", "Daisy"] and "Descending" in page.locator("#harvest-sort-dir").inner_text(), str(names()))
        for key, expect in (("unit", ["Rose", "Potato", "Daisy", "Carrot"]), ("quantity", ["Carrot", "Potato", "Daisy", "Rose"]),
                            ("growth", ["Rose", "Potato", "Carrot", "Daisy"]), ("name", ["Rose", "Potato", "Daisy", "Carrot"])):
            page.select_option("#harvest-sort-key", key)
            check(tag + f"{key} descending", names() == expect, str(names()))
        check(tag + "real backpack slots, hotbar and selected slot never changed", inv() == before and page.evaluate("window.garden.game.selected") == sel_before)

        # The view follows inventory changes while the dialog is open.
        page.evaluate("window.garden.game.inventory.add('tulip', 2); window.garden.ui.render();")
        check(tag + "view updates when inventory changes", "Tulip" in names() and "(5 crops)" in page.locator("#harvest-summary").inner_text(), str(names()))
        # Existing backpack interaction still works: select a slot, then swap it.
        page.locator('#pack-grid .slot[data-slot="10"]').click()
        page.locator('#pack-grid .slot[data-slot="16"]').click()
        slots = json.loads(inv())
        check(tag + "swap still works and view stays correct", slots[16] and slots[16]["id"] == "rose" and slots[10] is None and "Rose" in names(), str(slots[10:17]))
        overflow = page.evaluate("[document.documentElement.scrollWidth, innerWidth, document.getElementById('pack-dialog').scrollWidth, document.getElementById('pack-dialog').clientWidth]")
        check(tag + "no horizontal overflow", overflow[0] <= overflow[1] and overflow[2] <= overflow[3] + 1, str(overflow))
        if SHOTS:
            SHOTS.mkdir(parents=True, exist_ok=True)
            page.locator("#pack-dialog").screenshot(path=str(SHOTS / f"harvest_{width}.png"))
        page.keyboard.press("Escape")
        page.reload(); page.wait_for_timeout(300)
        page.locator("#btn-pack").click()
        check(tag + "after reload the sort setting is back to Name (ascending) and rows come from the saved backpack",
              page.locator("#harvest-sort-key").input_value() == "name" and "Ascending" in page.locator("#harvest-sort-dir").text_content())
        check(tag + "no console errors", not errors, str(errors))
    browser.close()

print("\nAll harvest browser checks passed" if not problems else f"\n{len(problems)} check(s) failed")
sys.exit(1 if problems else 0)
