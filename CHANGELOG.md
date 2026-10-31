# Changelog

## Unreleased

- Fixed: maximizing a tiled window (for example double-clicking a browser's tab strip) took it out of the layout for good, so after unmaximizing it floated and the Stacklet shortcuts ignored it. Only dragging a window out floats it now; anything else puts it straight back in its tile. Monocle (Meta+Shift+M) is the way to fill the screen.

## 1.3.1

- Grow / shrink main window (Meta+Alt+] / Meta+Alt+[) now shows an on-screen message when it can't act: the focused window isn't tiled, the layout is monocle, there's only one window, or the main window is already at its largest or smallest size.
- Fixed: a window you dragged out (so it floated) and then dropped into a tile looked tiled but stayed floating, so the Stacklet shortcuts ignored it. Dropping it into a tile now tiles it again.

## 1.3.0

- New fifth layout, **dwindle** (as in Hyprland): a new window splits the focused window's tile, and a closed window's neighbour takes its space. Pick it on the settings page or with Meta+Shift+Space.
- Split keys for dwindle: Meta+Alt+H / Meta+Alt+V open the next window beside / below the focused one, and Meta+Alt+E flips its split. Borders you drag between dwindle windows stay put.
- Modal dialogs and windows that can't be resized now float in every mode, also when the app opens them without a parent.
- "Tile all apps" floats KeePassXC, Bitwarden, 1Password and Stacklet's own settings page too. Steam, game launchers, Windows (.exe) apps and media players moved to their own checkbox, "Float games and media players" (on by default), so you can tile them and keep system apps floating.
- Fixed: after a window closed, the next window you focused could get focus pulled back to another one.

## 1.2.0

- The Apps tab has two lists: "Tile these apps" and "Never tile". The one "Tile all apps" doesn't use is greyed out. Before, one list meant opposite things depending on the checkbox, so ticking it made your terminals float.
- "Tile all apps" now floats system apps and utilities by default: System Settings, file pickers, prompts, games, viewers, media players and "Configure …" dialogs. Untick "Float system apps and utilities" for the old behaviour.
- Meta+Alt+A saves its change instead of lasting until restart.
- No more turning Stacklet off and on: settings apply when you close or leave System Settings.
- The first start shows a short note on what gets tiled. The Shortcuts tab starts with the five keys to learn first, and the Apps tab explains why a window might not tile.
- Upgrading with "Tile every window" on: your old exclude list moves to "Never tile" on the first start (with plasmashell running).

## 1.1.2

- Fixed an empty tile taken by an invisible helper window (such as Xwayland Video Bridge): windows hidden from both the taskbar and the task switcher are no longer tiled.
- New setting under Behaviour: turn off "Dragging a window out of its tile floats it" and a dragged window snaps back when you let go; dropping it on another tile still swaps them, and Meta+F still floats it.

## 1.1.1

- Fixed an empty gap in the layout when a window was on another Activity: Stacklet now only tiles windows on the current Activity and re-tiles when you switch.

## 1.1.0

- New centered master layout (main window in the middle, optional narrow stash columns at the sides), in the layout cycle and per desktop as "centered".
- Spotlight (Meta+Alt+C): the focused window in the centre, the rest in the stash; press again to go back.
- Scratchpad: Meta+Ctrl+S hides a window, Meta+S shows the next one centred on top or hides it.
- Smart gaps also apply in monocle. Layouts switched by shortcut and dragged widths are usually kept after a restart.
- Settings page: bold section headings, smaller help text.

## 1.0.1

- Fixed two shortcut clashes: "tile / untile this app" (was Meta+Shift+A, Plasma's "previous activity") is now Meta+Alt+A, and "rotate the stack" (was Meta+Alt+R, Spectacle's "Record Screen") is now Meta+Alt+T and Meta+Alt+Shift+T. Upgrading from 1.0.0 picks up the new keys; if you changed these two shortcuts yourself, set them again.

## 1.0.0

- First public release: master and stack, spiral and monocle layouts with previews; app list or tile-everything; always-main apps; gaps with smart gaps; portrait screens; per-desktop layouts; screens and desktops where tiling is off; drag to swap; keyboard resize, rotate, focus and swap; focus after close; a stress test that runs the script in a private virtual KWin.
