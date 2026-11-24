#!/bin/bash
# Crash stress test. Runs Stacklet inside a private, virtual KWin (its own D-Bus session, config and
# script folder, so your real session is never touched), opens and closes lots of windows and fails
# if KWin dies.
#
#   tests/stress/run.sh              # master and stack, spiral, monocle, centered and dwindle
#   tests/stress/run.sh spiral       # one layout (tile | spiral | monocle | centered | dwindle)
#   TRACKED=200 UNTRACKED=100 tests/stress/run.sh
#
# Needs kwin_wayland, dbus-run-session, qdbus6 and python3 with PyQt6.
#
# Why it exists: keeping windows in a WeakSet/WeakMap segfaulted KWin when a window closed (about 60
# windows were enough). Plasma's own crash handler restarts the display, so it looks like a logout.
#
# Cleaning up by hand after an aborted run: only kill this script's own kwin_wayland (the one started
# with --virtual). Never pkill portals or kwin by name, that hits your real session.

set -u
HERE=$(cd "$(dirname "$0")" && pwd)
TRACKED=${TRACKED:-120}
UNTRACKED=${UNTRACKED:-60}

# Outer part: one private D-Bus session per layout.
if [ "${STACKLET_STRESS_INNER:-}" != 1 ]; then
    layouts=("$@")
    [ ${#layouts[@]} -eq 0 ] && layouts=(tile spiral monocle centered dwindle)
    rc=0
    for l in "${layouts[@]}"; do
        STACKLET_STRESS_INNER=1 timeout 300 dbus-run-session -- "$0" "$l" || rc=1
    done
    [ $rc -eq 0 ] && echo "PASS" || echo "FAIL"
    exit $rc
fi

LAYOUT=$1
on() { [ "$LAYOUT" = "$1" ] && echo true || echo false; }
KWINRC=$(printf '[Script-stacklet]\nlayoutTile=%s\nlayoutSpiral=%s\nlayoutMonocle=%s\nlayoutCentered=%s\nlayoutDwindle=%s\n' \
    "$(on tile)" "$(on spiral)" "$(on monocle)" "$(on centered)" "$(on dwindle)")
fail() { echo "  FAIL: $1"; tail -n 8 "$WORK/kwin.log" | sed 's/^/    kwin: /'; exit 1; }
. "$HERE/../common.sh"
start_kwin
alive() { kill -0 $KWIN 2>/dev/null || fail "KWin died ($1)"; echo "  KWin alive after $1"; }

echo "layout=$LAYOUT package=$PKG"
alive "startup"

# org.kde.konsole is in the default tile list, org.test.untracked is not
echo "phase 1: $TRACKED tiled windows, 3 open at a time"
python3 "$HERE/churn.py" org.kde.konsole "$TRACKED" 3 > /dev/null 2>&1; alive "phase 1"
echo "phase 2: $UNTRACKED floating windows"
python3 "$HERE/churn.py" org.test.untracked "$UNTRACKED" 3 > /dev/null 2>&1; alive "phase 2"
echo "phase 3: another round of tiled windows, 4 open at a time"
python3 "$HERE/churn.py" org.kde.konsole "$TRACKED" 4 > /dev/null 2>&1; alive "phase 3"
echo "phase 4: scratchpad while windows open and close (hidden windows get closed too)"
python3 "$HERE/churn.py" org.kde.konsole "$TRACKED" 4 > /dev/null 2>&1 &
CHURN=$!
while kill -0 $CHURN 2>/dev/null; do
    for s in StackletSendToScratchpad StackletScratchpad StackletScratchpad StackletFocusMode \
             StackletSplitBeside StackletFlipSplit StackletSplitBelow; do
        qdbus6 org.kde.kglobalaccel /component/kwin org.kde.kglobalaccel.Component.invokeShortcut $s > /dev/null 2>&1
        sleep 0.1
    done
done
alive "phase 4"

[ "$(qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded stacklet)" = true ] ||
    fail "Stacklet was unloaded during the run"
echo "  OK ($LAYOUT)"
