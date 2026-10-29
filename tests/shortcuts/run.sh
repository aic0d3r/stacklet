#!/bin/bash
# Shortcut check. Runs Stacklet in a private, virtual KWin (own D-Bus session, config and script folder;
# your real session is not touched), opens four windows, fires every Stacklet shortcut through
# kglobalaccel and checks what happened to the windows. Prints one ok/FAIL line per shortcut.
#
#   tests/shortcuts/run.sh

set -u
HERE=$(cd "$(dirname "$0")" && pwd)
PKG=${PKG:-$HERE/../../package}

if [ "${STACKLET_SC_INNER:-}" != 1 ]; then
    STACKLET_SC_INNER=1 exec timeout 240 dbus-run-session -- "$0"
fi

WORK=$(mktemp -d)
export XDG_CONFIG_HOME=$WORK/config XDG_DATA_HOME=$WORK/data XDG_CACHE_HOME=$WORK/cache
unset DISPLAY WAYLAND_DISPLAY
mkdir -p "$XDG_CONFIG_HOME" "$XDG_DATA_HOME/kwin/scripts" "$XDG_CACHE_HOME"
cp -r "$PKG" "$XDG_DATA_HOME/kwin/scripts/stacklet"
printf '[Plugins]\nstackletEnabled=true\n' > "$XDG_CONFIG_HOME/kwinrc"
# What 1.0.0 left behind on upgraded machines: the old key saved under the old id.
printf '[kwin]\nStackletToggleApp=Meta+Shift+A,none,Stacklet: Tile / untile this app (shows its window class)\n' > "$XDG_CONFIG_HOME/kglobalshortcutsrc"

trap 'kill $(jobs -p) 2>/dev/null; rm -rf "$WORK"' EXIT
kwin_wayland --virtual --width 1600 --height 900 --socket "kwsc-$$" --no-lockscreen \
    > "$WORK/kwin.log" 2>&1 &
sleep 5
[ "$(qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded stacklet)" = true ] || { echo "Stacklet did not load"; exit 1; }

export QT_NO_XDG_DESKTOP_PORTAL=1 GTK_USE_PORTAL=0 QT_QPA_PLATFORM=wayland WAYLAND_DISPLAY=kwsc-$$
python3 "$HERE/../layouts/hold.py" org.kde.konsole 4 200 > /dev/null 2>&1 &
sleep 8
WORK=$WORK python3 "$HERE/check.py"
