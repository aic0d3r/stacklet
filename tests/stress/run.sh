#!/bin/bash
# Crash stress test. Runs Stacklet inside a private, virtual KWin (its own D-Bus session, config and
# script folder, so your real session is never touched), opens and closes lots of windows and fails
# if KWin dies.
#
#   tests/stress/run.sh              # master and stack, spiral and monocle
#   tests/stress/run.sh spiral       # one layout (tile | spiral | monocle)
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
PKG=${PKG:-$HERE/../../package}
TRACKED=${TRACKED:-120}
UNTRACKED=${UNTRACKED:-60}

# Outer part: one private D-Bus session per layout.
if [ "${STACKLET_STRESS_INNER:-}" != 1 ]; then
    layouts=("$@")
    [ ${#layouts[@]} -eq 0 ] && layouts=(tile spiral monocle)
    rc=0
    for l in "${layouts[@]}"; do
        STACKLET_STRESS_INNER=1 timeout 300 dbus-run-session -- "$0" "$l" || rc=1
    done
    [ $rc -eq 0 ] && echo "PASS" || echo "FAIL"
    exit $rc
fi

LAYOUT=$1
WORK=$(mktemp -d)
export XDG_CONFIG_HOME=$WORK/config XDG_DATA_HOME=$WORK/data XDG_CACHE_HOME=$WORK/cache
unset DISPLAY WAYLAND_DISPLAY
mkdir -p "$XDG_CONFIG_HOME" "$XDG_DATA_HOME/kwin/scripts" "$XDG_CACHE_HOME"
cp -r "$PKG" "$XDG_DATA_HOME/kwin/scripts/stacklet"
on() { [ "$LAYOUT" = "$1" ] && echo true || echo false; }
cat > "$XDG_CONFIG_HOME/kwinrc" <<EOF
[Plugins]
stackletEnabled=true
[Script-stacklet]
layoutTile=$(on tile)
layoutSpiral=$(on spiral)
layoutMonocle=$(on monocle)
EOF

trap 'kill $(jobs -p) 2>/dev/null; rm -rf "$WORK"' EXIT
kwin_wayland --virtual --width 1600 --height 900 --socket "kwtest-$$" --no-lockscreen --no-global-shortcuts \
    > "$WORK/kwin.log" 2>&1 &
KWIN=$!
sleep 5

fail() { echo "  FAIL: $1"; tail -n 8 "$WORK/kwin.log" | sed 's/^/    kwin: /'; exit 1; }
alive() { kill -0 $KWIN 2>/dev/null || fail "KWin died ($1)"; echo "  KWin alive after $1"; }

echo "layout=$LAYOUT package=$PKG"
alive "startup"
[ "$(qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded stacklet)" = true ] ||
    fail "Stacklet did not load (a pass would mean nothing)"

export QT_NO_XDG_DESKTOP_PORTAL=1 GTK_USE_PORTAL=0 QT_QPA_PLATFORM=wayland WAYLAND_DISPLAY=kwtest-$$

# org.kde.konsole is in the default tile list, org.test.untracked is not
echo "phase 1: $TRACKED tiled windows, 3 open at a time"
python3 "$HERE/churn.py" org.kde.konsole "$TRACKED" 3 > /dev/null 2>&1; alive "phase 1"
echo "phase 2: $UNTRACKED floating windows"
python3 "$HERE/churn.py" org.test.untracked "$UNTRACKED" 3 > /dev/null 2>&1; alive "phase 2"
echo "phase 3: another round of tiled windows, 4 open at a time"
python3 "$HERE/churn.py" org.kde.konsole "$TRACKED" 4 > /dev/null 2>&1; alive "phase 3"

[ "$(qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded stacklet)" = true ] ||
    fail "Stacklet was unloaded during the run"
echo "  OK ($LAYOUT)"
