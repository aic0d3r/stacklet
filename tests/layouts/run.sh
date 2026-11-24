#!/bin/bash
# Layout check. Runs Stacklet in a private, virtual KWin (own D-Bus session, config and script folder;
# your real session is not touched), opens N windows, and prints where each one ended up.
#
#   tests/layouts/run.sh                    # every layout with 2, 3, 4, 6 and 10 windows, 20 in master and stack and in centered,
#                                           # then 4 windows on a portrait (900x1600) screen
#   tests/layouts/run.sh spiral 4           # one layout, one window count
#   KWINRC=$'[Script-stacklet]\nlayoutSpiral=true\nlayoutTile=false' tests/layouts/run.sh - 5
#        ^ run with your own kwinrc section instead of a preset (layout "-"): printed and shape-checked, positions not compared
#   SIZE=2560x1080 tests/layouts/run.sh     # one screen size of your own (default 1600x900, then 900x1600)
#
# Output per run: "layout n=N  : x,y WxH ; ..." in the order the windows were opened. A line that starts with
# "!!" means the shape is wrong, or (presets only) a window is not where the layout maths of test.js puts it.

set -u
HERE=$(cd "$(dirname "$0")" && pwd)

if [ "${STACKLET_LAYOUT_INNER:-}" != 1 ]; then
    layouts=("${1:-tile spiral monocle centered dwindle}")
    runs=()
    for l in ${layouts[@]}; do
        for n in ${2:-2 3 4 6 10}; do runs+=("$l $n"); done
        if [ -z "${2:-}" ]; then
            case $l in tile|centered) runs+=("$l 20") ;; esac # long stacks: spiral and dwindle would make tiles a few pixels wide
            runs+=("$l 4 portrait") # four windows do: centered is master and stack there
        fi
    done
    bad=0
    for run in "${runs[@]}"; do
        read -r l n portrait <<< "$run"
        size=1600x900; [ -z "$portrait" ] || size=${SIZE:-900x1600}
        SIZE=$size STACKLET_LAYOUT_INNER=1 timeout 150 dbus-run-session -- "$0" "$l" "$n" || bad=1
    done
    [ $bad -eq 0 ] && echo "PASS" || echo "FAIL"
    exit $bad
fi

LAYOUT=$1; N=$2
if [ "$LAYOUT" != - ]; then
    on() { [ "$LAYOUT" = "$1" ] && echo true || echo false; }
    KWINRC=$(printf '[Script-stacklet]\nlayoutTile=%s\nlayoutSpiral=%s\nlayoutMonocle=%s\nlayoutCentered=%s\nlayoutDwindle=%s\n' \
        "$(on tile)" "$(on spiral)" "$(on monocle)" "$(on centered)" "$(on dwindle)")
fi
. "$HERE/../common.sh"
start_kwin --no-global-shortcuts

python3 "$HERE/hold.py" org.kde.konsole "$N" $((N / 2 + 12)) > /dev/null 2>&1 &
sleep $((N / 2 + 5))

kjs dump 'print("DUMP " + workspace.windowList().filter(w => w.normalWindow).sort((a, b) => parseInt(a.caption.slice(1)) - parseInt(b.caption.slice(1))).map(w => { const g = w.frameGeometry; return Math.round(g.x) + "," + Math.round(g.y) + " " + Math.round(g.width) + "x" + Math.round(g.height); }).join(" ; "));'
kill -0 $KWIN 2>/dev/null || { echo "KWin died"; exit 1; }
LINE=$(kwin_log | grep -o "DUMP .*" | tail -1 | cut -d' ' -f2-)
[ -n "$LINE" ] || { echo "!! no window dump came back, so nothing was checked"; exit 1; }
printf '%-8s n=%-2s: %s\n' "$LAYOUT" "$N" "$LINE"

# Shape check: how many distinct window rectangles, and whether monocle really stacks them
distinct=$(echo "$LINE" | tr ';' '\n' | sed 's/^ *//; s/ *$//' | sort -u | wc -l)
case "$LAYOUT" in
    monocle) [ "$N" -gt 1 ] && [ "$distinct" -ne 1 ] && { echo "!! monocle should give every window the same rectangle, got $distinct"; exit 1; } ;;
    tile|spiral|centered|dwindle) [ "$distinct" -ne "$N" ] && { echo "!! $LAYOUT should give $N different rectangles, got $distinct"; exit 1; } ;;
esac
# Every window where the layout maths put it, with Stacklet's defaults (main width 55%, centered 50%, no gap, not mirrored)
[ "$LAYOUT" = - ] && exit 0
node -e '
const m = require(process.argv[1] + "/contents/code/main.js"), [layout, n, w, h] = process.argv.slice(2), W = +w, H = +h, line = process.argv[6];
let r, tree = null; // dwindle: each window splits the one before it, as when none was focused
if (layout === "monocle") r = Array(+n).fill({ x: 0, y: 0, width: 1, height: 1 });
else if (layout === "dwindle") {
    for (let i = 1; i <= n; i++) tree = m.dwindleSync(tree, Array.from({ length: i }, (_, j) => "w" + (j + 1)));
    r = m.dwindleRects(tree, 0.55, W / H).rects;
} else if (layout === "spiral") r = m.spiralRects(+n, 0.55, false, H > W);
else if (layout === "centered") r = m.centeredRects(+n, 0.5, false, H > W);
else r = m.slotRects(+n, 0.55, 1, false, H > W);
const got = line.split(";").map(s => s.trim().split(/[^0-9]+/).map(Number));
const px = e => [e.x * W, e.y * H, e.width * W, e.height * H].map(Math.round);
const off = got.filter((g, i) => !r[i] || px(r[i]).some((v, j) => Math.abs(v - g[j]) > 1)); // 1 pixel off is rounding
if (off.length || got.length !== +n) {
    console.log(`!! ${layout} with ${n} windows on ${W}x${H}: ${got.length - off.length} of ${n} windows are where the layout maths puts them`);
    console.log(`   expected: ${r.map(e => { const [x, y, w, h] = px(e); return `${x},${y} ${w}x${h}`; }).join(" ; ")}`);
    process.exit(1);
}' "$PKG" "$LAYOUT" "$N" "${SIZE%x*}" "${SIZE#*x}" "$LINE"
