// Stacklet: master + stack auto-tiling on Plasma's native tiles, for listed apps only.
// Everything else floats. Layout per (screen, virtual desktop): main window(s) on one side, rest stacked on the other.

const HORIZONTAL = 1, VERTICAL = 2; // KWin::Tile::LayoutDirection

// Target rects (relative to the screen, 0..1) for n windows: `main` windows stacked in one column,
// the rest in the other. `mirror` puts the main column on the right.
function slotRects(n, ratio, main = 1, mirror = false) {
    if (n <= 1) return [{ x: 0, y: 0, width: 1, height: 1 }];
    const m = Math.max(1, Math.min(main, n - 1)), k = n - m;
    const rects = [];
    for (let i = 0; i < m; i++) rects.push({ x: 0, y: i / m, width: ratio, height: 1 / m });
    for (let i = 0; i < k; i++) rects.push({ x: ratio, y: i / k, width: 1 - ratio, height: 1 / k });
    return mirror ? rects.map(r => ({ ...r, x: 1 - r.x - r.width })) : rects;
}

function clampRatio(r) {
    r = Number(r);
    return r >= 0.15 && r <= 0.85 ? r : 0.55;
}

// Index of the rect nearest to rects[i] in direction dir ("left"|"right"|"up"|"down"), or -1.
function pickNeighbor(rects, i, dir) {
    const c = r => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
    const a = c(rects[i]);
    let best = -1, bestScore = Infinity;
    rects.forEach((r, j) => {
        if (j === i) return;
        const b = c(r), dx = b.x - a.x, dy = b.y - a.y;
        const along = { left: -dx, right: dx, up: -dy, down: dy }[dir];
        if (along <= 0) return;
        const score = along + 2 * Math.abs(dir === "left" || dir === "right" ? dy : dx); // prefer straight neighbours
        if (score < bestScore) { bestScore = score; best = j; }
    });
    return best;
}

if (typeof module !== "undefined") module.exports = { slotRects, clampRatio, pickNeighbor }; // node self-test

if (typeof workspace !== "undefined") {
    const list = s => String(s).split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
    const classes = list(readConfig("tileClasses", "kitty,org.kde.konsole,Alacritty,com.mitchellh.ghostty,foot,org.wezfurlong.wezterm"));
    const tileAll = String(readConfig("tileAll", false)) === "true"; // then `classes` is an exclude list
    const defaultRatio = clampRatio(readConfig("masterRatio", 0.55));
    const mirror = Number(readConfig("mainSide", 0)) === 1;
    const mainCount = Math.max(1, Math.min(2, Number(readConfig("maxMain", 1)) || 1));
    const newWindow = Number(readConfig("newWindow", 0)); // 0 stack bottom, 1 stack top, 2 becomes main
    const gap = Math.max(0, Number(readConfig("gap", 0)) || 0);
    const offScreens = list(readConfig("disabledScreens", ""));
    const offDesktops = list(readConfig("disabledDesktops", ""));
    const overrides = new Map(); // class -> tile it? Set by the per-app toggle shortcut, lasts until restart.

    let order = [];             // tracked windows, oldest first; index 0 of a group = master
    const floating = new Set(); // windows the user took out of the layout
    const hooked = new WeakSet();
    const ratios = {};          // group key -> master width, kept when the user resizes it
    let groups = {};            // group key -> {output, desktop} that we laid out last time
    let busy = false;           // ignore tile changes we cause ourselves

    const key = (o, d) => o.name + "|" + d.id;
    const cls = w => String(w.resourceClass).toLowerCase();
    const listed = c => overrides.has(c) ? overrides.get(c) : classes.includes(c) !== tileAll;
    const wanted = w => w.normalWindow && !w.specialWindow && !w.transient &&
        (!tileAll || w.resizeable) && listed(cls(w));
    const tileable = w => !w.deleted && !floating.has(w) && !w.minimized && !w.fullScreen &&
        w.output && w.desktops.length === 1 &&
        !offScreens.includes(String(w.output.name).toLowerCase()) &&
        !offDesktops.includes(String(w.desktops[0].x11DesktopNumber));
    const groupOf = (output, desktop) => order.filter(w => tileable(w) && w.output === output && w.desktops[0] === desktop);
    const osd = text => callDBus("org.kde.plasmashell", "/org/kde/osdService", "org.kde.osdService",
        "showText", "view-split-left-right", text);

    // n tiles stacked vertically inside one column tile
    function column(col, n) {
        if (n === 1) return [col];
        col.split(VERTICAL);
        while (col.tiles.length < n) col.tiles[col.tiles.length - 1].split(VERTICAL);
        return col.tiles.slice();
    }

    function layOut(output, desktop) {
        const k = key(output, desktop);
        const wins = groupOf(output, desktop);
        if (!wins.length) return false;
        const root = workspace.rootTile(output, desktop);
        if (!root) return false;
        // keep a master width the user dragged, if the layout is still ours
        if (groups[k] && root.tiles.length === 2 && root.layoutDirection === HORIZONTAL)
            ratios[k] = clampRatio(root.tiles[mirror ? 1 : 0].relativeGeometry.width);
        const ratio = ratios[k] || defaultRatio;

        busy = true;
        try {
            for (const t of root.tiles.slice()) t.remove();
            root.padding = gap; // KWin spreads it: full at screen edges, half between tiles
            let slots = [root];
            if (wins.length > 1) {
                const rects = slotRects(wins.length, ratio, mainCount, mirror);
                const m = Math.min(mainCount, wins.length - 1);
                const cols = root.split(HORIZONTAL);
                slots = [...column(cols[mirror ? 1 : 0], m), ...column(cols[mirror ? 0 : 1], wins.length - m)];
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

    // true if w was newly tracked
    function track(w) {
        if (!wanted(w) || order.includes(w)) return false;
        order.push(w);
        if (!hooked.has(w)) {
            hooked.add(w);
            for (const sig of ["desktopsChanged", "outputChanged", "minimizedChanged", "fullScreenChanged"])
                w[sig].connect(retileAll);
            w.tileChanged.connect(() => {
                // user dragged a tiled window out: let it float instead of snapping it back
                if (!busy && order.includes(w) && !w.tile && tileable(w)) { floating.add(w); retileAll(); }
            });
        }
        return true;
    }

    // move a freshly added window to where the "new windows go" setting wants it
    function place(w) {
        if (newWindow !== 1 && newWindow !== 2) return;
        if (!w.output || w.desktops.length !== 1) return;
        const target = groupOf(w.output, w.desktops[0]).filter(x => x !== w)[newWindow === 2 ? 0 : mainCount];
        if (!target) return;
        order = order.filter(x => x !== w);
        order.splice(order.indexOf(target), 0, w);
    }

    function untile(w) {
        order = order.filter(x => x !== w);
        floating.delete(w);
        if (w.tile && !w.deleted) { busy = true; w.tile.unmanage(w); busy = false; }
    }

    workspace.windowAdded.connect(w => { if (track(w)) place(w); retileAll(); });
    workspace.windowRemoved.connect(w => {
        order = order.filter(x => x !== w);
        floating.delete(w);
        retileAll();
    });

    const tracked = () => {
        const w = workspace.activeWindow;
        return w && order.includes(w) ? w : null;
    };

    registerShortcut("StackletSetMaster", "Stacklet: Make focused window the main one", "Meta+Shift+Return", () => {
        const w = tracked();
        if (!w) return;
        floating.delete(w);
        order = [w, ...order.filter(x => x !== w)];
        retileAll();
    });

    registerShortcut("StackletToggleFloat", "Stacklet: Float / tile focused window", "Meta+F", () => {
        const w = tracked();
        if (!w) return;
        if (floating.has(w)) floating.delete(w);
        else {
            floating.add(w);
            busy = true;
            if (w.tile) w.tile.unmanage(w);
            busy = false;
        }
        retileAll();
    });

    // Session-only (scripts can't write their own config): the OSD shows the class to paste into settings.
    registerShortcut("StackletToggleApp", "Stacklet: Tile / untile this app (shows its window class)", "Meta+Shift+A", () => {
        const w = workspace.activeWindow;
        if (!w || !w.normalWindow || w.specialWindow) return;
        const c = cls(w), now = !listed(c);
        overrides.set(c, now);
        for (const x of workspace.windowList()) {
            if (cls(x) !== c) continue;
            if (now) track(x); else untile(x);
        }
        retileAll();
        osd("Stacklet: " + (now ? "tiling " : "not tiling ") + c + " until restart. Add it in settings to keep.");
    });

    for (const dir of ["Left", "Right", "Up", "Down"]) {
        const d = dir.toLowerCase();
        // returns [window, neighbour] in the focused window's layout, or null
        const pair = () => {
            const w = tracked();
            if (!w || !tileable(w)) return null;
            const wins = groupOf(w.output, w.desktops[0]);
            const j = pickNeighbor(wins.map(x => x.frameGeometry), wins.indexOf(w), d);
            return j < 0 ? null : [w, wins[j]];
        };
        registerShortcut("StackletFocus" + dir, "Stacklet: Focus window " + d, "Meta+Alt+" + dir, () => {
            const p = pair();
            if (p) workspace.activeWindow = p[1];
        });
        registerShortcut("StackletSwap" + dir, "Stacklet: Swap with window " + d, "Meta+Alt+Shift+" + dir, () => {
            const p = pair();
            if (!p) return;
            const [a, b] = p.map(x => order.indexOf(x));
            [order[a], order[b]] = [order[b], order[a]];
            retileAll();
        });
    }

    for (const w of workspace.windowList()) track(w);
    retileAll();
}
