#!/bin/bash
# stacklet-keys check. Starts Stacklet with "Use Meta+arrows" in a private, virtual KWin (own D-Bus session, so
# kglobalaccel and its saved keys are private too; your real session is not touched) and runs the bundled
# stacklet-keys against it:
#   on:  KWin's Quick Tile and Move to Screen keys are cleared, and Meta+arrows reach Stacklet's shortcuts. Keys of
#        your own stay: a second one on an action, another action cleared by hand.
#   off: only the keys `on` cleared come back; a key you gave one of them since stays
#
#   tests/keys/run.sh
#
# A line that starts with "!!" means a key is not where it should be.

set -u
HERE=$(cd "$(dirname "$0")" && pwd)

if [ "${STACKLET_KEYS_INNER:-}" != 1 ]; then
    STACKLET_KEYS_INNER=1 exec timeout 120 dbus-run-session -- "$0"
fi

KWINRC=$'[Script-stacklet]\nwelcomed=true\nshowOsd=false\nmetaArrows=true'
. "$HERE/../common.sh"
start_kwin

K="gdbus call --session -d org.kde.kglobalaccel -o /kglobalaccel"
META=268435456 SHIFT=33554432 UP=16777235 LEFT=16777234
TOP="['kwin','Window Quick Tile Top','KWin','Quick Tile Window to the Top']"
BOTTOM="['kwin','Window Quick Tile Bottom','KWin','Quick Tile Window to the Bottom']"
RIGHT_ACTION="['kwin','Window Quick Tile Right','KWin','Quick Tile Window to the Right']"
LEFT_ACTION="['kwin','Window Quick Tile Left','KWin','Quick Tile Window to the Left']"
FOCUS_LEFT="['kwin','StackletFocusLeft','KWin','Stacklet: Focus window left']"
NEXT="['kwin','Window to Next Screen','KWin','Move Window to Next Screen']"
keys() { $K -m org.kde.KGlobalAccel.shortcut "$1" | grep -o '[0-9]\+' | sort -n | paste -sd, | sed 's/.*/[&]/'; } # the keys of an action, as a list (sorted: kglobalaccel's order varies)
owners() { $K -m org.kde.KGlobalAccel.getGlobalShortcutsByKey "$1" | grep -o "('[^']*'" | tr -d "('" | sort | tr '\n' ' ' | sed 's/ $//'; } # the actions a key reaches
set_own() { $K -m org.kde.KGlobalAccel.setShortcut "$1" "$2" 6 > /dev/null; }
keys_tool() { script -qec "bash '$PKG/contents/stacklet-keys' $1" /dev/null; } # on a terminal, as a user runs it: no notification, which has no service here
bad=0
check() { printf '%-50s %s\n' "$1" "$2"; [ "$2" = "$3" ] || { echo "!! $1: expected $3"; bad=1; }; }
own="[$((SHIFT + 65)),$((META + UP))]" # Quick Tile Top: Plasma's key plus one of your own (Shift+A)
both_left="StackletFocusLeft Window Quick Tile Left" # KWin's key not cleared yet: both actions hold Meta+Left

# keys of your own: a second one on Quick Tile Top, Quick Tile Bottom cleared by hand
set_own "$TOP" "[$((META + UP)), $((SHIFT + 65))]"
set_own "$BOTTOM" "[]"
check "before: Meta+Left reaches both KWin and Stacklet" "$(owners $((META + LEFT)))" "$both_left"
check "before: Shift+A on Quick Tile Top (your own)" "$(keys "$TOP")" "$own"
check "before: Quick Tile Bottom cleared by hand" "$(keys "$BOTTOM")" "[]"

keys_tool on
check "on: Meta+Left reaches Stacklet's focus shortcut" "$(owners $((META + LEFT)))" "StackletFocusLeft"
check "on: Meta+Shift+Left reaches Stacklet's swap shortcut" "$(owners $((META + SHIFT + LEFT)))" "StackletSwapWindowLeft"
check "on: Quick Tile Left is cleared" "$(keys "$LEFT_ACTION")" "[]"
check "on: Move Window to Next Screen is cleared" "$(keys "$NEXT")" "[]"
check "on: Shift+A on Quick Tile Top is kept" "$(keys "$TOP")" "$own"
check "on: Meta+Up still reaches KWin's Quick Tile too" "$(owners $((META + UP)))" "StackletFocusUp Window Quick Tile Top"
check "on: Quick Tile Bottom stays cleared" "$(keys "$BOTTOM")" "[]"
set_own "$RIGHT_ACTION" "[$((SHIFT + 66))]" # a key you give an action afterwards

keys_tool off
check "off: Meta+Left reaches KWin's Quick Tile again" "$(owners $((META + LEFT)))" "Window Quick Tile Left"
check "off: Meta+Shift+Left reaches Move to Previous Screen" "$(owners $((META + SHIFT + LEFT)))" "Window to Previous Screen"
check "off: Stacklet's focus shortcut has no key" "$(keys "$FOCUS_LEFT")" "[]"
check "off: Shift+A on Quick Tile Top is still yours" "$(keys "$TOP")" "$own"
check "off: Quick Tile Bottom stays cleared (not by stacklet-keys)" "$(keys "$BOTTOM")" "[]"
check "off: the key you gave Quick Tile Right stays" "$(keys "$RIGHT_ACTION")" "[$((SHIFT + 66))]"
[ -f "$XDG_STATE_HOME/stacklet/keys" ] && { echo "!! the list of cleared keys is still there"; bad=1; }
[ $bad -eq 0 ] && echo PASS || echo FAIL
exit $bad
