# KDE Store listing

Everything to paste into the store form, plus the files to upload.

## Files to upload

- **File:** `build/stacklet-1.1.2.kwinscript` (build it with `./package.sh`)
- **Screenshots:** `store/screenshot-tiling.png`, `store/screenshot-settings.png`
- **Icon / logo:** `store/logo-256.png` (source: `store/logo.svg`)
- **GitHub social preview:** `store/social-preview.png` (Settings → Social preview)

## Category

Linux/Unix Desktops → Window Managers → KWin → **KWin scripts** (Plasma 6 section).

## Name

Stacklet

## Summary (one line)

Tiling window manager for KDE Plasma 6: auto-tile your terminals on Plasma's own tiles with master and stack, spiral, monocle or centered master, plus a scratchpad.

## Description (plain text only: the store mangles BBCode lists)

Stacklet is a tiling window manager script for KDE Plasma 6 (a KWin script). It tiles the apps you choose into a main window plus a stack, and leaves everything else floating. It drives Plasma's native tiles, so resizing, Meta+T layouts and per-desktop tile layouts keep working.

Four layouts, with a preview when you pick one:

• Master and stack: a main window, the rest stacked beside it. Good for 2 to 4 terminals.

• Spiral: each new window takes half of the space left. Good for many terminals on a big screen.

• Monocle: one window fills the area, cycle through the others. Good for small screens, or one job per desktop.

• Centered master: the main window in the middle, the others in columns on both sides. Good for wide screens. Optionally the side columns become a narrow stash of small, live windows.

More

• Only the apps you list get tiled (terminals by default). Or tile everything and list the apps to leave alone.

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

• Meta+Shift+M: monocle on / off

• Meta+Alt+. / Meta+Alt+,: focus next / previous window

• Meta+Alt+Shift+arrows: swap with a neighbour

• Meta+Alt+] / Meta+Alt+[: grow / shrink the main window

• Meta+Alt+T: rotate the stack

• Meta+Alt+C: spotlight on / off

• Meta+S: show the next scratchpad window, or hide it

• Meta+Ctrl+S: send to the scratchpad (on a shown one: put it back)

• Meta+Alt+A: tile or untile this app until restart, and show its window class

• Drag onto another tile: swap the two

Install, then enable Stacklet under System Settings → Window Management → KWin Scripts. Settings are behind the gear icon there; turn the script off and on to apply them.

Do not run it together with another tiling script (Kröhnkite, Polonium, ...).

Requires Plasma 6.8 or later. GPL-3.0-or-later.
Source and bug reports: https://github.com/aic0d3r/stacklet

## Tags

tiling, tiling window manager, window management, kwin script, plasma 6, terminals, i3, productivity

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
