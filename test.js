// node test.js — checks the layout math (the KWin part needs a live session)
const assert = require("assert");
const { slotRects, clampRatio } = require("./package/contents/code/main.js");

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
console.log("ok");
