// node test.js — checks the layout math (the KWin part needs a live session)
const assert = require("assert");
const { slotRects, spiralRects, dwindleSync, dwindleRatios, dwindleRects, centeredRects, clampRatio, pickNeighbor, swapOrder, rotateOrder, placeInSlots, appTiles, toggleApp, migrateApps, settingsChanged, confirmWrite, draggedRatio, TERMINALS } = require("./package/contents/code/main.js");

assert.deepStrictEqual(slotRects(1, 0.55), [{ x: 0, y: 0, width: 1, height: 1 }]);
const two = slotRects(2, 0.55);
assert.strictEqual(two.length, 2);
assert.strictEqual(two[0].width + two[1].width, 1);
const four = slotRects(4, 0.6);
assert.strictEqual(four.length, 4);
four.slice(1).forEach((r, i) => {
    assert.strictEqual(r.x, 0.6);
    assert.ok(Math.abs(r.y - i / 3) < 1e-9 && Math.abs(r.height - 1 / 3) < 1e-9);
});
assert.strictEqual(clampRatio("0.7"), 0.7);
assert.strictEqual(clampRatio(0.99), 0.55);
assert.strictEqual(clampRatio("junk"), 0.55);
// spiral: left, top-right, then the rest of the bottom-right split left/right
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + " != " + b);
const sp = spiralRects(4, 0.5);
[[0, 0, .5, 1], [.5, 0, .5, .5], [.75, .5, .25, .5], [.5, .5, .25, .5]].forEach((e, i) =>
    ["x", "y", "width", "height"].forEach((f, j) => near(sp[i][f], e[j])));
assert.strictEqual(spiralRects(1, 0.5).length, 1);
const area = spiralRects(7, 0.6, true, true).reduce((s, r) => s + r.width * r.height, 0);
near(area, 1); // tiles cover the screen exactly, whatever the orientation
// portrait turns the layout 90 degrees: main row on top
const pt = slotRects(3, 0.6, 1, false, true);
assert.deepStrictEqual(pt.map(r => [r.x, r.y, r.width, r.height]), [[0, 0, 1, 0.6], [0, 0.6, 0.5, 0.4], [0.5, 0.6, 0.5, 0.4]]);
// main column count, mirroring, neighbours
const three = slotRects(3, 0.6, 2); // two main on the left, one stack on the right
assert.deepStrictEqual(three.map(r => [r.x, r.y]), [[0, 0], [0, 0.5], [0.6, 0]]);
assert.strictEqual(slotRects(2, 0.6, 2).length, 2);
const mir = slotRects(2, 0.6, 1, true);
assert.ok(Math.abs(mir[0].x - 0.4) < 1e-9 && mir[1].x === 0);
const r4 = slotRects(4, 0.5); // 0 = main, 1..3 = stack top to bottom
assert.strictEqual(pickNeighbor(r4, 0, "right"), 2);
assert.strictEqual(pickNeighbor(r4, 2, "up"), 1);
assert.strictEqual(pickNeighbor(r4, 2, "down"), 3);
assert.strictEqual(pickNeighbor(r4, 3, "down"), -1);
assert.strictEqual(pickNeighbor(r4, 3, "left"), 0);
// order ops: rotate only moves the stack, in the slots it already holds; swap exchanges two entries
const o = ["m", "x", "a", "y", "b", "c"]; // x, y belong to another desktop
rotateOrder(o, ["a", "b", "c"], 1);
assert.deepStrictEqual(o, ["m", "x", "b", "y", "c", "a"]);
rotateOrder(o, ["b", "c", "a"], -1);
assert.deepStrictEqual(o, ["m", "x", "a", "y", "b", "c"]);
swapOrder(o, 0, 5);
assert.deepStrictEqual(o, ["c", "x", "a", "y", "b", "m"]);
// placeInSlots: restores a saved sequence in the same slots; windows gone since are skipped
placeInSlots(o, ["m", "gone", "a", "b", "c"]);
assert.deepStrictEqual(o, ["m", "x", "a", "y", "b", "c"]);
// centered master: main in the middle, stack alternating right, left, top to bottom
const rr = (rs) => rs.map(r => [r.x, r.y, r.width, r.height].map(v => Math.round(v * 1000) / 1000));
assert.deepStrictEqual(rr(centeredRects(1, 0.5)), [[0, 0, 1, 1]]);
assert.deepStrictEqual(rr(centeredRects(2, 0.5)), [[0.25, 0, 0.5, 1], [0.75, 0, 0.25, 1]]); // left stays empty
assert.deepStrictEqual(rr(centeredRects(3, 0.5)), [[0.25, 0, 0.5, 1], [0.75, 0, 0.25, 1], [0, 0, 0.25, 1]]);
assert.deepStrictEqual(rr(centeredRects(4, 0.5)), [[0.25, 0, 0.5, 1], [0.75, 0, 0.25, 0.5], [0, 0, 0.25, 1], [0.75, 0.5, 0.25, 0.5]]);
const c6 = centeredRects(6, 0.6);
near(c6.reduce((s, r) => s + r.width * r.height, 0), 1); // no gaps or overlaps once both sides are used
assert.strictEqual(c6.filter(r => r.x > 0.5).length, 3);
assert.strictEqual(centeredRects(2, 0.5, true)[1].x, 0); // mirrored: the first stack window goes left
// stash: 15% sides leave 70% for the main window
assert.deepStrictEqual(rr(centeredRects(3, 1 - 2 * 0.15)), [[0.15, 0, 0.7, 1], [0.85, 0, 0.15, 1], [0, 0, 0.15, 1]]);
// portrait: same rotation as master and stack, one main row on top
assert.deepStrictEqual(centeredRects(3, 0.6, false, true), slotRects(3, 0.6, 1, false, true));
assert.strictEqual(clampRatio(0.2, 0.05, 0.3, 0.15), 0.2);
assert.strictEqual(clampRatio(0.4, 0.05, 0.3, 0.15), 0.15);
// Meta+Alt+A edits the list of the current mode
const apps = (o = {}) => Object.assign({ tileAll: true, system: true, media: true, tileClasses: ["a"], floatClasses: [], tileAnyway: [] }, o);
// which apps tile
assert.ok(appTiles("a", "", apps({ tileAll: false })) && !appTiles("b", "", apps({ tileAll: false })));
assert.ok(appTiles("org.kde.dolphin", "build — Dolphin", apps()));
assert.ok(!appTiles("systemsettings", "KWin Scripts — System Settings", apps()));
assert.ok(!appTiles("kcm_kwin4_genericscripted", "kcmshell6", apps())); // kcmshell6 window of a script's settings page
assert.ok(!appTiles("steam_app_570", "", apps()) && !appTiles("setup.exe", "", apps()) && !appTiles("pinentry-qt", "", apps()));
assert.ok(!appTiles("org.kde.dolphin", "Configure — Dolphin", apps())); // parentless config dialog
assert.ok(appTiles("systemsettings", "", apps({ system: false })));
assert.ok(appTiles("steam", "", apps({ media: false })) && !appTiles("systemsettings", "", apps({ media: false }))); // two separate switches
assert.ok(!appTiles("org.keepassxc.keepassxc", "", apps()));
assert.ok(appTiles("systemsettings", "", apps({ tileAnyway: ["systemsettings"] })));
assert.ok(!appTiles("systemsettings", "", apps({ tileAnyway: ["systemsettings"], floatClasses: ["systemsettings"] })));
// Meta+Alt+A edits the lists of the current mode
assert.deepStrictEqual(toggleApp("a", "", apps({ tileAll: false, tileClasses: ["a", "b"] })), { tiled: false, lists: { tileClasses: ["b"] } });
assert.deepStrictEqual(toggleApp("c", "", apps({ tileAll: false })), { tiled: true, lists: { tileClasses: ["a", "c"] } });
assert.deepStrictEqual(toggleApp("gimp", "", apps()), { tiled: false, lists: { floatClasses: ["gimp"], tileAnyway: [] } });
assert.deepStrictEqual(toggleApp("gimp", "", apps({ floatClasses: ["gimp"] })), { tiled: true, lists: { floatClasses: [], tileAnyway: [] } });
assert.deepStrictEqual(toggleApp("systemsettings", "", apps()), { tiled: true, lists: { floatClasses: [], tileAnyway: ["systemsettings"] } });
assert.deepStrictEqual(toggleApp("systemsettings", "", apps({ tileAnyway: ["systemsettings"] })), { tiled: false, lists: { floatClasses: [], tileAnyway: [] } });
// 1.1.x tile-all exclusions move to the never-tile list once
assert.strictEqual(migrateApps(true, true, "gimp"), null);
assert.deepStrictEqual(migrateApps(false, false, "gimp"), { appListsV2: "true" });
assert.deepStrictEqual(migrateApps(false, true, TERMINALS), { appListsV2: "true" });
assert.deepStrictEqual(migrateApps(false, true, " GIMP, steam "), { appListsV2: "true", floatClasses: "gimp,steam", tileClasses: TERMINALS });
assert.deepStrictEqual(migrateApps(false, true, "gimp", "mpv"), { appListsV2: "true" }); // never-tile already edited
// dwindle: c opens with a focused (order a, c, b) and splits a's tile; closing a gives its space to c
let tr = dwindleSync(null, ["a", "b"]);
assert.deepStrictEqual(tr, { kids: ["a", "b"] });
tr = dwindleSync(tr, ["a", "c", "b"]);
assert.deepStrictEqual(tr, { kids: [{ kids: ["a", "c"] }, "b"] });
const dw = dwindleRects(tr, 0.5, 16 / 9).rects; // left half is taller than wide: a over c
assert.deepStrictEqual(dw.map(r => [r.x, r.y, r.width, r.height]), [[0, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0, 0.5, 1]]);
assert.deepStrictEqual(dwindleSync(tr, ["c", "b"]), { kids: ["c", "b"] });
assert.deepStrictEqual(dwindleSync(tr, ["b", "c", "a"]), { kids: [{ kids: ["b", "c"] }, "a"] }); // swaps move windows, not tiles
assert.strictEqual(dwindleSync(tr, []), null);
const dm = dwindleRects(tr, 0.6, 16 / 9, true).rects;
near(dm[2].x, 0); near(dm[1].x, 0.4); near(dm[0].x, 0.7); // mirrored; a 0.6-wide half is wider than tall, so a|c
near(dwindleRects(dwindleSync(null, [1, 2, 3, 4, 5, 6]), 0.55, 9 / 16).rects.reduce((s, r) => s + r.width * r.height, 0), 1);
// dragged inner border: a over c moved from 50/50 to 30/70; the ratio is read back, kept through a new window, and laid out
const at = { a: { x: 0, y: 0, width: 0.5, height: 0.3 }, c: { x: 0, y: 0.3, width: 0.5, height: 0.7 }, b: { x: 0.5, y: 0, width: 0.5, height: 1 } };
const rd = dwindleRatios(tr, w => at[w]);
near(rd.ratio, 0.5); near(rd.kids[0].ratio, 0.3);
near(dwindleRatios(tr, w => w === "c" ? null : at[w]).kids[0].ratio || 0.5, 0.5); // c has no tile: keep the old ratio
const grown = dwindleSync(rd, ["a", "c", "b", "d"]); // d splits b
near(grown.kids[0].ratio, 0.3);
near(dwindleRects(grown, 0.5, 16 / 9).rects[1].y, 0.3);
// restart check: tileClasses=kitty, Meta+Alt+A tiles firefox and untiles it again, then the settings page adds firefox
const seen = { tileClasses: ["", "kitty"] }, now = v => () => v;
seen.tileClasses.push("kitty,firefox");
assert.ok(!settingsChanged(seen, now("kitty"))); // plasmashell hasn't stored it yet: no restart
confirmWrite(seen, "tileClasses", "kitty,firefox");
seen.tileClasses.push("kitty");
confirmWrite(seen, "tileClasses", "kitty");
assert.deepStrictEqual(seen.tileClasses, ["", "kitty"]);
assert.ok(settingsChanged(seen, now("kitty,firefox")) && !settingsChanged(seen, now("kitty")));
// dragged main width is read back as is (the caller caps it), not reset to the 55% default
const root = (dir, ws) => ({ layoutDirection: dir, tiles: ws.map(width => ({ relativeGeometry: { width, height: 1 } })) });
assert.strictEqual(draggedRatio(root(1, [0.9, 0.1]), false), 0.9);
assert.strictEqual(draggedRatio(root(1, [0.1, 0.9]), false, "m", true), 0.9); // mirrored: main on the right
assert.strictEqual(draggedRatio(root(2, [0.5, 0.5]), false), undefined); // not a layout we built
console.log("ok");
