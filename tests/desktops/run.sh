#!/bin/bash
# Background desktop check. Runs Stacklet in a private, virtual KWin (own D-Bus session, config and script folder;
# your real session is not touched). Desktop 2 holds three tiled windows, laid out while not in view; a fourth is
# sent there from desktop 1. On switching over, every window must sit in its own slot (KWin re-homes windows of
# removed tiles by their old position, which on a hidden desktop is the wrong slot), and the newcomer goes last.
# Then a border dragged inside the stack must survive a rotation, and "Windows in the main column" 1 -> 2 -> 1
# must give the rows of the setting, not the borders kept from before.
# Then dwindle: a window that goes fullscreen and back, or a monocle round trip, keeps the tree it had.
#
#   tests/desktops/run.sh

set -u
HERE=$(cd "$(dirname "$0")" && pwd)

if [ "${STACKLET_DT_INNER:-}" != 1 ]; then
    STACKLET_DT_INNER=1 exec timeout 180 dbus-run-session -- "$0"
fi

KWINRC=$'[Script-stacklet]\nwelcomed=true\ndesktopLayouts=3=dwindle'
. "$HERE/../common.sh"
trap 'exec 3>&- 2>/dev/null; kill $(jobs -p) 2>/dev/null; rm -rf "$WORK"' EXIT # the window helper reads from a fifo on fd 3
start_kwin

n=0
on() { n=$((n + 1)); kjs "s$n" "const W = n => workspace.windowList().find(w => w.caption === n); $1"; } # script with W(caption)
setkey() { kwriteconfig6 --file kwinrc --group Script-stacklet --key "$1" "$2"; qdbus6 org.kde.KWin /KWin org.kde.KWin.reconfigure; sleep 2; }

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
# the setting changes with the same windows: the rows follow it, the dragged borders from above don't (stack order: a3, w4, a2)
setkey maxMain 2
check two-mains "a1=0,0 880x450 a2=880,450 720x450 a3=0,450 880x450 w4=880,0 720x450"
setkey maxMain 1
check one-main "a1=0,0 880x900 a2=880,600 720x300 a3=880,0 720x300 w4=880,300 720x300"

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
