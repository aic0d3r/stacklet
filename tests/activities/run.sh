#!/bin/bash
# Activities check. Runs Stacklet in a private, virtual KWin (own D-Bus session, config and script folder;
# your real session is not touched) with Plasma's activity service and a second Activity. Opens three
# windows, moves one to the other Activity, and checks that the layout closes the gap it leaves behind,
# that it tiles alone over there, and that switching back keeps the two-window layout.
#
#   tests/activities/run.sh
#
# A line that starts with "!!" means a window is not where it should be.

set -u
HERE=$(cd "$(dirname "$0")" && pwd)
PKG=${PKG:-$HERE/../../package}

if [ "${STACKLET_ACT_INNER:-}" != 1 ]; then
    STACKLET_ACT_INNER=1 timeout 120 dbus-run-session -- "$0"; r=$?
    [ $r -eq 0 ] && echo "PASS" || echo "FAIL"
    exit $r
fi

WORK=$(mktemp -d)
export XDG_CONFIG_HOME=$WORK/config XDG_DATA_HOME=$WORK/data XDG_CACHE_HOME=$WORK/cache
unset DISPLAY WAYLAND_DISPLAY
mkdir -p "$XDG_CONFIG_HOME" "$XDG_DATA_HOME/kwin/scripts" "$XDG_CACHE_HOME"
cp -r "$PKG" "$XDG_DATA_HOME/kwin/scripts/stacklet"
printf '[Plugins]\nstackletEnabled=true\n' > "$XDG_CONFIG_HOME/kwinrc"
trap 'kill $(jobs -p) 2>/dev/null; rm -rf "$WORK"' EXIT

QT_QPA_PLATFORM=offscreen /usr/lib/kactivitymanagerd > "$WORK/kamd.log" 2>&1 &
sleep 2
A=$(qdbus6 org.kde.ActivityManager /ActivityManager/Activities CurrentActivity)
B=$(qdbus6 org.kde.ActivityManager /ActivityManager/Activities AddActivity Other)
[ -n "$A" ] && [ -n "$B" ] || { echo "!! activity service did not start, so nothing was checked"; exit 1; }

kwin_wayland --virtual --width 1600 --height 900 --socket "kwact-$$" --no-lockscreen --no-global-shortcuts \
    > "$WORK/kwin.log" 2>&1 &
KWIN=$!
sleep 5
[ "$(qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded stacklet)" = true ] || { echo "Stacklet did not load"; exit 1; }

export QT_NO_XDG_DESKTOP_PORTAL=1 GTK_USE_PORTAL=0 QT_QPA_PLATFORM=wayland WAYLAND_DISPLAY=kwact-$$
python3 "$HERE/../layouts/hold.py" org.kde.konsole 3 60 > /dev/null 2>&1 &
sleep 5

n=0
run() {
    n=$((n + 1)); printf '%s\n' "$1" > "$WORK/s$n.js"
    qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "$WORK/s$n.js" "s$n" > /dev/null
    qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.start > /dev/null
    sleep 2
}
# sets L to "w1=x,y_WxH w2=... w3=..." (not called as $(geo): a subshell would lose n, and KWin ignores a reused script name)
geo() {
    run 'print("DUMP'$n' " + workspace.windowList().filter(w => w.normalWindow).sort((a, b) => a.caption < b.caption ? -1 : 1).map(w => { const g = w.frameGeometry; return w.caption + "=" + Math.round(g.x) + "," + Math.round(g.y) + "_" + Math.round(g.width) + "x" + Math.round(g.height); }).join(" "));'
    L=$( { journalctl --user -b --no-pager "_PID=$KWIN" 2>/dev/null; cat "$WORK/kwin.log"; } | grep -o "DUMP$((n - 1)) .*" | tail -1 | cut -d' ' -f2-)
}
fail=0
expect() { # step, window, wanted geometry, line
    local got; got=$(echo "$4" | tr ' ' '\n' | grep "^$2=" | cut -d= -f2)
    printf '  %-22s %s=%s\n' "$1" "$2" "$got"
    [ "$got" = "$3" ] || { echo "!! $1: $2 should be at $3"; fail=1; }
}

geo; [ -n "$L" ] || { echo "!! no window dump came back, so nothing was checked"; exit 1; }
expect "start" w2 880,0_720x450 "$L"
run 'workspace.windowList().find(w => w.caption === "w3").activities = ["'$B'"];'
geo; expect "w3 to other Activity" w2 880,0_720x900 "$L"   # the stack closes the gap
run 'workspace.currentActivity = "'$B'";'
geo; expect "on the other Activity" w3 0,0_1600x900 "$L"   # alone there, so it fills the screen
run 'workspace.currentActivity = "'$A'";'
geo; expect "back" w1 0,0_880x900 "$L"; expect "back" w2 880,0_720x900 "$L"
kill -0 $KWIN 2>/dev/null || { echo "!! KWin died"; exit 1; }
exit $fail
