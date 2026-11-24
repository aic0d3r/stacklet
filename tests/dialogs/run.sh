#!/bin/bash
# Dialog check. Runs Stacklet in a private, virtual KWin (own D-Bus session, config and script folder;
# your real session is not touched), opens two normal windows plus dialogs, an About box, a tool window
# a fixed-size window and an invisible helper window (hidden from taskbar and switcher) from a tiled app, and checks that only the normal windows get a tile
# (plus a dialog without a parent: Wayland can't tell it from a normal window, see README Known limits).
# Modal dialogs and fixed-size windows float in every mode, also without a parent.
# Runs four times: default settings (app list), "Tile all apps", and "Tile all apps" with an mpv window
# and "Float games and media players" off (mpv tiles) and on (mpv floats).
#
#   tests/dialogs/run.sh
#
# Output per window: "caption  tiled|floating  normal= transient= dialog= resizeable=".
# A line that starts with "!!" means a window was tiled (or left floating) when it should not be.

set -u
HERE=$(cd "$(dirname "$0")" && pwd)

if [ "${STACKLET_DIALOG_INNER:-}" != 1 ]; then
    bad=0
    for mode in list all media-off media-on; do
        STACKLET_DIALOG_INNER=1 timeout 120 dbus-run-session -- "$0" "$mode" || bad=1
    done
    [ $bad -eq 0 ] && echo "PASS" || echo "FAIL"
    exit $bad
fi

MODE=$1
NORMAL=tiled # what the normal windows (and the parentless non-modal dialog) should be
if [ "$MODE" = all ]; then
    APP=org.example.anyapp  # not in the list, so only "Tile all apps" tiles it
    KWINRC=$'[Script-stacklet]\ntileAll=true'
elif [ "${MODE#media-}" != "$MODE" ]; then
    APP=mpv                 # on the games and media list
    [ "$MODE" = media-on ] && MEDIA=true NORMAL=floating || MEDIA=false
    KWINRC=$(printf '[Script-stacklet]\ntileAll=true\nfloatMedia=%s' "$MEDIA")
else
    APP=org.kde.konsole     # in the default list
fi
. "$HERE/../common.sh"
start_kwin --no-global-shortcuts

python3 "$HERE/windows.py" "$APP" 22 > /dev/null 2>&1 &
sleep 10

# after it is tiled, like Video Bridge setting its state on an already mapped window
kjs ghost 'const g = workspace.windowList().find(w => w.caption === "ghost"); g.skipTaskbar = true; g.skipSwitcher = true; g.opacity = 0;'
sleep 1

kjs dump 'print("DUMP " + workspace.windowList().filter(w => w.caption).map(w =>
    [w.caption, w.tile ? "tiled" : "floating", "normal=" + w.normalWindow, "transient=" + w.transient,
     "dialog=" + w.dialog, "modal=" + w.modal, "resizeable=" + w.resizeable, "skip=" + (w.skipTaskbar && w.skipSwitcher)].join(" ")).join(" ; "));'
kill -0 $KWIN 2>/dev/null || { echo "KWin died"; exit 1; }
LINE=$(kwin_log | grep -o "DUMP .*" | tail -1 | sed 's/^DUMP //')
[ -n "$LINE" ] || { echo "!! no window dump came back, so nothing was checked"; exit 1; }

echo "== $MODE ($APP)"
fail=0; seen=0
while read -r caption state rest; do
    [ -n "$caption" ] || continue
    seen=$((seen + 1))
    printf '  %-18s %-9s %s\n' "$caption" "$state" "$rest"
    # Known limit: on Wayland a dialog without a parent is a plain normal window (dialog=false), so it tiles.
    case "$caption" in normal-*|dialog-parentless) want=$NORMAL ;; *) want=floating ;; esac
    [ "$state" = "$want" ] || { echo "!! $caption should be $want"; fail=1; }
done <<< "$(echo "$LINE" | tr ';' '\n' | sed 's/^ *//')"
[ $seen -ge 11 ] || { echo "!! expected 11 windows, saw $seen"; fail=1; }
exit $fail
