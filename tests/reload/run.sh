#!/bin/bash
# Auto-apply check. Runs Stacklet in a private, virtual KWin (own D-Bus session, config and script folder;
# your real session is not touched) with two windows, floats one with Meta+F, then has KWin re-read its config
# the way Stacklet does when System Settings closes:
#   1. nothing changed: Stacklet must keep running as is (the floated window stays floating)
#   2. the gap changed in kwinrc: Stacklet must restart and lay out with the new gap
#
#   tests/reload/run.sh

set -u
HERE=$(cd "$(dirname "$0")" && pwd)
PKG=${PKG:-$HERE/../../package}

if [ "${STACKLET_RL_INNER:-}" != 1 ]; then
    STACKLET_RL_INNER=1 exec timeout 120 dbus-run-session -- "$0"
fi

WORK=$(mktemp -d)
export XDG_CONFIG_HOME=$WORK/config XDG_DATA_HOME=$WORK/data XDG_CACHE_HOME=$WORK/cache
unset DISPLAY WAYLAND_DISPLAY
mkdir -p "$XDG_CONFIG_HOME" "$XDG_DATA_HOME/kwin/scripts" "$XDG_CACHE_HOME"
cp -r "$PKG" "$XDG_DATA_HOME/kwin/scripts/stacklet"
printf '[Plugins]\nstackletEnabled=true\n[Script-stacklet]\nwelcomed=true\n' > "$XDG_CONFIG_HOME/kwinrc"

trap 'kill $(jobs -p) 2>/dev/null; rm -rf "$WORK"' EXIT
kwin_wayland --virtual --width 1600 --height 900 --socket "kwrl-$$" --no-lockscreen > "$WORK/kwin.log" 2>&1 &
KWIN=$!
sleep 5
[ "$(qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded stacklet)" = true ] || { echo "Stacklet did not load"; exit 1; }

export QT_NO_XDG_DESKTOP_PORTAL=1 GTK_USE_PORTAL=0 QT_QPA_PLATFORM=wayland WAYLAND_DISPLAY=kwrl-$$
python3 "$HERE/../layouts/hold.py" org.kde.konsole 2 60 > /dev/null 2>&1 &
sleep 6

dump() { # dump <n>: prints "caption tiled|floating x" per window (n: unique per call, it runs in a subshell)
    n=$1
    printf '%s\n' 'print("DUMP'$n' " + workspace.windowList().filter(w => w.normalWindow).sort((a, b) => a.caption < b.caption ? -1 : 1).map(w => w.caption + " " + (w.tile ? "tiled" : "floating") + " " + Math.round(w.frameGeometry.x)).join(" ; "));' > "$WORK/dump$n.js"
    qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "$WORK/dump$n.js" "dump$n" > /dev/null
    qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.start > /dev/null
    sleep 1
    { journalctl --user -b --no-pager "_PID=$KWIN" 2>/dev/null; cat "$WORK/kwin.log"; } | grep -o "DUMP$n .*" | tail -1 | sed "s/^DUMP$n //"
}
reconfigure() { qdbus6 org.kde.KWin /KWin org.kde.KWin.reconfigure; sleep 3; }

bad=0
qdbus6 org.kde.kglobalaccel /component/kwin org.kde.kglobalaccel.Component.invokeShortcut StackletToggleFloat > /dev/null
sleep 1
reconfigure
line=$(dump 1); echo "unchanged: $line"
[[ "$line" == *"floating"* ]] || { echo "!! Stacklet restarted although no setting changed (the Meta+F window was tiled again)"; bad=1; }

kwriteconfig6 --file kwinrc --group Script-stacklet --key gap 20
reconfigure
line=$(dump 2); echo "gap=20:    $line"
[[ "$line" == "w1 tiled 20 ; w2 tiled "* ]] || { echo "!! the new gap was not applied (expected w1 tiled at x=20)"; bad=1; }

[ "$(qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded stacklet)" = true ] || { echo "!! Stacklet is not loaded after the restart"; bad=1; }
kill -0 $KWIN 2>/dev/null || { echo "!! KWin died"; bad=1; }
[ $bad -eq 0 ] && echo PASS || echo FAIL
exit $bad
