# Stacklet

Tiny auto-tiling KWin script for Plasma 6.8+, built on Plasma's native tiles.

- Only the apps you list get tiled (default: kitty, Konsole, Alacritty, Ghostty, foot, WezTerm). Everything else floats. Or tick "Tile every window" and the list becomes an exclude list.
- First window takes the left side (or right), the rest stack on the other side. One window fills the screen.
- Settings: main width, side, 1–2 main windows, where new windows land, gap, and screens/desktops where tiling is off.
- Portrait screens get the layout turned 90°: main window on top, the rest side by side below. It re-tiles when you rotate a screen.
- Separate layout per screen and virtual desktop.
- Resize by dragging the border between tiles; the width sticks until that desktop has no tiled windows.

| Key | Action |
| --- | --- |
| Meta+Shift+Return | Make the focused window the main one |
| Meta+F | Float / re-tile the focused window (dragging a tile out also floats it) |
| Meta+Shift+A | Tile / untile the focused window's app until restart; the on-screen note shows its window class for the settings list |
| Meta+Alt+arrows | Focus the neighbouring tile (KWin's own shortcut) |
| Meta+Alt+Shift+arrows | Swap with the neighbouring tile |
| Meta+Alt+] / Meta+Alt+[ | Grow / shrink the main window by 5% |

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
