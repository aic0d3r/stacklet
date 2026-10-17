// Stacklet: master + stack auto-tiling on Plasma's native tiles, for listed apps only.
// Everything else floats. Layout per (screen, virtual desktop): first window left, rest stacked right.

const HORIZONTAL = 1, VERTICAL = 2; // KWin::Tile::LayoutDirection

// Target rects (relative to the screen, 0..1) for n windows.
function slotRects(n, ratio) {
    if (n <= 1) return [{ x: 0, y: 0, width: 1, height: 1 }];
    const rects = [{ x: 0, y: 0, width: ratio, height: 1 }];
    const k = n - 1;
    for (let i = 0; i < k; i++) rects.push({ x: ratio, y: i / k, width: 1 - ratio, height: 1 / k });
    return rects;
}

function clampRatio(r) {
    r = Number(r);
    return r >= 0.15 && r <= 0.85 ? r : 0.55;
}

if (typeof module !== "undefined") module.exports = { slotRects, clampRatio }; // node self-test

if (typeof workspace !== "undefined") {
    const classes = String(readConfig("tileClasses", "kitty,org.kde.konsole,Alacritty,com.mitchellh.ghostty"))
        .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    const defaultRatio = clampRatio(readConfig("masterRatio", 0.55));

    let order = [];             // tracked windows, oldest first; index 0 of a group = master
    const floating = new Set(); // windows the user took out of the layout
    const ratios = {};          // group key -> master width, kept when the user resizes it
    let groups = {};            // group key -> {output, desktop} that we laid out last time
    let busy = false;           // ignore tile changes we cause ourselves

    const key = (o, d) => o.name + "|" + d.id;
    const wanted = w => w.normalWindow && !w.specialWindow && !w.transient &&
        classes.includes(String(w.resourceClass).toLowerCase());
    const tileable = w => !w.deleted && !floating.has(w) && !w.minimized && !w.fullScreen &&
        w.output && w.desktops.length === 1;

    function layOut(output, desktop) {
        const k = key(output, desktop);
        const wins = order.filter(w => tileable(w) && w.output === output && w.desktops[0] === desktop);
        if (!wins.length) return false;
        const root = workspace.rootTile(output, desktop);
        if (!root) return false;
        // keep a master width the user dragged, if the layout is still ours
        if (groups[k] && root.tiles.length === 2 && root.layoutDirection === HORIZONTAL)
            ratios[k] = clampRatio(root.tiles[0].relativeGeometry.width);
        const ratio = ratios[k] || defaultRatio;

        busy = true;
        try {
            for (const t of root.tiles.slice()) t.remove();
            const rects = slotRects(wins.length, ratio);
            let slots = [root];
            if (wins.length > 1) {
                const [master, stack] = root.split(HORIZONTAL);
                slots = [master];
                if (wins.length === 2) slots.push(stack);
                else {
                    stack.split(VERTICAL);
                    while (stack.tiles.length < wins.length - 1) stack.tiles[stack.tiles.length - 1].split(VERTICAL);
                    slots.push(...stack.tiles);
                }
                slots.forEach((t, i) => { t.relativeGeometry = rects[i]; });
            }
            wins.forEach((w, i) => {
                if (w.maximizeMode) w.setMaximize(false, false);
                if (!slots[i].manage(w)) // root.manage can refuse; fall back to filling the work area
                    w.frameGeometry = workspace.clientArea(KWin.MaximizeArea, output, desktop);
            });
        } finally {
            busy = false;
        }
        return true;
    }

    function retileAll() {
        const next = {};
        for (const w of order) if (tileable(w)) next[key(w.output, w.desktops[0])] = { output: w.output, desktop: w.desktops[0] };
        for (const k in next) layOut(next[k].output, next[k].desktop);
        // groups that just lost their last window: nothing to lay out, forget the saved ratio
        for (const k in groups) if (!next[k]) delete ratios[k];
        groups = next;
    }

    function track(w) {
        if (!wanted(w) || order.includes(w)) return;
        order.push(w);
        for (const sig of ["desktopsChanged", "outputChanged", "minimizedChanged", "fullScreenChanged"])
            w[sig].connect(retileAll);
        w.tileChanged.connect(() => {
            // user dragged a tiled window out: let it float instead of snapping it back
            if (!busy && !w.tile && tileable(w)) { floating.add(w); retileAll(); }
        });
    }

    workspace.windowAdded.connect(w => { track(w); retileAll(); });
    workspace.windowRemoved.connect(w => {
        order = order.filter(x => x !== w);
        floating.delete(w);
        retileAll();
    });

    registerShortcut("StackletSetMaster", "Stacklet: Make focused window the main one", "Meta+Shift+Return", () => {
        const w = workspace.activeWindow;
        if (!w || !order.includes(w)) return;
        floating.delete(w);
        order = [w, ...order.filter(x => x !== w)];
        retileAll();
    });

    registerShortcut("StackletToggleFloat", "Stacklet: Float / tile focused window", "Meta+F", () => {
        const w = workspace.activeWindow;
        if (!w || !order.includes(w)) return;
        if (floating.has(w)) floating.delete(w);
        else {
            floating.add(w);
            busy = true;
            if (w.tile) w.tile.unmanage(w);
            busy = false;
        }
        retileAll();
    });

    for (const w of workspace.windowList()) track(w);
    retileAll();
}
