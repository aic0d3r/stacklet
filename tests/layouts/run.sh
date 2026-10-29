#!/bin/bash
# Layout check. Runs Stacklet in a private, virtual KWin (own D-Bus session, config and script folder;
# your real session is not touched), opens N windows, and prints where each one ended up.
#
#   tests/layouts/run.sh                    # every layout with 2, 3, 4 and 6 windows
#   tests/layouts/run.sh spiral 4           # one layout, one window count
#   KWINRC=$'[Script-stacklet]\nlayoutSpiral=true\nlayoutTile=false' tests/layouts/run.sh - 5
#        ^ run with your own kwinrc section instead of a preset (layout "-")
#
# Output per run: "layout n=N  : x,y WxH ; ..." in the order the windows were opened. A line that
# starts with "!!" means the shape is not what the layout should produce.

set -u
HERE=$(cd "$(dirname "$0")" && pwd)
PKG=${PKG:-$HERE/../../package}

if [ "${STACKLET_LAYOUT_INNER:-}" != 1 ]; then
    layouts=("${1:-tile spiral monocle centered}"); counts=("${2:-2 3 4 6}")
    bad=0
    for l in ${layouts[@]}; do for n in ${counts[@]}; do
        STACKLET_LAYOUT_INNER=1 timeout 120 dbus-run-session -- "$0" "$l" "$n" || bad=1
    done; done
    [ $bad -eq 0 ] && echo "PASS" || echo "FAIL"
    exit $bad
fi

LAYOUT=$1; N=$2
WORK=$(mktemp -d)
export XDG_CONFIG_HOME=$WORK/config XDG_DATA_HOME=$WORK/data XDG_CACHE_HOME=$WORK/cache
unset DISPLAY WAYLAND_DISPLAY
mkdir -p "$XDG_CONFIG_HOME" "$XDG_DATA_HOME/kwin/scripts" "$XDG_CACHE_HOME"
cp -r "$PKG" "$XDG_DATA_HOME/kwin/scripts/stacklet"
if [ "$LAYOUT" = "-" ]; then
    printf '[Plugins]\nstackletEnabled=true\n%s\n' "${KWINRC:-}" > "$XDG_CONFIG_HOME/kwinrc"
else
    on() { [ "$LAYOUT" = "$1" ] && echo true || echo false; }
    printf '[Plugins]\nstackletEnabled=true\n[Script-stacklet]\nlayoutTile=%s\nlayoutSpiral=%s\nlayoutMonocle=%s\nlayoutCentered=%s\n' \
        "$(on tile)" "$(on spiral)" "$(on monocle)" "$(on centered)" > "$XDG_CONFIG_HOME/kwinrc"
fi

trap 'kill $(jobs -p) 2>/dev/null; rm -rf "$WORK"' EXIT
kwin_wayland --virtual --width 1600 --height 900 --socket "kwlayout-$$" --no-lockscreen --no-global-shortcuts \
    > "$WORK/kwin.log" 2>&1 &
KWIN=$!
sleep 5
[ "$(qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded stacklet)" = true ] || { echo "Stacklet did not load"; exit 1; }

export QT_NO_XDG_DESKTOP_PORTAL=1 GTK_USE_PORTAL=0 QT_QPA_PLATFORM=wayland WAYLAND_DISPLAY=kwlayout-$$
python3 "$HERE/hold.py" org.kde.konsole "$N" 14 > /dev/null 2>&1 &
sleep $((N / 2 + 5))

cat > "$WORK/dump.js" <<'EOF'
const ws = workspace.windowList().filter(w => w.normalWindow).sort((a, b) => a.caption < b.caption ? -1 : 1);
print("DUMP " + ws.map(w => { const g = w.frameGeometry; return Math.round(g.x) + "," + Math.round(g.y) + " " + Math.round(g.width) + "x" + Math.round(g.height); }).join(" ; "));
EOF
qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "$WORK/dump.js" dump > /dev/null
qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.start > /dev/null
sleep 1
kill -0 $KWIN 2>/dev/null || { echo "KWin died"; exit 1; }
# the script's print() goes to the journal (or kwin.log when not run under systemd)
LINE=$( { journalctl --user -b --no-pager "_PID=$KWIN" 2>/dev/null; cat "$WORK/kwin.log"; } | grep -o "DUMP .*" | tail -1 | sed 's/^DUMP //')
[ -n "$LINE" ] || { echo "!! no window dump came back, so nothing was checked"; exit 1; }
printf '%-8s n=%-2s: %s\n' "$LAYOUT" "$N" "$LINE"

# Shape check: how many distinct window rectangles, and whether monocle really stacks them
distinct=$(echo "$LINE" | tr ';' '\n' | sed 's/^ *//; s/ *$//' | sort -u | wc -l)
case "$LAYOUT" in
    monocle) [ "$N" -gt 1 ] && [ "$distinct" -ne 1 ] && { echo "!! monocle should give every window the same rectangle, got $distinct"; exit 1; } ;;
    tile|spiral|centered) [ "$distinct" -ne "$N" ] && { echo "!! $LAYOUT should give $N different rectangles, got $distinct"; exit 1; } ;;
esac
# centered: the first window opened (the main one) sits in the middle of the 1600px screen
if [ "$LAYOUT" = centered ] && [ "$N" -gt 1 ]; then
    read -r x _ w _ <<< "$(echo "$LINE" | cut -d';' -f1 | tr ',x' '  ')"
    [ $((x + w / 2)) -eq 800 ] || { echo "!! centered main window is not in the middle: x=$x width=$w"; exit 1; }
fi
exit 0
