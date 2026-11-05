"use strict";

/* =============================================================================
pixel-art.js  --  Pixel art: plant sprites + chibi characters
Contents
  1. Palette
  2. Plant sprite maps (12x12, one character = one pixel)
  3. Sprite lookup per plot + growth stage
  4. Canvas drawing helpers (with a dark outline, like the characters)
  5. Character roster (images in assets/characters/)
  6. Character DOM helpers
  7. Garden scene (fence, grass, path, shed, trees, pond - changes with season & night, plus per-plot scenery)
  7b. Item icons (seed packets, tools, coin, energy) and per-crop colours
  7c. World map picture
  8. Animated critters (butterflies)
  Loaded BEFORE script.js, which uses the global `PixelArt` object.
============================================================================= */

const PixelArt = (() => {
  const SPRITE_SIZE = 12;               // sprite is 12x12 pixels...
  const CANVAS_SIZE = SPRITE_SIZE + 2;  // ...on a 14x14 canvas (1px border for the outline)
  const OUTLINE = "#2a1a2e";

  /* ---------- 1. Palette ---------- */
  const PALETTE = {
    ".": null,        // transparent (soil shows through)
    d: "#a97548",     // soil speckle
    b: "#8b5a2b",     // brown
    l: "#9be564",     // light green
    g: "#4caf50",     // green
    G: "#2e7d32",     // dark green
    r: "#e53935",     // red
    p: "#ff7eb6",     // pink
    y: "#ffd23f",     // yellow
    o: "#ff9800",     // orange
    w: "#ffffff",     // white
    v: "#8e5bd9",     // purple
    k: "#2a1a2e",     // eyes
    h: "#ff9db0",     // blush
    s: "#cfd8dc",     // steel
    t: "#78909c",     // dark steel
    u: "#4f9be0",     // water blue
    i: "#bfe3ff",     // light water
    q: "#d99a00",     // dark gold
    n: "#f4ead2",     // cream (seed packets)
    c: "#ff9800",     // crop colour (replaced per crop through a tint)
  };

  /* ---------- 2. Plant sprite maps ---------- */
  // Rows are padded/trimmed to 12x12 by normalize(), so a typo can't crash drawing.
  const normalize = (rows) =>
    Array.from({ length: SPRITE_SIZE }, (_, y) =>
      (rows[y] || "").padEnd(SPRITE_SIZE, ".").slice(0, SPRITE_SIZE)
    );

  const EMPTY = normalize([
    "............",
    "............",
    "..d.........",
    "............",
    ".......d....",
    "............",
    "............",
    "...d........",
    ".........d..",
    "............",
    "....d.......",
    "............",
  ]);

  const SEED = normalize([
    "............",
    "............",
    "............",
    "............",
    "............",
    "............",
    ".....l......",
    "....lGl.....",
    ".....G......",
    "....bbb.....",
    "...bbbbb....",
    "............",
  ]);

  const LEAFY = normalize([
    "............",
    "............",
    "............",
    ".....g......",
    "....ggg.....",
    ".....G......",
    "..g..G..g...",
    "..gg.G.gg...",
    "...ggGgg....",
    ".....G......",
    ".....G......",
    "....bbb.....",
  ]);

  const FLOWER_GROWING = normalize([
    "............",
    "............",
    "............",
    ".....p......",
    "....ggg.....",
    ".....G......",
    "..g..G..g...",
    "..gg.G.gg...",
    "...ggGgg....",
    ".....G......",
    ".....G......",
    "....bbb.....",
  ]);

  const FLOWER_MATURE = normalize([
    "............",
    "....pp.pp...",
    "...ppyypp...",
    "....pyyp....",
    "...ppyypp...",
    "....pp.pp...",
    ".....G......",
    "..g..G......",
    "..gg.G......",
    "...ggG......",
    ".....G......",
    "....bbb.....",
  ]);

  // Mature root crop: a happy little carrot
  const CARROT_MATURE = normalize([
    "....g.g.g...",
    "....gGgGg...",
    ".....GGg....",
    "...oooooo...",
    "..oooooooo..",
    "..ookooko...",
    "..ohoooohoo.",
    "...oooooo...",
    "....oooo....",
    ".....oo.....",
    ".....oo.....",
    "............",
  ]);

  // Mature veg/fruit: a happy little strawberry
  const BERRY_MATURE = normalize([
    "............",
    "...ggGGgg...",
    "....gggg....",
    "..rrrrrrrr..",
    ".rrrrrrrrrr.",
    ".rrkrrrrkrr.",
    ".rhhrrrrhhr.",
    "..rryrrryr..",
    "...rrrrrr...",
    "....rrrr....",
    ".....rr.....",
    "............",
  ]);

  /* ---------- 3. Sprite lookup per plot + growth stage ---------- */
  // Stage numbers: 0 Empty, 1 Seed, 2 Growing, 3 Mature
  const SPRITES = {
    "Flowers":           { 0: EMPTY, 1: SEED, 2: FLOWER_GROWING, 3: FLOWER_MATURE },
    "Root Crops":        { 0: EMPTY, 1: SEED, 2: LEAFY,          3: CARROT_MATURE },
    "Vegetables/Fruits": { 0: EMPTY, 1: SEED, 2: LEAFY,          3: BERRY_MATURE },
  };

  function getSprite(plotName, stage) {
    const plot = SPRITES[plotName];
    return (plot && plot[stage]) || EMPTY;
  }

  // Every crop re-colours its plot's sprite, so 12 crops look different without 12 hand-drawn maps.
  // A tint maps a palette letter to a new colour (see PALETTE above).
  const CROP_TINTS = {
    daisy:      { p: "#ffffff", y: "#ffd23f" },
    tulip:      { p: "#ff5a7a", y: "#ffb3c1" },
    sunflower:  { p: "#ffd23f", y: "#7a4b2a" },
    rose:       { p: "#e53935", y: "#ff8a80" },
    carrot:     {},                                    // the base sprite already is a carrot
    radish:     { o: "#ff5a7a", h: "#ff9db0" },
    potato:     { o: "#d6a45a", h: "#c4894a" },
    beet:       { o: "#a23b72", h: "#d672a8" },
    tomato:     { r: "#ff5a3c", y: "#ff8a65" },
    cabbage:    { r: "#9be564", y: "#d6f5a4" },
    strawberry: {},                                    // the base sprite already is a strawberry
    eggplant:   { r: "#7e4fb3", y: "#b58cff" },
  };
  const CROP_PLOTS = {
    daisy: "Flowers", tulip: "Flowers", sunflower: "Flowers", rose: "Flowers",
    carrot: "Root Crops", radish: "Root Crops", potato: "Root Crops", beet: "Root Crops",
    tomato: "Vegetables/Fruits", cabbage: "Vegetables/Fruits", strawberry: "Vegetables/Fruits", eggplant: "Vegetables/Fruits",
  };
  const CROP_COLORS = {                                // colour of each crop's seed packet
    daisy: "#ffd23f", tulip: "#ff5a7a", sunflower: "#ffa000", rose: "#e53935",
    carrot: "#ff9800", radish: "#d6336c", potato: "#d6a45a", beet: "#a23b72",
    tomato: "#ff5a3c", cabbage: "#8fcf4a", strawberry: "#ff3b6b", eggplant: "#7e4fb3",
  };

  /* ---------- 4. Canvas drawing helpers ---------- */
  // Draws at 1 canvas pixel per sprite pixel; CSS scales it up (3x) with
  // `image-rendering: pixelated` so edges stay crisp.
  function drawSprite(canvas, rows, outline = true, tint = null) {
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const colorOf = (ch) => (ch !== "." && tint && tint[ch]) || PALETTE[ch];
    const filled = (x, y) =>
      x >= 0 && y >= 0 && x < SPRITE_SIZE && y < SPRITE_SIZE && colorOf(rows[y][x]);

    if (outline) {
      ctx.fillStyle = OUTLINE;
      for (let y = -1; y <= SPRITE_SIZE; y++) {
        for (let x = -1; x <= SPRITE_SIZE; x++) {
          if (!filled(x, y) &&
              (filled(x + 1, y) || filled(x - 1, y) || filled(x, y + 1) || filled(x, y - 1))) {
            ctx.fillRect(x + 1, y + 1, 1, 1);
          }
        }
      }
    }

    for (let y = 0; y < SPRITE_SIZE; y++) {
      for (let x = 0; x < SPRITE_SIZE; x++) {
        const color = colorOf(rows[y][x]);
        if (color) {
          ctx.fillStyle = color;
          ctx.fillRect(x + 1, y + 1, 1, 1);
        }
      }
    }
  }

  /** A plant in a garden cell. `cropId` re-colours it; `thirsty` adds a little water-drop badge. */
  function drawCell(canvas, plotName, stage, cropId = null, thirsty = false) {
    const tint = cropId ? CROP_TINTS[cropId] : null;
    drawSprite(canvas, getSprite(plotName, stage), stage !== 0, tint); // no outline on bare soil
    if (thirsty && stage > 0 && stage < 3) {
      const ctx = canvas.getContext("2d");
      const drop = [[11, 1], [10, 2], [11, 2], [12, 2], [10, 3], [11, 3], [12, 3], [11, 4]];
      ctx.fillStyle = OUTLINE;
      drop.forEach(([x, y]) => [-1, 0, 1].forEach((dx) => [-1, 0, 1].forEach((dy) => ctx.fillRect(x + dx, y + dy, 1, 1))));
      ctx.fillStyle = PALETTE.u;
      drop.forEach(([x, y]) => ctx.fillRect(x, y, 1, 1));
      ctx.fillStyle = PALETTE.i;
      ctx.fillRect(10, 3, 1, 1);
    }
  }

  /* ---------- 5. Character roster ---------- */
  // Each id matches a file in assets/characters/<id>.png (128x128, transparent).
  // Rename or retitle anyone you like; script.js decides who plays which role.
  const CHARACTER_DIR = "assets/characters/";
  const CHARACTERS = [
    { id: "lian",   name: "Lian",   title: "Spring Spirit" },
    { id: "daisy",  name: "Daisy",  title: "Flower Keeper" },
    { id: "mochi",  name: "Mochi",  title: "Winter Spirit" },
    { id: "teddy",  name: "Teddy",  title: "Cozy Gardener" },
    { id: "foxy",   name: "Foxy",   title: "Explorer Gardener" },
    { id: "minty",  name: "Minty",  title: "Mint Gardener" },
    { id: "woolly", name: "Woolly", title: "Apple Gardener" },
    { id: "moss",   name: "Moss",   title: "Root Keeper" },
    { id: "pinky",  name: "Pinky",  title: "Basket Gardener" },
    { id: "cocoa",  name: "Cocoa",  title: "Autumn Spirit" },
    { id: "grape",  name: "Grape",  title: "Grape Gardener" },
    { id: "lemon",  name: "Lemon",  title: "Summer Spirit" },
    { id: "muscat", name: "Muscat", title: "Vine Gardener" },
    { id: "berry",  name: "Berry",  title: "Berry Gardener" },
    { id: "kai",    name: "Kai",    title: "Young Gardener" },
    { id: "pip",    name: "Pip",    title: "Young Gardener" },
    { id: "fraise", name: "Fraise", title: "Fruit Keeper" },
  ].map((c) => ({ ...c, src: `${CHARACTER_DIR}${c.id}.png` }));

  function getCharacter(id) {
    return CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
  }

  /* ---------- 6. Character DOM helpers ---------- */
  /** A framed head-and-shoulders window onto a character. size: "sm" or "md". */
  function createFace(id, size = "sm") {
    const ch = getCharacter(id);
    const box = document.createElement("div");
    box.className = `face face--${size}`;
    const img = document.createElement("img");
    img.src = ch.src;
    img.alt = "";
    img.draggable = false;
    box.appendChild(img);
    return box;
  }

  /** A full-body character image (used for the gardener picker). */
  function createBody(id) {
    const ch = getCharacter(id);
    const img = document.createElement("img");
    img.src = ch.src;
    img.alt = ch.name;
    img.draggable = false;
    return img;
  }

  /* ---------- 7. Garden scene (the garden around the beds) ---------- */
  // Drawn procedurally at 1/3 resolution on a <canvas> that sits behind the grid, then scaled
  // up with `image-rendering: pixelated`. It changes with the season and with day/night.
  const SCENE_SCALE = 3; // css pixels per scene pixel
  const INK_RGB = [42, 26, 46];

  const SCENE_PAL = {
    Spring: {
      skyTop: "#8fd6ff", skyBot: "#d9f3ff", hillA: "#7fcf7a", hillB: "#6cbd69",
      grassA: "#8fd36a", grassB: "#82c860", tuft: "#5eae45",
      canopyA: "#ffb7d0", canopyB: "#ff8fb8", canopyC: "#ffe3ee",
      flowers: ["#ff8fb8", "#ffffff", "#ffd23f", "#c9a7ff"],
    },
    Summer: {
      skyTop: "#6fc8ff", skyBot: "#c9efff", hillA: "#62bf5a", hillB: "#52ad4f",
      grassA: "#74cc52", grassB: "#66bd48", tuft: "#4a9e38",
      canopyA: "#58bd5c", canopyB: "#3f9f4a", canopyC: "#8be07a",
      flowers: ["#ffd23f", "#ff9800", "#ff5a5f", "#ffffff"],
    },
    Autumn: {
      skyTop: "#ffcf9f", skyBot: "#fff0d8", hillA: "#c9a24a", hillB: "#b58a3c",
      grassA: "#b4c553", grassB: "#a5b848", tuft: "#869b3a",
      canopyA: "#f58a3c", canopyB: "#d9622b", canopyC: "#f7c548",
      flowers: ["#f58a3c", "#f7c548", "#c9472b", "#ffffff"],
    },
    Winter: {
      skyTop: "#bcdcf7", skyBot: "#eaf5ff", hillA: "#e6f1fa", hillB: "#d3e4f1",
      grassA: "#f4fafe", grassB: "#e4f0f8", tuft: "#c5d8e6",
      canopyA: "#ffffff", canopyB: "#dbeaf5", canopyC: "#ffffff",
      flowers: ["#ffffff"],
    },
  };
  const WOOD = { light: "#f6e2b8", mid: "#e8c98f", dark: "#d9b57c", plank: "#c58b52", deep: "#7a4b2a" };

  const rgbCache = {};
  const rgb = (c) => {
    if (Array.isArray(c)) return c;
    return rgbCache[c] || (rgbCache[c] = [
      parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16),
    ]);
  };
  const mixRgb = (a, c, t) => {
    const x = rgb(a), y = rgb(c);
    return [0, 1, 2].map((i) => Math.round(x[i] + (y[i] - x[i]) * t));
  };

  // Deterministic "random" from a coordinate, so the scene doesn't reshuffle when redrawn.
  const hash2 = (x, y) => {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  function makeRng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** A tiny RGBA pixel buffer with the drawing helpers the scene needs. */
  function makeBuffer(W, H) {
    const data = new Uint8ClampedArray(W * H * 4);
    const put = (x, y, c) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const i = (y * W + x) * 4;
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
    };
    const buf = {
      W, H, data,
      set(x, y, c) { put(Math.round(x), Math.round(y), rgb(c)); },
      get(x, y) {
        x = Math.round(x); y = Math.round(y);
        if (x < 0 || y < 0 || x >= W || y >= H) return null;
        const i = (y * W + x) * 4;
        return [data[i], data[i + 1], data[i + 2]];
      },
      blend(x, y, c, t) {
        const old = buf.get(x, y);
        if (old) buf.set(x, y, mixRgb(old, c, t));
      },
      rect(x, y, w, h, c) {
        const col = rgb(c);
        x = Math.round(x); y = Math.round(y);
        for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) put(x + xx, y + yy, col);
      },
      disc(cx, cy, r, c) {
        const col = rgb(c), r2 = r * r + r * 0.6;
        cx = Math.round(cx); cy = Math.round(cy);
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++)
            if (dx * dx + dy * dy <= r2) put(cx + dx, cy + dy, col);
      },
      ellipse(cx, cy, rx, ry, c) {
        const col = rgb(c);
        cx = Math.round(cx); cy = Math.round(cy);
        for (let dy = -ry; dy <= ry; dy++)
          for (let dx = -rx; dx <= rx; dx++)
            if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1.05) put(cx + dx, cy + dy, col);
      },
      line(x0, y0, x1, y1, c) {
        const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
        for (let i = 0; i <= steps; i++) {
          buf.set(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, c);
        }
      },
    };
    return buf;
  }

  /**
   * Draw the garden onto `canvas`.
   * opts: { width, height }  size of the garden box in css px
   *       { bed: {x, y, w, h} }  where the grid frame sits inside it (css px)
   *       { season, phase }
   *       { plot }  "Flowers" | "Root Crops" | "Vegetables/Fruits" - each plot gets its own scenery
   */
  function drawGarden(canvas, opts) {
    const S = SCENE_SCALE;
    const W = Math.max(8, Math.ceil(opts.width / S));
    const H = Math.max(8, Math.ceil(opts.height / S));
    canvas.width = W;
    canvas.height = H;

    const season = SCENE_PAL[opts.season] ? opts.season : "Spring";
    const pal = SCENE_PAL[season];
    const winter = season === "Winter";
    const night = opts.phase === "Night";
    const plot = ["Flowers", "Root Crops", "Vegetables/Fruits", "Market"].includes(opts.plot) ? opts.plot : "Flowers";
    const bed = {
      x: Math.round(opts.bed.x / S), y: Math.round(opts.bed.y / S),
      w: Math.round(opts.bed.w / S), h: Math.round(opts.bed.h / S),
    };
    const bedR = bed.x + bed.w;
    const bedB = bed.y + bed.h;
    const cx = Math.round(bed.x + bed.w / 2);
    const leftMargin = bed.x;
    const rightMargin = W - bedR;
    const bottomSpace = H - bedB;
    const rand = makeRng(20261028);
    const b = makeBuffer(W, H);

    const fenceBot = Math.max(14, bed.y - 9);
    const fenceTop = fenceBot - 11;
    const groundTop = fenceTop - 2;

    /* ----- sky ----- */
    for (let y = 0; y < groundTop; y++) {
      const c = mixRgb(pal.skyTop, pal.skyBot, y / Math.max(1, groundTop - 1));
      for (let x = 0; x < W; x++) b.set(x, y, c);
    }

    /* ----- sun (day only) ----- */
    if (!night) {
      const sx = Math.round(W * 0.84), sy = 12;
      for (let a = 0; a < 8; a++) {
        const ang = (a * Math.PI) / 4;
        b.set(sx + Math.cos(ang) * 9, sy + Math.sin(ang) * 9, "#ffd23f");
        b.set(sx + Math.cos(ang) * 10, sy + Math.sin(ang) * 10, "#ffd23f");
      }
      b.disc(sx, sy, 6, "#ffd23f");
      b.disc(sx, sy, 5, winter ? "#fffbe0" : "#fff3a8");
    }

    /* ----- clouds ----- */
    const cloud = (x, y) => {
      [[0, 0, 3], [4, -1, 4], [8, 0, 3], [12, 1, 2]].forEach(([dx, dy, r]) => b.disc(x + dx, y + dy, r, "#dcefff"));
      [[0, -1, 3], [4, -2, 4], [8, -1, 3], [12, 0, 2]].forEach(([dx, dy, r]) => b.disc(x + dx, y + dy, r, "#ffffff"));
    };
    cloud(Math.round(W * 0.2), 10);
    cloud(Math.round(W * 0.58), 6);
    cloud(Math.round(W * 0.93), 20);

    /* ----- hills ----- */
    for (let x = 0; x < W; x++) {
      const far = Math.round(groundTop - 6 - 4 * Math.sin(x * 0.05 + 0.5) - 2 * Math.sin(x * 0.13));
      for (let y = Math.max(0, far); y < groundTop; y++) b.set(x, y, pal.hillB);
      const near = Math.round(groundTop - 2 - 3 * Math.sin(x * 0.09 + 2) - 1.5 * Math.sin(x * 0.23));
      for (let y = Math.max(0, near); y < groundTop; y++) b.set(x, y, pal.hillA);
    }

    /* ----- grass + tufts ----- */
    for (let y = groundTop; y < H; y++) {
      for (let x = 0; x < W; x++) b.set(x, y, hash2(x, y) < 0.1 ? pal.grassB : pal.grassA);
    }
    for (let y = groundTop + 2; y < H; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (hash2(x + 500, y + 900) < 0.011) {
          b.set(x, y, pal.tuft); b.set(x, y - 1, pal.tuft); b.set(x + 1, y, pal.tuft);
        }
      }
    }

    /* ----- seasonal ground details: flowers / leaves / snow sparkles ----- */
    const flower = (x, y, c) => {
      b.set(x, y, rgb(c).join() === "255,255,255" ? "#ffd23f" : "#ffe88a");
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => b.set(x + dx, y + dy, c));
    };
    for (let by = groundTop + 3; by < H; by += 10) {
      for (let bx = 0; bx < W; bx += 10) {
        if (hash2(bx, by) > 0.38) continue;
        const fx = bx + Math.floor(hash2(bx + 3, by + 1) * 9);
        const fy = by + Math.floor(hash2(bx + 7, by + 5) * 9);
        const c = pal.flowers[Math.floor(hash2(bx + 11, by + 2) * pal.flowers.length)];
        if (winter) {
          b.set(fx, fy, "#ffffff"); b.set(fx + 1, fy + 1, "#a9d3b0");
        } else if (season === "Autumn") {
          b.set(fx, fy, c); b.set(fx + 1, fy, c); b.set(fx, fy + 1, mixRgb(c, "#000000", 0.2));
        } else {
          flower(fx, fy, c);
        }
      }
    }

    /* ----- stone path helper ----- */
    const stonePath = (x0, y0, w, h) => {
      for (let y = 0; y < h; y++) {
        const row = Math.floor(y / 4);
        for (let x = 0; x < w; x++) {
          let c;
          if (x === 0 || x === w - 1) c = "#9c8a6c";
          else if (y % 4 === 3 || (x + (row % 2) * 3) % 6 === 5) c = "#bba98d";
          else c = hash2(x0 + x, y0 + y) < 0.2 ? "#e6dcc8" : "#d8cdb8";
          b.set(x0 + x, y0 + y, winter ? mixRgb(c, "#ffffff", 0.35) : c);
        }
      }
    };

    // gate path (fence -> bed) and front path (bed -> bottom of the garden)
    stonePath(cx - 7, fenceTop + 4, 14, Math.max(1, bed.y - 2 - (fenceTop + 4)));
    if (bottomSpace > 4) stonePath(cx - 7, bedB + 3, 14, H - (bedB + 3));

    /* ----- tilled earth + soft shadow around the raised bed ----- */
    b.rect(bed.x - 1, bed.y + 2, bed.w + 7, bed.h + 5, mixRgb(pal.grassA, "#000000", 0.22));
    for (let y = bed.y - 3; y < bedB + 3; y++) {
      for (let x = bed.x - 3; x < bedR + 3; x++) {
        if (plot === "Market") {            // the market stands on a cobbled plaza instead of tilled earth
          const row = Math.floor((y - bed.y) / 4);
          const mortar = (y - bed.y) % 4 === 3 || (x + (row % 2) * 3) % 6 === 5;
          const stone = mortar ? "#b7ab94" : hash2(x, y) < 0.2 ? "#e9dfca" : "#d8cdb8";
          b.set(x, y, winter ? mixRgb(stone, "#ffffff", 0.35) : stone);
        } else {
          b.set(x, y, hash2(x, y) < 0.25 ? "#a3784a" : "#b58a58");
        }
      }
    }

    /* ----- little trees behind the fence ----- */
    const smallTree = (tx, baseY) => {
      b.rect(tx - 1, baseY - 6, 3, 7, INK_RGB);
      b.rect(tx, baseY - 6, 1, 6, WOOD.deep);
      if (winter) {
        b.line(tx, baseY - 6, tx - 3, baseY - 11, "#7a4b2a");
        b.line(tx, baseY - 6, tx + 3, baseY - 11, "#7a4b2a");
        b.set(tx - 3, baseY - 12, "#ffffff"); b.set(tx + 3, baseY - 12, "#ffffff");
      } else {
        b.disc(tx, baseY - 10, 6, INK_RGB);
        b.disc(tx, baseY - 10, 5, pal.canopyB);
        b.disc(tx - 1, baseY - 12, 3, pal.canopyA);
      }
    };
    smallTree(Math.round(W * 0.06), groundTop + 2);
    smallTree(Math.round(W * 0.95), groundTop + 3);
    if (W > 200) {
      smallTree(Math.round(W * 0.22), groundTop + 1);
      smallTree(Math.round(W * 0.78), groundTop + 1);
    }

    /* ----- wooden fence with a gate opening ----- */
    const gateHalf = 8;
    b.rect(0, fenceTop + 3, W, 2, WOOD.plank);
    b.rect(0, fenceTop + 8, W, 2, WOOD.plank);
    // clear the rails across the gate opening so the path shows through
    for (let y = fenceTop + 3; y < fenceTop + 10; y++) {
      for (let x = cx - gateHalf; x < cx + gateHalf; x++) b.set(x, y, hash2(x, y) < 0.2 ? "#e6dcc8" : "#d8cdb8");
    }
    for (let x = 1; x < W - 2; x += 4) {
      if (Math.abs(x + 1 - cx) < gateHalf) continue;
      b.rect(x, fenceTop + 1, 3, 10, WOOD.mid);
      b.rect(x + 1, fenceTop + 1, 1, 10, WOOD.light);
      b.rect(x + 2, fenceTop + 1, 1, 10, WOOD.dark);
      b.set(x + 1, fenceTop, WOOD.light);
      b.set(x, fenceTop, INK_RGB); b.set(x + 2, fenceTop, INK_RGB);
      b.set(x + 1, fenceTop - 1, INK_RGB);
      b.rect(x, fenceTop + 11, 3, 1, INK_RGB);
      if (winter) { b.set(x + 1, fenceTop - 1, "#ffffff"); b.set(x + 1, fenceTop, "#ffffff"); }
    }
    [cx - gateHalf - 2, cx + gateHalf].forEach((gx) => {
      b.rect(gx - 1, fenceTop - 3, 5, 16, INK_RGB);
      b.rect(gx, fenceTop - 2, 3, 14, WOOD.plank);
      b.rect(gx, fenceTop - 2, 1, 14, WOOD.dark);
      b.disc(gx + 1, fenceTop - 4, 2, INK_RGB);
      b.disc(gx + 1, fenceTop - 4, 1, WOOD.light);
    });

    /* ----- bushes ----- */
    const bushCol = winter ? ["#cfe6da", "#ffffff"] : season === "Autumn" ? ["#c2842f", "#e8a845"] : ["#4aa650", "#7fd568"];
    const bush = (x, y, r) => {
      b.disc(x, y, r + 1, INK_RGB);
      b.disc(x, y, r, bushCol[0]);
      b.disc(x - 1, y - 2, Math.max(1, r - 2), bushCol[1]);
      if (season === "Spring" || season === "Summer") {
        const berry = season === "Spring" ? "#ff8fb8" : "#e53935";
        b.set(x + 2, y + 1, berry); b.set(x - 2, y + 2, berry); b.set(x + 1, y - 2, berry);
      }
    };

    /* ----- big tree (right side) ----- */
    const bigTree = (tx, baseY) => {
      b.rect(tx - 3, baseY - 15, 7, 16, INK_RGB);
      b.rect(tx - 2, baseY - 15, 5, 15, WOOD.deep);
      b.rect(tx - 2, baseY - 15, 1, 15, "#9a6238");
      b.rect(tx - 4, baseY - 1, 9, 2, INK_RGB);
      b.rect(tx - 3, baseY - 1, 7, 1, WOOD.deep);
      const cy = baseY - 25;
      const blobs = [[0, 0, 10], [-8, 4, 7], [8, 4, 7], [-3, -6, 6], [5, -5, 6]];
      if (!winter) {
        blobs.forEach(([dx, dy, r]) => b.disc(tx + dx, cy + dy, r + 1, INK_RGB));
        blobs.forEach(([dx, dy, r]) => b.disc(tx + dx, cy + dy, r, pal.canopyB));
        blobs.forEach(([dx, dy, r]) => b.disc(tx + dx - 1, cy + dy - 2, Math.max(2, r - 3), pal.canopyA));
        const inside = (px, py) => blobs.some(([dx, dy, r]) => (px - tx - dx) ** 2 + (py - cy - dy) ** 2 <= r * r - 2);
        for (let i = 0; i < 40; i++) {
          const px = tx - 16 + Math.floor(hash2(i * 7 + 1, tx) * 32);
          const py = cy - 14 + Math.floor(hash2(i * 13 + 5, cy) * 28);
          if (!inside(px, py)) continue;
          b.set(px, py, season === "Summer" && i % 6 === 0 ? "#e53935" : pal.canopyC);
        }
        if (plot === "Vegetables/Fruits") {
          // the fruit plot's tree bears fruit (blossom in spring, apples after)
          const fruit = season === "Spring" ? "#ffffff" : season === "Summer" ? "#e53935" : "#ff7043";
          for (let i = 0; i < 10; i++) {
            const px = tx - 14 + Math.floor(hash2(i * 17 + 3, tx + 9) * 28);
            const py = cy - 12 + Math.floor(hash2(i * 11 + 7, cy + 4) * 24);
            if (!inside(px, py)) continue;
            b.rect(px, py, 2, 2, fruit);
            b.set(px, py, mixRgb(fruit, "#ffffff", 0.5));
          }
        }
      } else {
        [[-9, -8], [9, -8], [-4, -14], [4, -14], [0, -17]].forEach(([dx, dy]) => {
          b.line(tx, baseY - 14, tx + dx, cy + dy + 8, INK_RGB);
          b.line(tx + (dx > 0 ? 1 : -1), baseY - 14, tx + dx + (dx > 0 ? 1 : -1), cy + dy + 8, WOOD.deep);
          b.rect(tx + dx - 1, cy + dy + 7, 3, 1, "#ffffff");
        });
      }
    };

    /* ----- shed (left side) ----- */
    let shedWin = null;
    const shed = (sx, baseY) => {
      const wallW = 22, wallH = 13, x0 = sx - 11, wallTop = baseY - wallH;
      for (let i = 0; i < 8; i++) {
        const y = wallTop - 1 - i, left = x0 - 3 + i, right = x0 + wallW + 2 - i;
        b.rect(left - 1, y, right - left + 3, 1, INK_RGB);
      }
      b.rect(x0 + 4, wallTop - 9, wallW - 6, 1, INK_RGB);
      for (let i = 0; i < 8; i++) {
        const y = wallTop - 1 - i, left = x0 - 3 + i, right = x0 + wallW + 2 - i;
        for (let x = left; x <= right; x++) {
          b.set(x, y, (x + i) % 4 === 0 ? "#e8716c" : "#d9534f");
        }
        if (winter && i > 3) b.rect(left, y, right - left + 1, 1, "#ffffff");
      }
      b.rect(x0 - 1, wallTop - 1, wallW + 2, wallH + 2, INK_RGB);
      b.rect(x0, wallTop, wallW, wallH, WOOD.plank);
      for (let x = 3; x < wallW; x += 4) b.rect(x0 + x, wallTop, 1, wallH, "#a9703f");
      b.rect(x0 + 13, wallTop + 3, 7, 10, INK_RGB);
      b.rect(x0 + 14, wallTop + 4, 5, 9, WOOD.deep);
      b.set(x0 + 17, wallTop + 9, "#ffd23f");
      b.rect(x0 + 2, wallTop + 2, 8, 7, INK_RGB);
      b.rect(x0 + 3, wallTop + 3, 6, 5, "#cfeaff");
      b.rect(x0 + 5, wallTop + 3, 1, 5, WOOD.plank);
      b.rect(x0 + 3, wallTop + 5, 6, 1, WOOD.plank);
      shedWin = { x: x0 + 3, y: wallTop + 3, w: 6, h: 5 };
    };

    if (rightMargin >= 28) bigTree(Math.round(bedR + rightMargin / 2), bed.y + 46);
    if (leftMargin >= 30) shed(Math.round(leftMargin / 2), bed.y + 62);
    if (leftMargin >= 30) bush(Math.round(leftMargin / 2) + 15, bed.y + 66, 4);
    if (rightMargin >= 28) bush(Math.round(bedR + rightMargin / 2) - 6, bed.y + 76, 4);

    /* ----- pond (bottom left) ----- */
    if (bottomSpace >= 18 && W >= 150) {   // (skipped on narrow phones, where the characters need the room)
      const px = Math.round(W * 0.2); // a little further left so the gardener has room beside the path
      const py = Math.round(bedB + bottomSpace * 0.55);
      const rx = 15;
      const ry = Math.max(5, Math.min(9, Math.floor(bottomSpace * 0.3)));
      b.ellipse(px, py, rx + 2, ry + 2, INK_RGB);
      b.ellipse(px, py, rx, ry, winter ? "#cfeaff" : "#6ec3f0");
      b.ellipse(px - 3, py - 1, rx - 6, Math.max(2, ry - 3), winter ? "#e8f6ff" : "#8fd5f7");
      b.set(px - 6, py - 1, "#ffffff"); b.set(px - 5, py - 1, "#ffffff"); b.set(px + 4, py + 1, "#ffffff");
      if (winter) {
        b.line(px - 8, py + 1, px - 2, py - 2, "#ffffff"); b.line(px + 2, py + 2, px + 8, py - 1, "#ffffff");
      } else {
        b.disc(px + 6, py, 2, INK_RGB); b.disc(px + 6, py, 1, "#4caf50");
        b.set(px + 6, py - 1, season === "Autumn" ? "#f7c548" : "#ff8fb8");
        b.disc(px - 8, py + 2, 1, "#4caf50");
      }
      for (let i = 0; i < 9; i++) {
        const ang = (i / 9) * Math.PI * 2;
        const rxp = px + Math.round(Math.cos(ang) * (rx + 2));
        const ryp = py + Math.round(Math.sin(ang) * (ry + 2));
        b.disc(rxp, ryp, 1, INK_RGB);
        b.set(rxp, ryp, "#b9b2c4");
      }
    }

    /* ----- bushes bottom right ----- */
    if (bottomSpace >= 18 && W >= 150) {
      bush(Math.round(W * 0.8), Math.round(bedB + bottomSpace * 0.55), 5);
      bush(Math.round(W * 0.8) + 9, Math.round(bedB + bottomSpace * 0.55) + 3, 4);
    }

    /* ----- side fences (the garden is enclosed on three sides) ----- */
    for (let y = fenceBot + 2; y < H - 2; y += 4) {
      [0, W - 4].forEach((x) => {
        b.rect(x, y, 4, 4, INK_RGB);
        b.rect(x, y, 3, 3, WOOD.mid);
        b.set(x + 1, y, WOOD.light);
        if (winter) b.rect(x, y, 3, 1, "#ffffff");
      });
    }

    /* ----- per-plot scenery: each plot has its own corner of the garden ----- */
    const lc = Math.round(leftMargin / 2);
    const rc = Math.round(bedR + rightMargin / 2);
    const yM = bed.y + 124;   // base line of the middle row of props
    const yL = bed.y + 160;   // base line of the lower row of props
    const roomL = leftMargin >= 30, roomR = rightMargin >= 28, tall = bed.h >= 150;
    const boxed = (x, y, w, h, c) => { b.rect(x - 1, y - 1, w + 2, h + 2, INK_RGB); b.rect(x, y, w, h, c); };
    const snow = (x, y, w) => { if (winter) b.rect(x, y, w, 1, "#ffffff"); };

    const patch = (x0, x1, y0, y1, n, seed) => {          // a patch of flowers (or frosted stalks)
      const spots = [];
      for (let i = 0; i < n; i++) {
        spots.push([
          Math.round(x0 + hash2(i * 5 + seed, 17) * (x1 - x0)),
          Math.round(y0 + hash2(i * 7 + seed, 29) * (y1 - y0)),
          pal.flowers[Math.floor(hash2(i * 3 + seed, 41) * pal.flowers.length)],
        ]);
      }
      spots.sort((p, q) => p[1] - q[1]).forEach(([x, y, c]) => {
        b.set(x, y, winter ? "#9db7cf" : "#3f9a4a"); b.set(x, y + 1, winter ? "#9db7cf" : "#3f9a4a");
        b.set(x + 1, y + 1, winter ? "#c5d8e6" : "#5fbf5f");
        if (winter) { b.set(x, y - 1, "#ffffff"); b.set(x - 1, y - 1, "#ffffff"); } else flower(x, y - 2, c);
      });
    };
    const bench = (x, y) => {
      boxed(x - 9, y - 9, 2, 4, WOOD.deep); boxed(x + 7, y - 9, 2, 4, WOOD.deep);   // back supports
      boxed(x - 11, y - 12, 22, 3, WOOD.plank);                                      // back rest
      boxed(x - 10, y - 4, 2, 5, WOOD.deep); boxed(x + 8, y - 4, 2, 5, WOOD.deep);  // legs
      boxed(x - 11, y - 6, 22, 3, WOOD.mid);                                         // seat
      b.rect(x - 10, y - 5, 20, 1, WOOD.light);
      snow(x - 11, y - 7, 22); snow(x - 11, y - 13, 22);
    };
    const birdbath = (x, y) => {
      boxed(x - 4, y - 2, 8, 2, "#b9b2c4"); boxed(x - 1, y - 10, 3, 8, "#cfc9da");
      b.ellipse(x, y - 12, 8, 3, INK_RGB); b.ellipse(x, y - 12, 7, 2, "#d9d3e3");
      b.ellipse(x, y - 12, 5, 1, winter ? "#e8f6ff" : "#8fd5f7");
      b.set(x - 2, y - 12, "#ffffff");
      snow(x - 6, y - 14, 12);
    };
    const scarecrow = (x, y) => {
      boxed(x - 1, y - 24, 2, 24, WOOD.deep);                                        // pole
      boxed(x - 9, y - 17, 18, 2, WOOD.deep);                                        // arms
      boxed(x - 4, y - 18, 8, 8, "#d9534f");                                         // shirt
      b.rect(x - 4, y - 14, 8, 1, "#b8403e"); b.rect(x - 1, y - 18, 1, 8, "#b8403e");
      [[-10, -16], [10, -16], [-3, -9], [3, -9], [0, -9]].forEach(([dx, dy]) => b.set(x + dx, y + dy, "#f2cf6a"));
      b.disc(x, y - 22, 4, INK_RGB); b.disc(x, y - 22, 3, "#e8c98f");                // head
      b.set(x - 1, y - 23, INK_RGB); b.set(x + 1, y - 23, INK_RGB);
      b.rect(x - 1, y - 21, 3, 1, INK_RGB);
      boxed(x - 6, y - 27, 12, 2, WOOD.deep); boxed(x - 3, y - 32, 6, 5, "#8b5a3c"); // hat
      snow(x - 3, y - 33, 6);
    };
    const hay = (x, y) => {
      boxed(x - 10, y - 8, 10, 8, "#f2cf6a"); boxed(x + 1, y - 8, 10, 8, "#f2cf6a");
      boxed(x - 5, y - 15, 10, 7, "#f2cf6a");
      [[x - 10, y - 5], [x + 1, y - 5], [x - 5, y - 12]].forEach(([hx, hy]) => b.rect(hx, hy, 10, 1, "#d9a93b"));
      [[x - 7, y - 8], [x + 4, y - 8], [x - 2, y - 15]].forEach(([hx, hy]) => b.rect(hx, hy, 1, hy > y - 10 ? 8 : 7, "#8b5a3c"));
      snow(x - 5, y - 16, 10);
    };
    const wheelbarrow = (x, y, load) => {
      b.line(x - 9, y - 8, x - 15, y - 3, INK_RGB); b.line(x - 9, y - 9, x - 15, y - 4, WOOD.plank);   // handles
      boxed(x - 6, y - 5, 2, 5, WOOD.deep);                                                              // leg
      boxed(x - 9, y - 10, 16, 5, "#d9534f"); b.rect(x - 9, y - 10, 16, 1, "#f08a84");                   // tray
      load.forEach((c, i) => { b.disc(x - 6 + i * 3, y - 11, 2, INK_RGB); b.disc(x - 6 + i * 3, y - 11, 1, c); });
      b.disc(x + 9, y - 2, 3, INK_RGB); b.disc(x + 9, y - 2, 1, "#c9c2d4");                               // wheel
      snow(x - 9, y - 11, 16);
    };
    const crates = (x, y) => {
      boxed(x - 7, y - 8, 14, 8, WOOD.plank); b.rect(x - 7, y - 5, 14, 1, "#a9703f");
      [[-3, "#e53935"], [2, "#e53935"], [-1, "#7fd568"]].forEach(([dx, c], i) => {
        const cy2 = i === 2 ? y - 12 : y - 10;
        b.disc(x + dx, cy2, 2, INK_RGB); b.disc(x + dx, cy2, 1, c);
      });
      boxed(x + 8, y - 6, 10, 6, WOOD.mid); b.rect(x + 8, y - 3, 10, 1, WOOD.dark);
      b.disc(x + 13, y - 8, 2, INK_RGB); b.disc(x + 13, y - 8, 1, "#ff9800");
      snow(x - 7, y - 9, 14);
    };
    const rocks = (x, y) => {
      b.ellipse(x, y - 2, 6, 4, INK_RGB); b.ellipse(x, y - 2, 5, 3, "#b9b2c4"); b.set(x - 2, y - 3, "#e6e1ee");
      b.ellipse(x + 8, y - 1, 4, 3, INK_RGB); b.ellipse(x + 8, y - 1, 3, 2, "#a9a2b6");
      snow(x - 3, y - 5, 6);
    };
    const cabbage = (x, y) => {
      b.disc(x, y, 4, INK_RGB); b.disc(x, y, 3, "#cdeb8b");
      b.line(x - 2, y + 1, x + 2, y + 1, "#8fc65a"); b.line(x, y - 2, x, y + 2, "#8fc65a");
      b.set(x - 1, y - 2, "#f1ffd0");
    };
    const pumpkin = (x, y) => {
      b.ellipse(x, y - 3, 5, 4, INK_RGB); b.ellipse(x, y - 3, 4, 3, "#f58a3c"); b.rect(x, y - 6, 1, 3, "#e0701f");
      b.set(x, y - 7, "#4a9e38"); b.set(x + 1, y - 8, "#4a9e38");
    };
    const stall = (x, y, color, goods) => {                 // a market stall with a striped awning
      boxed(x - 12, y - 24, 2, 24, WOOD.deep); boxed(x + 10, y - 24, 2, 24, WOOD.deep);         // posts
      boxed(x - 11, y - 8, 22, 8, WOOD.plank); b.rect(x - 11, y - 5, 22, 1, "#a9703f");          // counter
      for (let i = 0; i < 24; i += 4) b.rect(x - 12 + i, y - 25, 4, 8, i % 8 === 0 ? color : "#ffffff");
      b.rect(x - 12, y - 26, 24, 1, INK_RGB); b.rect(x - 12, y - 17, 24, 1, INK_RGB);
      goods.forEach((c, i) => { b.disc(x - 7 + i * 6, y - 10, 2, INK_RGB); b.disc(x - 7 + i * 6, y - 10, 1, c); });
      snow(x - 12, y - 27, 24);
    };
    const barrel = (x, y) => {
      boxed(x - 4, y - 9, 9, 9, WOOD.plank);
      b.rect(x - 4, y - 7, 9, 1, WOOD.deep); b.rect(x - 4, y - 3, 9, 1, WOOD.deep);
      snow(x - 4, y - 10, 9);
    };
    const signpost = (x, y, kind) => {                      // tells you which plot you're looking at
      boxed(x - 1, y - 14, 3, 14, WOOD.deep);
      boxed(x - 7, y - 22, 14, 9, WOOD.light);
      if (kind === "Flowers") flower(x, y - 18, "#ff8fb8");
      else if (kind === "Market") { b.disc(x, y - 17, 3, INK_RGB); b.disc(x, y - 17, 2, "#ffd23f"); b.set(x, y - 17, "#d99a00"); }
      else if (kind === "Root Crops") { b.line(x - 2, y - 20, x + 2, y - 16, "#f58a3c"); b.set(x - 3, y - 21, "#4caf50"); b.set(x - 2, y - 21, "#4caf50"); }
      else { b.disc(x, y - 17, 2, "#e53935"); b.set(x, y - 20, "#4caf50"); }
      snow(x - 7, y - 23, 14);
    };

    if (tall && roomL) {
      if (plot === "Market") {
        stall(lc, yM, "#e8716c", ["#e53935", "#ff9800", "#9be564"]);
        barrel(lc - 6, yL); barrel(lc + 6, yL);
      } else if (plot === "Flowers") {
        bench(lc, yM);
        patch(lc - 17, lc + 17, yL - 10, yL, 9, 1);
        patch(lc - 14, lc + 14, bed.y + 66, bed.y + 74, 5, 2);
      } else if (plot === "Root Crops") {
        scarecrow(lc, yM);
        hay(lc, yL);
      } else {
        crates(lc - 4, yM);
        bush(lc - 8, yL, 5);
        bush(lc + 8, yL - 1, 4);
      }
    }
    if (tall && roomR) {
      if (plot === "Market") {
        stall(rc, yM, "#5b9bd5", ["#ffd23f", "#9b6bd6", "#f58a3c"]);
        crates(rc, yL);
      } else if (plot === "Flowers") {
        birdbath(rc, yM);
        patch(rc - 18, rc + 18, yL - 12, yL, 11, 3);
        patch(rc - 14, rc + 14, bed.y + 49, bed.y + 56, 6, 4);
      } else if (plot === "Root Crops") {
        wheelbarrow(rc, yM, ["#f58a3c", "#f58a3c", "#d6a45a", "#f58a3c"]);
        rocks(rc - 4, yL);
      } else {
        [[-10, 0], [0, 3], [9, 0]].forEach(([dx, dy]) => cabbage(rc + dx, yM + dy - 8));
        if (season === "Autumn" || season === "Summer") { pumpkin(rc - 7, yM + 6); pumpkin(rc + 8, yM + 7); }
        wheelbarrow(rc, yL, ["#e53935", "#ff7043", "#e53935", "#ff7043"]);
      }
    }
    if (tall && bed.x >= 12) signpost(bed.x - 9, bed.y + 24, plot);

    /* ----- seasonal particles ----- */
    if (season === "Spring") {
      for (let i = 0; i < 22; i++) {
        const x = Math.floor(rand() * W), y = Math.floor(rand() * H);
        b.set(x, y, "#ffc0d9"); b.set(x + 1, y, "#ff8fb8");
      }
    } else if (season === "Summer") {
      ["#ff8fb8", "#ffd23f", "#ffffff", "#c9a7ff"].forEach((c) => {
        const x = 4 + Math.floor(rand() * (W - 8));
        const y = groundTop + 8 + Math.floor(rand() * Math.max(1, H - groundTop - 16));
        b.set(x - 1, y - 1, c); b.set(x + 1, y - 1, c); b.set(x - 1, y, c); b.set(x + 1, y, c);
        b.set(x, y, INK_RGB); b.set(x, y + 1, INK_RGB);
      });
    } else if (season === "Autumn") {
      const leafCols = ["#f58a3c", "#d9622b", "#f7c548"];
      for (let i = 0; i < 16; i++) {
        const x = Math.floor(rand() * W), y = Math.floor(rand() * H);
        b.rect(x, y, 2, 2, leafCols[i % 3]);
      }
    } else {
      for (let i = 0; i < 80; i++) b.set(Math.floor(rand() * W), Math.floor(rand() * H), "#ffffff");
      for (let i = 0; i < 14; i++) {
        const x = 1 + Math.floor(rand() * (W - 2)), y = 1 + Math.floor(rand() * (H - 2));
        b.set(x, y, "#ffffff"); b.set(x - 1, y, "#ffffff"); b.set(x + 1, y, "#ffffff");
        b.set(x, y - 1, "#ffffff"); b.set(x, y + 1, "#ffffff");
      }
    }

    /* ----- night: darken everything, then add the moon, stars, fireflies, window glow ----- */
    if (night) {
      const d = b.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = d[i] * 0.42 + 18;
        d[i + 1] = d[i + 1] * 0.46 + 24;
        d[i + 2] = d[i + 2] * 0.66 + 66;
      }
      for (let i = 0; i < 50; i++) {
        const x = Math.floor(rand() * W), y = Math.floor(rand() * Math.max(1, groundTop - 3));
        b.set(x, y, i % 5 === 0 ? "#ffe9a8" : "#ffffff");
        if (i % 9 === 0) { b.set(x + 1, y, "#ffffff"); b.set(x, y + 1, "#ffffff"); }
      }
      const mx = Math.round(W * 0.84), my = 13;
      const sky = b.get(mx - 9, my) || [40, 40, 90];
      b.disc(mx, my, 7, "#fff6c8");
      b.disc(mx + 4, my - 2, 6, sky);
      if (shedWin) b.rect(shedWin.x, shedWin.y, shedWin.w, shedWin.h, "#ffe27a");
      for (let i = 0; i < 14; i++) {
        const x = 3 + Math.floor(rand() * (W - 6));
        const y = groundTop + 6 + Math.floor(rand() * Math.max(1, H - groundTop - 10));
        b.blend(x - 1, y, "#fff3a8", 0.3); b.blend(x + 1, y, "#fff3a8", 0.3);
        b.blend(x, y - 1, "#fff3a8", 0.3); b.blend(x, y + 1, "#fff3a8", 0.3);
        b.set(x, y, "#fff3a8");
      }
    }

    canvas.getContext("2d").putImageData(new ImageData(b.data, W, H), 0, 0);
  }

  /* ---------- 7b. Item icons (hotbar, backpack, shop, HUD) ---------- */
  const coinRows = () => {
    const rows = [];
    for (let y = 0; y < 12; y++) {
      let r = "";
      for (let x = 0; x < 12; x++) {
        const d = Math.hypot(x - 5.5, y - 5.5);
        r += d > 5.4 ? "." : d > 4.3 ? "q" : "y";
      }
      rows.push(r);
    }
    [[3, 3], [4, 3], [3, 4]].forEach(([x, y]) => (rows[y] = rows[y].slice(0, x) + "w" + rows[y].slice(x + 1)));
    for (let y = 3; y <= 8; y++) rows[y] = rows[y].slice(0, 5) + "qq" + rows[y].slice(7);   // the coin's slot
    return rows;
  };

  const ICONS = {
    coin: normalize(coinRows()),
    shears: normalize([
      "..s.....s...",
      "..ss...ss...",
      "...ss.ss....",
      "....sss.....",
      ".....t......",
      "....ttt.....",
      "...tt.tt....",
      "..rr...rr...",
      ".rrrr.rrrr..",
      ".r..r.r..r..",
      ".rrrr.rrrr..",
      "............",
    ]),
    can: normalize([
      "............",
      "..........ss",
      "..........st",
      ".........tt.",
      "..uuuuu.tt..",
      ".uuiuuuutt..",
      ".uuiuuuut...",
      "uu.iuuuuu...",
      "u..uuuuuu...",
      "uu.uuuuuu...",
      ".uuuuuuuu...",
      "............",
    ]),
    energy: normalize([
      ".....yyy....",
      "....yyy.....",
      "...yyy......",
      "..yyyyyy....",
      ".....yyy....",
      "....yy......",
      "...yy.......",
      "..y.........",
    ]),
    drop: normalize([
      ".....u......",
      "....uu......",
      "...uuuu.....",
      "..uuuuuu....",
      "..uiuuuu....",
      "..uiuuuu....",
      "...uuuu.....",
    ]),
  };

  const SEED_PACKET = normalize([
    "............",
    ".nnnnnnnnnn.",
    ".nccccccccn.",
    ".nccclccccn.",
    ".ncclGlcccn.",
    ".nccccGcccn.",
    ".nwwwwwwwwn.",
    ".nwkkwkkwwn.",
    ".nwwwwwwwwn.",
    ".nwkkkkkwwn.",
    ".nnnnnnnnnn.",
    "............",
  ]);

  /** Draw any item by id: tools, "coin", "energy", "drop", "<crop>-seed" packets, or a harvested crop. */
  function drawItem(canvas, id) {
    if (ICONS[id]) return drawSprite(canvas, ICONS[id], true);
    if (id.endsWith("-seed")) {
      const crop = id.slice(0, -5);
      return drawSprite(canvas, SEED_PACKET, true, { c: CROP_COLORS[crop] || "#ff9800" });
    }
    if (CROP_PLOTS[id]) return drawCell(canvas, CROP_PLOTS[id], 3, id);
    return drawSprite(canvas, EMPTY, false);
  }

  /* ---------- 7d. Map icons (small symbols on the clickable places of the world map) ---------- */
  const MAP_ICONS = {
    meadow: normalize([
      "....pppp....",
      "..pppppppp..",
      "..ppyyyypp..",
      "..ppyqqypp..",
      "..ppyyyypp..",
      "..pppppppp..",
      "....pppp.g..",
      ".....gg.ggg.",
      "......gg.g..",
      "......gg....",
      "......gg....",
    ]),
    roots: normalize([
      "....g..g....",
      ".....ggg.g..",
      "....gggg....",
      "...oooooo...",
      "...oooooo...",
      "....oooo....",
      "....oooo....",
      ".....oo.....",
      ".....oo.....",
      "......o.....",
    ]),
    orchard: normalize([
      "...GGGGGG...",
      "..GGrGGGGG..",
      ".GGGGGGGrGG.",
      ".GrGGGGGGGG.",
      ".GGGGGrGGGG.",
      "..GGGGGGGG..",
      ".....bb.....",
      ".....bb.....",
      ".....bb.....",
      "....bbbb....",
    ]),
    market: normalize([
      "............",
      ".rwrwrwrwrw.",
      ".rwrwrwrwrw.",
      "rrrrrrrrrrrr",
      ".b........b.",
      ".b..yyy...b.",
      ".b.yqqqy..b.",
      ".b..yyy...b.",
      ".bbbbbbbbbb.",
      ".bbbbbbbbbb.",
    ]),
  };

  /** Draw the symbol for a place on the world map: "meadow", "roots", "orchard" or "market". */
  function drawMapIcon(canvas, placeId) {
    return drawSprite(canvas, MAP_ICONS[placeId] || EMPTY, true);
  }

  /* ---------- 7c. World map (the picture behind the clickable places) ---------- */
  /**
   * Paint a little storybook map: grass, a river, trees, winding roads and a plaza for each place.
   * o: { width, height }   size in map pixels
   *    { nodes: [{id, x, y}] }  places, in map pixels
   *    { roads: [[idA, idB]] }  roads between places
   *    { route: [id, id, ...] } a route to highlight (optional)
   *    { season, phase }
   */
  function drawWorldMap(canvas, o) {
    const W = Math.max(60, Math.round(o.width)), H = Math.max(40, Math.round(o.height));
    canvas.width = W;
    canvas.height = H;
    const season = SCENE_PAL[o.season] ? o.season : "Spring";
    const pal = SCENE_PAL[season];
    const winter = season === "Winter";
    const night = o.phase === "Night";
    const b = makeBuffer(W, H);
    const rand = makeRng(777);
    const nodes = o.nodes || [];
    const byId = {};
    nodes.forEach((n) => (byId[n.id] = n));

    /* ground */
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        b.set(x, y, hash2(x, y) < 0.12 ? pal.grassB : pal.grassA);
        if (((x >> 4) + (y >> 4)) % 2 === 0) b.blend(x, y, "#ffffff", 0.06);
      }
    }
    for (let y = 6; y < H - 6; y++) {
      for (let x = 6; x < W - 6; x++) {
        if (hash2(x + 31, y + 17) < 0.012) { b.set(x, y, pal.tuft); b.set(x, y - 1, pal.tuft); }
      }
    }

    /* river down the middle */
    const riverX = (y) => W * 0.5 + 11 * Math.sin(y * 0.055 + 0.8) + 4 * Math.sin(y * 0.13);
    const riverW = (y) => 4 + Math.round(1.5 * Math.sin(y * 0.09 + 2));
    for (let y = 0; y < H; y++) {
      const cx = Math.round(riverX(y)), w = riverW(y);
      for (let x = cx - w - 1; x <= cx + w + 1; x++) {
        const edge = x === cx - w - 1 || x === cx + w + 1;
        b.set(x, y, edge ? (winter ? "#b8d3e6" : "#4a9ccf") : winter ? "#dff1ff" : hash2(x, y) < 0.08 ? "#a8def8" : "#6ec3f0");
      }
    }

    /* roads: gentle curves between places */
    const roadPoints = (o.roads || []).map(([a, c], idx) => {
      const A = byId[a], B = byId[c];
      if (!A || !B) return null;
      const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1;
      const wob = (hash2(idx * 31 + 5, 9) - 0.5) * 18;
      const qx = (A.x + B.x) / 2 - (dy / len) * wob, qy = (A.y + B.y) / 2 + (dx / len) * wob;
      const steps = Math.ceil(len * 1.2), pts = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, u = 1 - t;
        pts.push([u * u * A.x + 2 * u * t * qx + t * t * B.x, u * u * A.y + 2 * u * t * qy + t * t * B.y]);
      }
      return { a, c, pts };
    }).filter(Boolean);

    /* trees (kept clear of the river, roads and places) */
    const farFromRoads = (x, y, r) => roadPoints.every(({ pts }) => pts.every(([px, py]) => Math.hypot(px - x, py - y) > r));
    const farFromNodes = (x, y, r) => nodes.every((n) => Math.hypot(n.x - x, n.y - y) > r);
    let placed = 0;
    for (let tries = 0; tries < 400 && placed < 30; tries++) {
      const x = 9 + Math.floor(rand() * (W - 18)), y = 10 + Math.floor(rand() * (H - 20));
      if (Math.abs(x - riverX(y)) < riverW(y) + 6 || !farFromNodes(x, y, 17) || !farFromRoads(x, y, 7)) continue;
      placed++;
      b.rect(x, y, 1, 3, INK_RGB);
      if (winter) {
        b.line(x, y, x - 2, y - 4, "#7a4b2a"); b.line(x, y, x + 2, y - 4, "#7a4b2a"); b.set(x, y - 4, "#ffffff");
      } else {
        b.disc(x, y - 3, 4, INK_RGB); b.disc(x, y - 3, 3, pal.canopyB); b.disc(x - 1, y - 4, 2, pal.canopyA);
      }
    }
    if (!winter) {
      for (let i = 0; i < 60; i++) {
        const x = 8 + Math.floor(rand() * (W - 16)), y = 8 + Math.floor(rand() * (H - 16));
        if (Math.abs(x - riverX(y)) < riverW(y) + 3) continue;
        b.set(x, y, pal.flowers[i % pal.flowers.length]);
      }
    }

    /* roads (they become wooden bridges where they cross the river) */
    const isWater = (c) => c && c[2] > c[0] + 40 && c[2] > 150;
    const roadDisc = (x, y, r, dark) => {
      const cx = Math.round(x), cy = Math.round(y);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r + 1) continue;
          const bridge = isWater(b.get(cx + dx, cy + dy));
          const c = bridge ? (dark ? "#7a4b2a" : "#e8c98f") : winter ? (dark ? "#c6dcee" : "#f4faff") : dark ? "#b89a63" : "#ecd9a8";
          b.set(cx + dx, cy + dy, c);
        }
      }
    };
    roadPoints.forEach(({ pts }) => pts.forEach(([x, y]) => roadDisc(x, y, 2, true)));
    roadPoints.forEach(({ pts }) => pts.forEach(([x, y]) => roadDisc(x, y, 1, false)));

    /* highlighted route */
    const route = o.route || [];
    for (let i = 0; i + 1 < route.length; i++) {
      const road = roadPoints.find((r) => (r.a === route[i] && r.c === route[i + 1]) || (r.a === route[i + 1] && r.c === route[i]));
      if (!road) continue;
      road.pts.forEach(([x, y], k) => {
        if (Math.floor(k / 3) % 2 === 0) { b.disc(x, y, 1, INK_RGB); b.set(x, y, "#ff6fa5"); }
      });
    }

    /* a stone plaza under every place */
    nodes.forEach((n) => {
      b.ellipse(n.x, n.y + 2, 12, 9, INK_RGB);
      b.ellipse(n.x, n.y + 2, 11, 8, winter ? "#f4faff" : "#f0dcae");
      for (let i = 0; i < 14; i++) {
        const sx = n.x - 9 + Math.floor(hash2(n.x + i, n.y) * 18), sy = n.y - 4 + Math.floor(hash2(n.y + i, n.x) * 14);
        if (((sx - n.x) / 10) ** 2 + ((sy - n.y - 2) / 7) ** 2 < 0.8) b.set(sx, sy, winter ? "#c6dcee" : "#d9c28f");
      }
    });

    /* compass */
    const ccx = W - 17, ccy = H - 16;
    b.disc(ccx, ccy, 7, INK_RGB); b.disc(ccx, ccy, 6, "#f3dfb2");
    b.line(ccx, ccy - 5, ccx, ccy + 5, INK_RGB); b.line(ccx - 5, ccy, ccx + 5, ccy, INK_RGB);
    b.disc(ccx, ccy - 3, 1, "#e53935");

    /* parchment frame */
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const d = Math.min(x, y, W - 1 - x, H - 1 - y);
        if (d === 0) b.set(x, y, INK_RGB);
        else if (d <= 3) b.set(x, y, "#f3dfb2");
        else if (d === 4) b.set(x, y, "#c9a86a");
      }
    }

    if (night) {
      const d = b.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = d[i] * 0.5 + 14; d[i + 1] = d[i + 1] * 0.54 + 20; d[i + 2] = d[i + 2] * 0.72 + 56;
      }
    }
    canvas.getContext("2d").putImageData(new ImageData(b.data, W, H), 0, 0);
  }

  /* ---------- 8. Little animated critters (used by the effects layer) ---------- */
  // A 2-frame butterfly (wings open / wings shut) as a data URL, so CSS can flap it with steps().
  const butterflyCache = {};
  function butterflyURL(color) {
    if (butterflyCache[color]) return butterflyCache[color];
    const c = document.createElement("canvas");
    c.width = 14; c.height = 4;
    const g = c.getContext("2d");
    const open = ["oo.k.oo", "owokowo", "oo.k.oo", ".o.k.o."];
    const shut = ["...k...", "..oko..", "..oko..", "...k..."];
    [open, shut].forEach((rows, f) =>
      rows.forEach((row, y) =>
        [...row].forEach((ch, x) => {
          if (ch === ".") return;
          g.fillStyle = ch === "k" ? OUTLINE : ch === "w" ? "#ffffff" : color;
          g.fillRect(f * 7 + x, y, 1, 1);
        })
      )
    );
    return (butterflyCache[color] = c.toDataURL());
  }

  return {
    SPRITE_SIZE, CANVAS_SIZE, PALETTE, SPRITES, CHARACTERS,
    getSprite, drawSprite, drawCell,
    getCharacter, createFace, createBody,
    drawGarden, SCENE_SCALE, butterflyURL,
    CROP_TINTS, CROP_PLOTS, CROP_COLORS, drawItem, drawWorldMap, drawMapIcon,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = PixelArt;
}
