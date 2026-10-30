#!/bin/bash
# Dwindle check in a private virtual KWin (1600x900, own D-Bus session and config; your session is not touched).
# Opens w1..w3, focuses w1, opens w4 (must split w1's tile, not the newest one), closes w3 (w2 must take its space).
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
printf '[Plugins]\nstackletEnabled=true\n[Script-stacklet]\ndesktopLayouts=1=dwindle\n' > "$XDG_CONFIG_HOME/kwinrc"

trap 'kill $(jobs -p) 2>/dev/null; rm -rf "$WORK"' EXIT
kwin_wayland --virtual --width 1600 --height 900 --socket "kwdwindle-$$" --no-lockscreen --no-global-shortcuts \
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
    got=$( { journalctl --user -b --no-pager "_PID=$KWIN" 2>/dev/null; cat "$WORK/kwin.log"; } | grep -o "DUMP$1 .*" | tail -1 | sed "s/^DUMP$1 //")
    printf '%-14s %s\n' "$1:" "$got"
    [ "$got" = "$2" ] || { echo "!! expected      $2"; bad=1; }
}

export QT_NO_XDG_DESKTOP_PORTAL=1 GTK_USE_PORTAL=0 QT_QPA_PLATFORM=wayland WAYLAND_DISPLAY=kwdwindle-$$
python3 "$HERE/steps.py" org.kde.konsole > /dev/null 2>&1 &
T0=$SECONDS
sleep 3
kjs three "const TAG = 'three'; $DUMP"
check three "w1=0,0 880x900 w2=880,0 720x450 w3=880,450 720x450"
kjs focus 'workspace.activeWindow = workspace.windowList().find(w => w.caption === "w1");'
sleep $((8 - (SECONDS - T0)))
kjs four "const TAG = 'four'; $DUMP"
# w1's tile is 880x900, taller than wide: w4 goes below w1 (not below w3, the newest)
check four "w1=0,0 880x450 w2=880,0 720x450 w3=880,450 720x450 w4=0,450 880x450"
sleep $((12 - (SECONDS - T0)))
kjs closed "const TAG = 'closed'; $DUMP"
check closed "w1=0,0 880x450 w2=880,0 720x900 w4=0,450 880x450"
kill -0 $KWIN 2>/dev/null || { echo "KWin died"; exit 1; }
exit $bad
