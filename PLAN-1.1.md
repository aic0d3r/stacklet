# Stacklet 1.1 plan

Everything new is off by default (opt-in on the settings page), except where noted.

## From Hyprland

1. **Centered master layout**: main window in the centre, the stack split left and right.
   - With 2 windows, the main window stays centred and the second goes to one side (like Hyprland's `always_center_master`).
   - Portrait screens: same rotation as master and stack (main on top).
   - Added to the layout cycle (Meta+Shift+Space), `desktopLayouts` (`centered`) and the settings preview.
2. **Scratchpad (hidden)**: like Hyprland's special workspace.
   - **Meta+Alt+S** sends the focused window to the scratchpad (press again on a shown scratchpad window to put it back in tiling).
   - **Meta+S** shows or hides it, centred and floating over the current desktop. A shown window follows you to the current desktop.
   - Several windows: each Meta+S press shows the next one, i3-style, and the last press hides it. Only one is on screen at a time.
   - Size: a fixed % of the screen (setting, default 60% × 60%), centred.
   - Hidden only by the key, not when it loses focus.
3. **Smart gaps in monocle**: `smartGaps` already removes the gap for a lone window. Extend it to monocle (every window fills the area). Existing setting, no new key.

## From Scott Jenson's Akademy 2026 talk

4. **Centre width setting**: centered master gets its own width (default 50%), separate from `masterRatio`.
5. **Visible stash**: a centered master mode where the side columns are a narrow strip of small, live windows instead of a full stack. Centered master only; width is a % per side (setting, default 15%).
   - "Make main" swaps a stashed window into the centre.
   - Complements the hidden scratchpad: one hides, the other keeps windows in view.
6. **Focus shortcut, Meta+Alt+C**: makes the focused window the centre and sends every other tiled window to the stash. Pressing it again restores the previous layout. On another layout it switches that screen and desktop to centered + stash first. Shortcut only; a shake gesture is out of scope.
7. **Remember state across restarts**: per-screen/desktop layout switches and dragged widths survive a restart instead of lasting "until restart". The width still resets when a desktop has no tiled windows.
   - The last switch wins: a layout set by shortcut is kept until the next switch. Changing that desktop's layout on the settings page clears it.

## Decided while building

- Saved state: KWin 6.8.2's script API has `readConfig` but no `writeConfig`. Stacklet writes `savedState` (JSON) into its own `[Script-stacklet]` group in kwinrc through plasmashell's `evaluateScript` + `ConfigFile`, and reads it back with `readConfig` at load. Each entry remembers the settings layout of its desktop and is ignored once that changes. Not in `main.xml`, so the settings page never overwrites it.
- Keys: on a fresh Plasma, Meta+Alt+S is the screen reader toggle (`org.kde.screenreader`), so sending to the scratchpad is **Meta+Ctrl+S** (Meta+Alt+Shift+S was too awkward for a key next to Meta+S). Meta+S, Meta+Ctrl+S and Meta+Alt+C are free. `tests/shortcuts/run.sh` checks all three.

## Tests to extend

- `test.js`: centered master math (2, 3, 4, 6 windows, portrait, stash widths).
- `tests/layouts/run.sh`: centered shape check.
- `tests/shortcuts/run.sh`: scratchpad, focus and stash shortcuts.
- `tests/stress/run.sh`: run centered and the scratchpad (opening and closing hidden windows is a likely crash spot).
