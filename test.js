// node test.js — checks the layout math (the KWin part needs a live session)
const assert = require("assert");
const { slotRects, spiralRects, clampRatio, pickNeighbor } = require("./package/contents/code/main.js");

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
console.log("ok");
