#!/bin/bash
# Dialog check. Runs Stacklet in a private, virtual KWin (own D-Bus session, config and script folder;
# your real session is not touched), opens two normal windows plus dialogs, an About box, a tool window
# a fixed-size window and an invisible helper window (hidden from taskbar and switcher) from a tiled app, and checks that only the normal windows get a tile
# (plus a dialog without a parent: Wayland can't tell it from a normal window, see README Known limits).
# Runs twice: default settings (app list) and "Tile every window".
#
#   tests/dialogs/run.sh
#
# Output per window: "caption  tiled|floating  normal= transient= dialog= resizeable=".
# A line that starts with "!!" means a window was tiled (or left floating) when it should not be.

set -u
HERE=$(cd "$(dirname "$0")" && pwd)
PKG=${PKG:-$HERE/../../package}

if [ "${STACKLET_DIALOG_INNER:-}" != 1 ]; then
    bad=0
    for mode in list all; do
        STACKLET_DIALOG_INNER=1 timeout 120 dbus-run-session -- "$0" "$mode" || bad=1
    done
    [ $bad -eq 0 ] && echo "PASS" || echo "FAIL"
    exit $bad
fi

MODE=$1
WORK=$(mktemp -d)
export XDG_CONFIG_HOME=$WORK/config XDG_DATA_HOME=$WORK/data XDG_CACHE_HOME=$WORK/cache
unset DISPLAY WAYLAND_DISPLAY
mkdir -p "$XDG_CONFIG_HOME" "$XDG_DATA_HOME/kwin/scripts" "$XDG_CACHE_HOME"
cp -r "$PKG" "$XDG_DATA_HOME/kwin/scripts/stacklet"
if [ "$MODE" = all ]; then
    APP=org.example.anyapp  # not in the list, so only "Tile every window" tiles it
    printf '[Plugins]\nstackletEnabled=true\n[Script-stacklet]\ntileAll=true\n' > "$XDG_CONFIG_HOME/kwinrc"
else
    APP=org.kde.konsole     # in the default list
    printf '[Plugins]\nstackletEnabled=true\n' > "$XDG_CONFIG_HOME/kwinrc"
fi

trap 'kill $(jobs -p) 2>/dev/null; rm -rf "$WORK"' EXIT
kwin_wayland --virtual --width 1600 --height 900 --socket "kwdialog-$$" --no-lockscreen --no-global-shortcuts \
    > "$WORK/kwin.log" 2>&1 &
KWIN=$!
sleep 5
[ "$(qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded stacklet)" = true ] || { echo "Stacklet did not load"; exit 1; }

export QT_NO_XDG_DESKTOP_PORTAL=1 GTK_USE_PORTAL=0 QT_QPA_PLATFORM=wayland WAYLAND_DISPLAY=kwdialog-$$
python3 "$HERE/windows.py" "$APP" 20 > /dev/null 2>&1 &
sleep 8

# after it is tiled, like Video Bridge setting its state on an already mapped window
printf '%s\n' 'const g = workspace.windowList().find(w => w.caption === "ghost"); g.skipTaskbar = true; g.skipSwitcher = true; g.opacity = 0;' > "$WORK/ghost.js"
qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "$WORK/ghost.js" ghost > /dev/null
qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.start > /dev/null
sleep 2

cat > "$WORK/dump.js" <<'EOF'
print("DUMP " + workspace.windowList().filter(w => w.caption).map(w =>
    [w.caption, w.tile ? "tiled" : "floating", "normal=" + w.normalWindow, "transient=" + w.transient,
     "dialog=" + w.dialog, "resizeable=" + w.resizeable, "skip=" + (w.skipTaskbar && w.skipSwitcher)].join(" ")).join(" ; "));
EOF
qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "$WORK/dump.js" dump > /dev/null
qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.start > /dev/null
sleep 1
kill -0 $KWIN 2>/dev/null || { echo "KWin died"; exit 1; }
LINE=$( { journalctl --user -b --no-pager "_PID=$KWIN" 2>/dev/null; cat "$WORK/kwin.log"; } | grep -o "DUMP .*" | tail -1 | sed 's/^DUMP //')
[ -n "$LINE" ] || { echo "!! no window dump came back, so nothing was checked"; exit 1; }

echo "== $MODE ($APP)"
fail=0; seen=0
while read -r caption state rest; do
    [ -n "$caption" ] || continue
    seen=$((seen + 1))
    printf '  %-18s %-9s %s\n' "$caption" "$state" "$rest"
    # Known limit: on Wayland a dialog without a parent is a plain normal window (dialog=false), so it tiles.
    case "$caption" in normal-*|dialog-parentless) want=tiled ;; *) want=floating ;; esac
    [ "$state" = "$want" ] || { echo "!! $caption should be $want"; fail=1; }
done <<< "$(echo "$LINE" | tr ';' '\n' | sed 's/^ *//')"
[ $seen -ge 9 ] || { echo "!! expected 9 windows, saw $seen"; fail=1; }
exit $fail
