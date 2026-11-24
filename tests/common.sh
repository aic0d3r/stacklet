# shellcheck shell=bash
# Shared by the tests. Each runs Stacklet in a private, virtual KWin: own D-Bus session (start it inside
# `dbus-run-session -- "$0"`), config, data, cache and state folders, so the real session is not touched.
# Source it from the inner part of a run.sh, after the settings it needs:
#   KWINRC=$'[Script-stacklet]\nwelcomed=true'   # kwinrc text after the [Plugins] line (optional)
#   SIZE=900x1600                                # screen size (default 1600x900)
#   . "$(dirname "$0")/../common.sh"             # sets PKG, WORK and XDG_*; installs the package; writes kwinrc
#   start_kwin --no-global-shortcuts             # extra kwin_wayland options; sets KWIN and WAYLAND_DISPLAY for clients
#   kjs <name> '<script>'                        # runs a one-off KWin script
#   check <tag> '<expected>'                     # dumps the windows under <tag>, prints both, fails unless they match
#   fire StackletMonocle                         # fires a Stacklet shortcut the way a key press does
#   win open w1                                  # open|close|quit a window named by steps.py (started with a fifo on fd 3)

PKG=${PKG:-$(cd "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)/package}
SIZE=${SIZE:-1600x900}
WORK=$(mktemp -d)
# stacklet-keys and kactivitymanagerd keep files in the state folder. QT_FORCE_STDERR_LOGGING: the private KWin logs to
# kwin.log, not to the user's journal.
export XDG_CONFIG_HOME=$WORK/config XDG_DATA_HOME=$WORK/data XDG_CACHE_HOME=$WORK/cache XDG_STATE_HOME=$WORK/state QT_FORCE_STDERR_LOGGING=1
unset DISPLAY WAYLAND_DISPLAY
mkdir -p "$XDG_CONFIG_HOME" "$XDG_DATA_HOME/kwin/scripts" "$XDG_CACHE_HOME" "$XDG_STATE_HOME"
cp -r "$PKG" "$XDG_DATA_HOME/kwin/scripts/stacklet"
printf '[Plugins]\nstackletEnabled=true\n%s' "${KWINRC:-}" > "$XDG_CONFIG_HOME/kwinrc"

trap 'kill $(jobs -p) 2>/dev/null; rm -rf "$WORK"' EXIT

start_kwin() {
    kwin_wayland --virtual --width "${SIZE%x*}" --height "${SIZE#*x}" --socket "kwtest-$$" --no-lockscreen "$@" > "$WORK/kwin.log" 2>&1 &
    KWIN=$!
    sleep 5
    [ "$(qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded stacklet)" = true ] || { echo "Stacklet did not load"; exit 1; }
    export QT_NO_XDG_DESKTOP_PORTAL=1 GTK_USE_PORTAL=0 QT_QPA_PLATFORM=wayland WAYLAND_DISPLAY=kwtest-$$
}

kjs() {
    echo "$2" > "$WORK/$1.js"
    qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "$WORK/$1.js" "$1" > /dev/null
    qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.start > /dev/null
    sleep 1
}
# what KWin logged (kwin.log; older Qt versions may have gone to the journal instead)
kwin_log() { { journalctl --user -b --no-pager "_PID=$KWIN" 2>/dev/null; cat "$WORK/kwin.log"; }; }
# the windows of the current desktop, by caption: "caption=x,y WxH"
DUMP='const ws = workspace.windowList().filter(w => w.normalWindow && w.desktops[0] === workspace.currentDesktop).sort((a, b) => a.caption < b.caption ? -1 : 1);
print("DUMP" + TAG + " " + ws.map(w => w.caption + "=" + Math.round(w.frameGeometry.x) + "," + Math.round(w.frameGeometry.y) + " " + Math.round(w.frameGeometry.width) + "x" + Math.round(w.frameGeometry.height)).join(" "));'
bad=0 # fail count of the script that sources this file
check() {
    local got
    kjs "$1" "const TAG = '$1'; $DUMP"
    got=$(kwin_log | grep -o "DUMP$1 .*" | tail -1 | cut -d' ' -f2-)
    printf '%-14s %s\n' "$1:" "$got"
    [ "$got" = "$2" ] || { echo "!! expected      $2"; bad=1; }
}
fire() {
    qdbus6 org.kde.kglobalaccel /component/kwin org.kde.kglobalaccel.Component.invokeShortcut "$1" > /dev/null
    sleep 1
}
win() { echo "$1 ${2:-}" >&3; sleep 1.5; }
