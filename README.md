# Stacklet

Tiny auto-tiling KWin script for Plasma 6.8+, built on Plasma's native tiles.

- Only the apps you list get tiled (default: kitty, Konsole, Alacritty, Ghostty). Everything else floats.
- First window takes the left side, the rest stack on the right. One window fills the screen.
- Separate layout per screen and virtual desktop.
- Resize by dragging the border between tiles; the width sticks until that desktop has no tiled windows.

| Key | Action |
| --- | --- |
| Meta+Shift+Return | Make the focused window the main one |
| Meta+F | Float / re-tile the focused window (dragging a tile out also floats it) |

## Install

```sh
kpackagetool6 -t KWin/Script -i package        # first time
kpackagetool6 -t KWin/Script -u package        # update
```

Then enable **Stacklet** in System Settings → Window Management → KWin Scripts. Settings (apps, main width) are under the gear icon there; turn the script off and on to apply them.

Don't run it together with another tiling script (Kröhnkite, Polonium, …).

## Test

```sh
node test.js
```

Checks the layout math. The KWin side needs a live Plasma session.

## Known limits

- Windows on all desktops, minimized or fullscreen are left alone.
- Stacklet replaces the Meta+T tile layout on every desktop where it tiles a window.
