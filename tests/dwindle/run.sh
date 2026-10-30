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
PKG=${PKG:-$HERE/../../package}
[ "${STACKLET_DWINDLE_INNER:-}" = 1 ] || { STACKLET_DWINDLE_INNER=1 timeout 120 dbus-run-session -- "$0"; r=$?; [ $r -eq 0 ] && echo PASS || echo FAIL; exit $r; }

WORK=$(mktemp -d)
export XDG_CONFIG_HOME=$WORK/config XDG_DATA_HOME=$WORK/data XDG_CACHE_HOME=$WORK/cache
unset DISPLAY WAYLAND_DISPLAY
mkdir -p "$XDG_CONFIG_HOME" "$XDG_DATA_HOME/kwin/scripts" "$XDG_CACHE_HOME"
cp -r "$PKG" "$XDG_DATA_HOME/kwin/scripts/stacklet"
printf '[Plugins]\nstackletEnabled=true\n[Script-stacklet]\nwelcomed=true\ndesktopLayouts=1=dwindle\n' > "$XDG_CONFIG_HOME/kwinrc"

trap 'exec 3>&- 2>/dev/null; kill $(jobs -p) 2>/dev/null; rm -rf "$WORK"' EXIT
kwin_wayland --virtual --width 1600 --height 900 --socket "kwdwindle-$$" --no-lockscreen \
    > "$WORK/kwin.log" 2>&1 &
KWIN=$!
sleep 5
[ "$(qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded stacklet)" = true ] || { echo "Stacklet did not load"; exit 1; }

# run a one-off KWin script under a unique name
kjs() {
    echo "$2" > "$WORK/$1.js"
    qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "$WORK/$1.js" "$1" > /dev/null
    qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.start > /dev/null
    sleep 1
}
DUMP='const ws = workspace.windowList().filter(w => w.normalWindow).sort((a, b) => a.caption < b.caption ? -1 : 1);
print("DUMP" + TAG + " " + ws.map(w => w.caption + "=" + Math.round(w.frameGeometry.x) + "," + Math.round(w.frameGeometry.y) + " " + Math.round(w.frameGeometry.width) + "x" + Math.round(w.frameGeometry.height)).join(" "));'
bad=0
check() { # tag, expected
    local got
    kjs "$1" "const TAG = '$1'; $DUMP"
    got=$( { journalctl --user -b --no-pager "_PID=$KWIN" 2>/dev/null; cat "$WORK/kwin.log"; } | grep -o "DUMP$1 .*" | tail -1 | sed "s/^DUMP$1 //")
    printf '%-14s %s\n' "$1:" "$got"
    [ "$got" = "$2" ] || { echo "!! expected      $2"; bad=1; }
}
focus() { kjs "focus$1$RANDOM" "workspace.activeWindow = workspace.windowList().find(w => w.caption === '$1');"; }
fire() { qdbus6 org.kde.kglobalaccel /component/kwin org.kde.kglobalaccel.Component.invokeShortcut "$1" > /dev/null; sleep 1; }
win() { echo "$1 ${2:-}" >&3; sleep 1.5; } # open|close, name

export QT_NO_XDG_DESKTOP_PORTAL=1 GTK_USE_PORTAL=0 QT_QPA_PLATFORM=wayland WAYLAND_DISPLAY=kwdwindle-$$
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
