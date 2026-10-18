# Stacklet

Tiny auto-tiling KWin script for Plasma 6.8+, built on Plasma's native tiles.

- Only the apps you list get tiled (default: kitty, Konsole, Alacritty, Ghostty, foot, WezTerm). Everything else floats. Or tick "Tile every window" and the list becomes an exclude list.
- Three layouts, picked on the settings page with a preview: **master and stack** (first window on the left or right, the rest stacked beside it), **spiral** (each new window takes half of the space left) and **monocle** (one window fills the screen). Set a starting layout, or one per virtual desktop, and switch on the fly. One window always fills the screen.
- Settings: main width, side, 1–2 main windows, where new windows land, gap, and screens/desktops where tiling is off.
- Portrait screens get the layout turned 90°: main window on top, the rest side by side below. It re-tiles when you rotate a screen.
- Pin apps as "always main" (e.g. keep a browser big, terminals beside it). After closing a window, focus moves to the tile before it.
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
| Meta+Shift+Space | Switch layout (master and stack, spiral, monocle) for this screen and desktop, until restart |
| Meta+Shift+M | Monocle on / off for this screen and desktop: every tiled window fills the area, the focused one on top |
| Meta+Alt+. / Meta+Alt+, | Focus the next / previous tiled window (use this to cycle in monocle) |
| Meta+Alt+R / Meta+Alt+Shift+R | Rotate the stack forwards / backwards |
| Drag a window onto another tile | Swap the two |

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

Checks the layout math.

```sh
tests/stress/run.sh            # or: tests/stress/run.sh spiral
```

Crash stress test: runs Stacklet in a private virtual KWin (its own D-Bus session, config and script folder, your session is not touched) and opens and closes a few hundred windows in each layout. It fails if KWin dies. Needs `kwin_wayland`, `dbus-run-session`, `qdbus6` and python3 with PyQt6. It exists because holding windows in a `WeakSet`/`WeakMap` crashed KWin when a window closed.

```sh
tests/layouts/run.sh            # where do 2, 3, 4 and 6 windows end up in each layout?
```

Same private virtual KWin. It prints every window's position and fails if a layout has the wrong shape (for example monocle not stacking windows). To reproduce a setup, pass your own kwinrc section: `KWINRC=$'[Script-stacklet]\nlayoutSpiral=true' tests/layouts/run.sh - 5`.

The rest (shortcuts, the settings page) is checked by hand in a live Plasma session.

## Known limits

- Windows on all desktops, minimized or fullscreen are left alone.
- Settings apply when the script is loaded: turn Stacklet off and on in KWin Scripts after changing them.
- Spiral looks the same as master and stack until the fourth window.
- Stacklet replaces the Meta+T tile layout on every desktop where it tiles a window.
