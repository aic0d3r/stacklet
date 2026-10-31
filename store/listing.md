# KDE Store listing

Everything to paste into the store form, plus the files to upload.

## Files to upload

- **File:** `build/stacklet-1.3.1.kwinscript` (build it with `./package.sh`)
- **Screenshots:** `store/screenshot-tiling.png`, `store/screenshot-settings.png`
- **Icon / logo:** `store/logo-256.png` (source: `store/logo.svg`)
- **GitHub social preview:** `store/social-preview.png` (Settings → Social preview)

## Category

Linux/Unix Desktops → Window Managers → KWin → **KWin scripts** (Plasma 6 section).

## Name

Stacklet

## Summary (one line)

Tiling window manager for KDE Plasma 6: auto-tile your terminals on Plasma's own tiles with master and stack, spiral, dwindle, monocle or centered master, plus a scratchpad.

## Description (plain text only: the store mangles BBCode lists)

Stacklet is a tiling window manager script for KDE Plasma 6 (a KWin script). It tiles the apps you choose into a main window plus a stack, and leaves everything else floating. It drives Plasma's native tiles, so resizing, Meta+T layouts and per-desktop tile layouts keep working.

Five layouts, with a preview when you pick one:

• Master and stack: a main window, the rest stacked beside it. Good for 2 to 4 terminals.

• Spiral: each new window takes half of the space left. Good for many terminals on a big screen.

• Monocle: one window fills the area, cycle through the others. Good for small screens, or one job per desktop.

• Centered master: the main window in the middle, the others in columns on both sides. Good for wide screens. Optionally the side columns become a narrow stash of small, live windows.

• Dwindle, as in Hyprland: a new window splits the focused window's tile, side by side or top and bottom by the tile's shape. Meta+Alt+H / Meta+Alt+V pick the direction for the next window, Meta+Alt+E flips a split, and borders you drag stay put.

More

• Only the apps you list get tiled (terminals by default). Or tile all apps: system apps, password managers, file pickers and "Configure" dialogs stay floating, and so do games and media players (each its own checkbox). Add your own apps to "Never tile".

• Dialogs, modal windows and windows that can't be resized always float.

• Pin an app as "always main", so a browser or editor stays big with terminals beside it.

• Portrait screens get the layout turned 90 degrees, and it re-tiles when you rotate.

• Gaps, with no gap around a lone window. Drag the border between tiles to resize. Dragging a window out floats it, or snaps it back if you turn that off.

• Per-screen and per-desktop layouts, and screens or desktops where tiling stays off. A layout switched by shortcut is usually kept after a restart.

• Spotlight: the focused window in the centre, every other window in the stash. Press again to go back.

• Scratchpad: hide windows and call them up centred over any desktop, one at a time.

Shortcuts (all changeable in System Settings → Shortcuts → KWin)

• Meta+Shift+Return: make the focused window main

• Meta+F: float or re-tile the focused window

• Meta+Shift+Space: switch layout

• Meta+Alt+H / Meta+Alt+V: dwindle, next window opens beside / below the focused one

• Meta+Alt+E: dwindle, flip the focused window's split

• Meta+Shift+M: monocle on / off

• Meta+Alt+. / Meta+Alt+,: focus next / previous window

• Meta+Alt+Shift+arrows: swap with a neighbour

• Meta+Alt+] / Meta+Alt+[: grow / shrink the main window

• Meta+Alt+T: rotate the stack

• Meta+Alt+C: spotlight on / off

• Meta+S: show the next scratchpad window, or hide it

• Meta+Ctrl+S: send to the scratchpad (on a shown one: put it back)

• Meta+Alt+A: tile or untile this app (saved), and show its window class

• Drag onto another tile: swap the two

Install, then enable Stacklet under System Settings → Window Management → KWin Scripts. Settings are behind the gear icon there; they apply when you close or leave System Settings.

Do not run it together with another tiling script (Kröhnkite, Polonium, ...).

Requires Plasma 6.8 or later. GPL-3.0-or-later.
Source and bug reports: https://github.com/aic0d3r/stacklet

## Tags

tiling, tiling window manager, window management, kwin script, plasma 6, terminals, i3, productivity

## Changelog 1.3.1

Fixed a window you dragged out and then dropped into a tile: it looked tiled but stayed floating, so the shortcuts ignored it. Grow / shrink main window now says why when it can't act (window not tiled, monocle, one window, or already at its limit).

## Changelog 1.3.0

New dwindle layout (as in Hyprland): a new window splits the focused window's tile, and a closed window's neighbour takes its space. Meta+Alt+H / Meta+Alt+V pick whether the next window opens beside or below the focused one, Meta+Alt+E flips a split, and dragged borders stay put. Modal dialogs and windows that can't be resized now float in every mode. "Tile all apps" also floats KeePassXC, Bitwarden and 1Password; games, launchers and media players have their own checkbox, "Float games and media players". Fixed focus being pulled back to another window after a window closed.

## Changelog 1.2.0

The Apps tab has two lists, "Tile these apps" and "Never tile". "Tile all apps" floats system apps and utilities by default. Meta+Alt+A saves its change. Settings apply when you close or leave System Settings, no more turning Stacklet off and on. A short note on first start, and the Shortcuts tab starts with the five keys to learn first.

## Changelog 1.1.2

Fixed an empty tile taken by an invisible helper window (such as Xwayland Video Bridge): windows hidden from both the taskbar and the task switcher are no longer tiled. New setting under Behaviour: turn off "Dragging a window out of its tile floats it" and a dragged window snaps back when you let go; dropping it on another tile still swaps them, and Meta+F still floats it.

## Changelog 1.1.1

Fixed an empty gap in the layout when a window was on another Activity: Stacklet now only tiles windows on the current Activity and re-tiles when you switch.

## Changelog 1.1.0

New centered master layout (main window in the middle, optional narrow stash columns at the sides), in the layout cycle and per desktop as "centered". Spotlight (Meta+Alt+C): the focused window in the centre, the rest in the stash; press again to go back. Scratchpad: Meta+Ctrl+S hides a window, Meta+S shows the next one centred on top or hides it. Smart gaps also apply in monocle. Layouts switched by shortcut and dragged widths are usually kept after a restart. Settings page: bold section headings, smaller help text.

## Changelog 1.0.1

Fixed two shortcut clashes: "tile / untile this app" (was Meta+Shift+A, Plasma's "previous activity") is now Meta+Alt+A, and "rotate the stack" (was Meta+Alt+R, Spectacle's "Record Screen") is now Meta+Alt+T and Meta+Alt+Shift+T. Upgrading from 1.0.0 picks up the new keys; if you changed these two shortcuts yourself, set them again.

## Changelog 1.0.0

First public release: master and stack, spiral and monocle layouts with previews; app list or
tile-everything; always-main apps; gaps with smart gaps; portrait screens; per-desktop layouts;
screens and desktops where tiling is off; drag to swap; keyboard resize, rotate, focus and swap;
focus after close; a stress test that runs the script in a private virtual KWin.

## Before uploading

- Upload the `.kwinscript` file, not a zip of the repository.
- Repository: https://github.com/aic0d3r/stacklet (set as `Website` in `metadata.json`).
