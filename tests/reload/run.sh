#!/bin/bash
# Auto-apply check. Runs Stacklet in a private, virtual KWin (own D-Bus session, config and script folder;
# your real session is not touched) with two windows, floats one with Meta+F, then has KWin re-read its config
# the way Stacklet does when System Settings closes:
#   1. nothing changed: Stacklet must keep running as is (the floated window stays floating)
#   2. the gap changed in kwinrc: Stacklet applies it in place (the floated window stays floating)
#   3. Meta+arrows changed: shortcuts can't be unregistered, so Stacklet restarts (the floated window tiles again)
#
#   tests/reload/run.sh

set -u
HERE=$(cd "$(dirname "$0")" && pwd)

if [ "${STACKLET_RL_INNER:-}" != 1 ]; then
    STACKLET_RL_INNER=1 exec timeout 120 dbus-run-session -- "$0"
fi

KWINRC=$'[Script-stacklet]\nwelcomed=true' # no first-start message: it is saved through plasmashell, which doesn't run here
. "$HERE/../common.sh"
start_kwin

python3 "$HERE/../layouts/hold.py" org.kde.konsole 2 60 > /dev/null 2>&1 &
sleep 6

dump() { # dump <n>: prints "caption tiled|floating x" per window (n: unique per call, KWin ignores a reused script name)
    kjs "dump$1" 'print("DUMP'$1' " + workspace.windowList().filter(w => w.normalWindow).sort((a, b) => a.caption < b.caption ? -1 : 1).map(w => w.caption + " " + (w.tile ? "tiled" : "floating") + " " + Math.round(w.frameGeometry.x)).join(" ; "));'
    kwin_log | grep -o "DUMP$1 .*" | tail -1 | sed "s/^DUMP$1 //"
}
reconfigure() { qdbus6 org.kde.KWin /KWin org.kde.KWin.reconfigure; sleep 3; }

bad=0
qdbus6 org.kde.kglobalaccel /component/kwin org.kde.kglobalaccel.Component.invokeShortcut StackletToggleFloat > /dev/null
sleep 1
reconfigure
line=$(dump 1); echo "unchanged: $line"
[[ "$line" == *"floating"* ]] || { echo "!! Stacklet restarted although no setting changed (the Meta+F window was tiled again)"; bad=1; }

kwriteconfig6 --file kwinrc --group Script-stacklet --key gap 20
kwriteconfig6 --file kwinrc --group Script-stacklet --key smartGaps false # else a lone tiled window has no gap
reconfigure
line=$(dump 2); echo "gap=20:    $line"
[[ "$line" == "w1 tiled 20 ; w2 floating "* ]] || { echo "!! the new gap was not applied in place (expected w1 tiled at x=20, w2 still floating)"; bad=1; }

kwriteconfig6 --file kwinrc --group Script-stacklet --key metaArrows true
reconfigure
line=$(dump 3); echo "metaArrows: $line"
[[ "$line" == "w1 tiled 20 ; w2 tiled "* ]] || { echo "!! Stacklet did not restart for the Meta+arrows change (expected both tiled)"; bad=1; }

[ "$(qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded stacklet)" = true ] || { echo "!! Stacklet is not loaded after the restart"; bad=1; }
kill -0 $KWIN 2>/dev/null || { echo "!! KWin died"; bad=1; }
[ $bad -eq 0 ] && echo PASS || echo FAIL
exit $bad
