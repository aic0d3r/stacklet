#!/bin/bash
# Saving check. Stacklet saves layouts switched by shortcut, dragged widths and Meta+Alt+A changes through Plasma's shell
# (KWin scripts can't write their config). In the other tests nothing is ever written: plasmashell doesn't run there.
# Runs Stacklet in the private, virtual KWin (own D-Bus session and folders; your real session is not touched) without
# the shell first, then with shell.py, a stand-in for it:
#   1. without the shell: no failed calls, and nothing written
#   2. shell up: the pending writes go out on the next window focus; the layout switched by shortcut, the grown main
#      width and the Meta+Alt+A app change are in kwinrc
#   3. after Stacklet restarts (the way a settings change makes it): all of that is still as it was. Meta+Alt+A then
#      tiles the app again, written at once, with its "(saved)" message
#
#   tests/save/run.sh
#
# A line that starts with "!!" means something was not saved.

set -u
HERE=$(cd "$(dirname "$0")" && pwd)

if [ "${STACKLET_SAVE_INNER:-}" != 1 ]; then
    STACKLET_SAVE_INNER=1 exec timeout 180 dbus-run-session -- "$0"
fi

. "$HERE/../common.sh" # no welcomed=true: its write is pending at first, and must get through later
start_kwin

python3 "$HERE/../layouts/hold.py" org.kde.konsole 3 120 > /dev/null 2>&1 &      # w1..w3 of one app
python3 "$HERE/../layouts/hold.py" org.example.anyapp 1 120 z > /dev/null 2>&1 & # z1 of another
sleep 6

bad=0
geo() { # "<work area WxH> ; caption=x,y_WxH [floating] ..." (called in a subshell, so its script name can't use a counter: KWin ignores a reused name)
    kjs "g$RANDOM" 'const a = workspace.clientArea(KWin.MaximizeArea, workspace.activeScreen, workspace.currentDesktop);
        print("DUMP " + Math.round(a.width) + "x" + Math.round(a.height) + " ; " + workspace.windowList().filter(w => w.normalWindow).sort((x, y) => x.caption < y.caption ? -1 : 1).map(w => w.caption + "=" + Math.round(w.frameGeometry.x) + "," + Math.round(w.frameGeometry.y) + "_" + Math.round(w.frameGeometry.width) + "x" + Math.round(w.frameGeometry.height) + (w.tile ? "" : " floating")).join(" ; "));'
    kwin_log | grep -o "DUMP .*" | tail -1 | cut -d' ' -f2-
}
win() { echo "$1" | tr ';' '\n' | grep " $2=" | cut -d= -f2; } # "x,y_WxH [floating]" of window $2 in a geo line
x() { win "$1" "$2" | cut -d, -f1; }
width() { win "$1" "$2" | sed 's/.*_\([0-9]*\)x.*/\1/'; }
focus() { kjs "focus$RANDOM" "workspace.activeWindow = workspace.windowList().find(w => w.caption === '$1');"; }
kwinrc_has() { grep -q "^$1" "$XDG_CONFIG_HOME/kwinrc"; } # a line of the private kwinrc starting with this: a key, or "key=value"

fire StackletNextLayout; fire StackletNextLayout; fire StackletNextLayout # centered (spiral looks like master and stack until 4 windows)
fire StackletGrowMain
focus z1
fire StackletToggleAppClass
sleep 2
# 1. no shell: every save waits for it, and Stacklet didn't try the call (each failed one is a warning in KWin's log)
kwinrc_has savedState && { echo "!! the layout was written although Plasma's shell is not running"; bad=1; }
if kwin_log | grep -q "org.kde.plasmashell"; then
    echo "!! Stacklet called Plasma's shell although it isn't running, e.g.:"; kwin_log | grep "org.kde.plasmashell" | head -3 | sed 's/^/   /'; bad=1
fi

# 2. the shell starts later (as at login): the next window focus sends what waited
python3 "$HERE/shell.py" > "$WORK/shell.log" 2>&1 &
for _ in $(seq 20); do grep -q "shell ready" "$WORK/shell.log" 2>/dev/null && break; sleep 1; done # until the stand-in owns its name
grep -q "shell ready" "$WORK/shell.log" || { echo "!! the shell stand-in did not start:"; tail -n 5 "$WORK/shell.log" | sed 's/^/   /'; exit 1; }
focus w2
sleep 2
saved=$(geo); echo "before the restart: $saved"
for key in welcomed savedState floatClasses; do kwinrc_has $key || { echo "!! $key never reached kwinrc"; bad=1; }; done
# centered: w3 left of the main window, w2 right of it. Grown once: the main window is 55% of the work area (centered starts at 50%)
[ "$(x "$saved" w3)" -lt "$(x "$saved" w1)" ] && [ "$(x "$saved" w1)" -lt "$(x "$saved" w2)" ] || { echo "!! the layout switched to by shortcut is not centered"; bad=1; }
[ "$(( $(width "$saved" w1) - $(echo "$saved" | cut -d' ' -f1 | cut -dx -f1) * 55 / 100 ))" -le 1 ] || { echo "!! the main window is not 55% wide after one grow step: ${saved}"; bad=1; }
[[ "$saved" == *"z1="*" floating"* ]] || { echo "!! z1 is not floating after Meta+Alt+A"; bad=1; }

# 3. a changed setting restarts Stacklet (shortcuts can't be unregistered): what it saved must come back
kwriteconfig6 --file kwinrc --group Script-stacklet --key metaArrows true
qdbus6 org.kde.KWin /KWin org.kde.KWin.reconfigure
sleep 5
# (it did restart: the Meta+arrows shortcuts of the new setting exist now, whatever keys KWin left for them)
qdbus6 org.kde.kglobalaccel /component/kwin org.kde.kglobalaccel.Component.shortcutNames | grep -qw StackletFocusLeft || { echo "!! Stacklet did not restart for the Meta+arrows change"; bad=1; }
after=$(geo); echo "after the restart:  $after"
[ "$after" = "$saved" ] || { echo "!! the saved layout, main width or app list did not survive the restart"; bad=1; }

focus z1
fire StackletToggleAppClass # the other way round: z1 tiles again, written straight away now
now=$(geo); echo "tiling z1 again:    $now"
[[ "$now" == *"z1="*" floating"* ]] && { echo "!! z1 still floats after Meta+Alt+A"; bad=1; }
kwinrc_has 'floatClasses=$' || { echo "!! the emptied never-tile list was not written"; bad=1; }
grep -q "^OSD Stacklet: tiling org.example.anyapp (saved)" "$WORK/shell.log" || { echo "!! Meta+Alt+A's message doesn't say it was saved:"; grep "^OSD" "$WORK/shell.log" | tail -n 3 | sed 's/^/   /'; bad=1; }

[ $bad -eq 0 ] && echo PASS || echo FAIL
exit $bad
