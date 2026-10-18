# KDE Store listing

Everything to paste into the store form, plus the files to upload.

## Files to upload

- **File:** `build/stacklet-1.0.0.kwinscript` (build it with `./package.sh`)
- **Screenshots:** `store/screenshot-tiling.png`, `store/screenshot-settings.png`
- **Icon:** the store picks the one from `metadata.json` (`view-split-left-right`); no file needed.

## Category

Linux/Unix Desktops → Window Managers → KWin → **KWin scripts** (Plasma 6 section).

## Name

Stacklet

## Summary (one line)

Auto-tiling for your terminals on Plasma's own tiles: master and stack, spiral or monocle.

## Description

Stacklet tiles the apps you choose into a main window plus a stack, and leaves everything
else floating. It drives Plasma's native tiles, so resizing, Meta+T layouts and per-desktop
tile layouts keep working.

- Three layouts, with a preview when you pick one:
  - **Master and stack**: a main window, the rest stacked beside it. 2 to 4 terminals.
  - **Spiral**: each new window takes half of the space left. Many terminals on a big screen.
  - **Monocle**: one window fills the area, cycle through the others. Small screens, or one
    job per desktop.
- Only the apps you list get tiled (terminals by default). Or tile everything and list the
  apps to leave alone.
- Pin an app as "always main", so a browser or editor stays big with terminals beside it.
- Portrait screens get the layout turned 90 degrees, and it re-tiles when you rotate.
- Gaps, with no gap around a lone window. Drag the border between tiles to resize.
- Per-screen and per-desktop layouts, and screens or desktops where tiling stays off.

Shortcuts (all changeable in System Settings → Shortcuts → KWin):

| Key | Action |
| --- | --- |
| Meta+Shift+Return | Make the focused window main |
| Meta+F | Float or re-tile the focused window |
| Meta+Shift+Space | Switch layout |
| Meta+Shift+M | Monocle on / off |
| Meta+Alt+. / Meta+Alt+, | Focus next / previous window |
| Meta+Alt+Shift+arrows | Swap with a neighbour |
| Meta+Alt+] / Meta+Alt+[ | Grow / shrink the main window |
| Meta+Alt+R | Rotate the stack |
| Meta+Shift+A | Tile or untile this app until restart, and show its window class |
| Drag onto another tile | Swap the two |

Install, then enable **Stacklet** under System Settings → Window Management → KWin Scripts.
Settings are behind the gear icon there; turn the script off and on to apply them.

Do not run it together with another tiling script (Krohnkite, Polonium, …).

Requires Plasma 6.8 or later. GPL-3.0-or-later.

## Tags

tiling, window management, terminals, productivity, tiling window manager, kwin script

## Changelog 1.0.0

First public release: master and stack, spiral and monocle layouts with previews; app list or
tile-everything; always-main apps; gaps with smart gaps; portrait screens; per-desktop layouts;
screens and desktops where tiling is off; drag to swap; keyboard resize, rotate, focus and swap;
focus after close; a stress test that runs the script in a private virtual KWin.

## Before uploading

- Fill in `Website` in `package/metadata.json` once the repository has a public URL, and rebuild.
- Upload the `.kwinscript` file, not a zip of the repository.
