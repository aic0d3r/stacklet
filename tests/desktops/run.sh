#!/bin/bash
# Background desktop check. Runs Stacklet in a private, virtual KWin (own D-Bus session, config and script folder;
# your real session is not touched). Desktop 2 holds three tiled windows, laid out while not in view; a fourth is
# sent there from desktop 1. On switching over, every window must sit in its own slot (KWin re-homes windows of
# removed tiles by their old position, which on a hidden desktop is the wrong slot), and the newcomer goes last.
# Then dwindle: a window that goes fullscreen and back, or a monocle round trip, keeps the tree it had.
#
#   tests/desktops/run.sh

set -u
HERE=$(cd "$(dirname "$0")" && pwd)
PKG=${PKG:-$HERE/../../package}

if [ "${STACKLET_DT_INNER:-}" != 1 ]; then
    STACKLET_DT_INNER=1 exec timeout 180 dbus-run-session -- "$0"
fi

WORK=$(mktemp -d)
export XDG_CONFIG_HOME=$WORK/config XDG_DATA_HOME=$WORK/data XDG_CACHE_HOME=$WORK/cache
unset DISPLAY WAYLAND_DISPLAY
mkdir -p "$XDG_CONFIG_HOME" "$XDG_DATA_HOME/kwin/scripts" "$XDG_CACHE_HOME"
cp -r "$PKG" "$XDG_DATA_HOME/kwin/scripts/stacklet"
printf '[Plugins]\nstackletEnabled=true\n[Script-stacklet]\nwelcomed=true\ndesktopLayouts=3=dwindle\n' > "$XDG_CONFIG_HOME/kwinrc"

trap 'exec 3>&- 2>/dev/null; kill $(jobs -p) 2>/dev/null; rm -rf "$WORK"' EXIT
kwin_wayland --virtual --width 1600 --height 900 --socket "kwdt-$$" --no-lockscreen > "$WORK/kwin.log" 2>&1 &
KWIN=$!
sleep 5
[ "$(qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded stacklet)" = true ] || { echo "Stacklet did not load"; exit 1; }

kjs() { # run a one-off KWin script under a unique name
    echo "$2" > "$WORK/$1.js"
    qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "$WORK/$1.js" "$1" > /dev/null
    qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.start > /dev/null
    sleep 1
}
DUMP='const ws = workspace.windowList().filter(w => w.normalWindow && w.desktops[0] === workspace.currentDesktop).sort((a, b) => a.caption < b.caption ? -1 : 1);
print("DUMP" + TAG + " " + ws.map(w => w.caption + "=" + Math.round(w.frameGeometry.x) + "," + Math.round(w.frameGeometry.y) + " " + Math.round(w.frameGeometry.width) + "x" + Math.round(w.frameGeometry.height)).join(" "));'
bad=0
check() { # tag, expected
    local got
    kjs "$1" "const TAG = '$1'; $DUMP"
    got=$( { journalctl --user -b --no-pager "_PID=$KWIN" 2>/dev/null; cat "$WORK/kwin.log"; } | grep -o "DUMP$1 .*" | tail -1 | sed "s/^DUMP$1 //")
    printf '%-14s %s\n' "$1:" "$got"
    [ "$got" = "$2" ] || { echo "!! expected      $2"; bad=1; }
}
n=0
on() { n=$((n + 1)); kjs "s$n" "const W = n => workspace.windowList().find(w => w.caption === n); $1"; } # script with W(caption)
fire() { qdbus6 org.kde.kglobalaccel /component/kwin org.kde.kglobalaccel.Component.invokeShortcut "$1" > /dev/null; sleep 1; }
win() { echo "$1 ${2:-}" >&3; sleep 1.5; } # open|close, name

export QT_NO_XDG_DESKTOP_PORTAL=1 GTK_USE_PORTAL=0 QT_QPA_PLATFORM=wayland WAYLAND_DISPLAY=kwdt-$$
mkfifo "$WORK/cmd"
python3 "$HERE/../dwindle/steps.py" org.kde.konsole < "$WORK/cmd" > /dev/null 2>&1 &
exec 3> "$WORK/cmd"

on 'workspace.createDesktop(1, "two"); workspace.createDesktop(2, "three");'
win open a1; win open a2; win open a3; win open w4
# a1..a3 to desktop 2 one by one (each lays desktop 2 out while it's hidden); w4 stays, then follows
for x in a1 a2 a3 w4; do on "W('$x').desktops = [workspace.desktops[1]];"; done
on 'workspace.currentDesktop = workspace.desktops[1];'
sleep 1
check hidden "a1=0,0 880x900 a2=880,0 720x300 a3=880,300 720x300 w4=880,600 720x300"
# a border dragged inside the stack survives a re-layout with the same windows (rotating the stack)
on "W('a2').tile.relativeGeometry = { x: 0.55, y: 0, width: 0.45, height: 0.5 };"
on "workspace.activeWindow = W('a2');"
fire StackletTurnNext
check stack "a1=0,0 880x900 a2=880,600 720x300 a3=880,0 720x450 w4=880,450 720x150"

# dwindle on desktop 3: [d1 | d2 / d3], with d1 going fullscreen and back, then monocle and back
on 'workspace.currentDesktop = workspace.desktops[2];'
win open d1; win open d2; win open d3
check tree "d1=0,0 880x900 d2=880,0 720x450 d3=880,450 720x450"
on "W('d1').fullScreen = true;"
on "W('d1').fullScreen = false;"
check fullscreen "d1=0,0 880x900 d2=880,0 720x450 d3=880,450 720x450"
on "W('d1').minimized = true;"
on "W('d1').minimized = false;"
check minimized "d1=0,0 880x900 d2=880,0 720x450 d3=880,450 720x450"
on "workspace.activeWindow = W('d3');"
fire StackletFlipSplit # d2 | d3 side by side: a pinned direction monocle used to forget
check flipped "d1=0,0 880x900 d2=880,0 360x900 d3=1240,0 360x900"
fire StackletMonocle; fire StackletMonocle
check monocle "d1=0,0 880x900 d2=880,0 360x900 d3=1240,0 360x900"
win quit
kill -0 $KWIN 2>/dev/null || { echo "!! KWin died"; bad=1; }
[ $bad -eq 0 ] && echo PASS || echo FAIL
exit $bad
