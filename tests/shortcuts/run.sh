#!/bin/bash
# Shortcut check. Runs Stacklet in a private, virtual KWin (own D-Bus session, config and script folder;
# your real session is not touched), opens four windows, fires every Stacklet shortcut through
# kglobalaccel and checks what happened to the windows. Prints one ok/FAIL line per shortcut.
#
#   tests/shortcuts/run.sh

set -u
HERE=$(cd "$(dirname "$0")" && pwd)

if [ "${STACKLET_SC_INNER:-}" != 1 ]; then
    STACKLET_SC_INNER=1 exec timeout 240 dbus-run-session -- "$0"
fi

. "$HERE/../common.sh"
# What 1.0.0 left behind on upgraded machines: the old key saved under the old id.
printf '[kwin]\nStackletToggleApp=Meta+Shift+A,none,Stacklet: Tile / untile this app (shows its window class)\n' > "$XDG_CONFIG_HOME/kglobalshortcutsrc"
start_kwin

python3 "$HERE/../layouts/hold.py" org.kde.konsole 4 200 > /dev/null 2>&1 &
sleep 8
bad=0
WORK=$WORK python3 "$HERE/check.py" || bad=1
# plasmashell doesn't run here, so Stacklet must not call it (every failed call is a warning in KWin's log)
if kwin_log | grep -q "org.kde.plasmashell"; then
    echo "!! Stacklet called plasmashell although it isn't running, e.g.:"; kwin_log | grep "org.kde.plasmashell" | head -3 | sed 's/^/   /'; bad=1
fi
[ $bad -eq 0 ] && echo PASS || echo FAIL
exit $bad
