#!/bin/bash
# Dwindle check in a private virtual KWin (1600x900, own D-Bus session and config; your session is not touched).
#   1. w1..w3, focus w1, open w4: w4 must split w1's tile, not the newest one
#   2. close w3: w2 must take its space
#   3. drag the inner border between w1 and w4 (set by script), then open w5: the border must stay put
#   4. Meta+Alt+H on w2 (a tall tile), open w5: beside w2, not below
#   5. Meta+Alt+V on w4 (a wide tile), open w6: below w4, not beside
#   6. Meta+Alt+E on w6: its split with w4 turns side by side
# Needs kwin_wayland, dbus-run-session, qdbus6 and python3 with PyQt6.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
[ "${STACKLET_DWINDLE_INNER:-}" = 1 ] || { STACKLET_DWINDLE_INNER=1 timeout 120 dbus-run-session -- "$0"; r=$?; [ $r -eq 0 ] && echo PASS || echo FAIL; exit $r; }

KWINRC=$'[Script-stacklet]\nwelcomed=true\ndesktopLayouts=1=dwindle'
. "$HERE/../common.sh"
trap 'exec 3>&- 2>/dev/null; kill $(jobs -p) 2>/dev/null; rm -rf "$WORK"' EXIT # the window helper reads from a fifo on fd 3
start_kwin

focus() { kjs "focus$1$RANDOM" "workspace.activeWindow = workspace.windowList().find(w => w.caption === '$1');"; }

mkfifo "$WORK/cmd"
python3 "$HERE/steps.py" org.kde.konsole < "$WORK/cmd" > /dev/null 2>&1 &
exec 3> "$WORK/cmd"

win open w1; win open w2; win open w3
check three "w1=0,0 880x900 w2=880,0 720x450 w3=880,450 720x450"
focus w1
win open w4
# w1's tile is 880x900, taller than wide: w4 goes below w1 (not below w3, the newest)
check four "w1=0,0 880x450 w2=880,0 720x450 w3=880,450 720x450 w4=0,450 880x450"
win close w3
check closed "w1=0,0 880x450 w2=880,0 720x900 w4=0,450 880x450"

# drag the w1 | w4 border up to 30% (what a mouse drag does to the tiles)
kjs drag "const w = workspace.windowList().find(w => w.caption === 'w1'); w.tile.relativeGeometry = { x: 0, y: 0, width: 0.55, height: 0.3 };"
check dragged "w1=0,0 880x270 w2=880,0 720x900 w4=0,270 880x630"
# w2's tile is tall (720x900), so without Meta+Alt+H w5 would go below it
focus w2
fire StackletSplitBeside
win open w5
check beside "w1=0,0 880x270 w2=880,0 360x900 w4=0,270 880x630 w5=1240,0 360x900"
# w4's tile is wide (880x630), so without Meta+Alt+V w6 would go beside it
focus w4
fire StackletSplitBelow
win open w6
check below "w1=0,0 880x270 w2=880,0 360x900 w4=0,270 880x315 w5=1240,0 360x900 w6=0,585 880x315"
focus w6
fire StackletFlipSplit
check flipped "w1=0,0 880x270 w2=880,0 360x900 w4=0,270 440x630 w5=1240,0 360x900 w6=440,270 440x630"
win quit
kill -0 $KWIN 2>/dev/null || { echo "KWin died"; exit 1; }
exit $bad
