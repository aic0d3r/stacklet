// Stacklet: master + stack auto-tiling on Plasma's native tiles, for listed apps only.
// Everything else floats. Layout per (screen, virtual desktop): main window(s) on one side, rest stacked on the other.

const HORIZONTAL = 1, VERTICAL = 2; // KWin::Tile::LayoutDirection

// Target rects (relative to the screen, 0..1) for n windows: `main` windows stacked in one column,
// the rest in the other. `mirror` puts the main column on the right. `portrait` turns the layout
// 90°: main row on top (bottom if mirrored), the rest side by side below.
function slotRects(n, ratio, main = 1, mirror = false, portrait = false) {
    if (n <= 1) return [{ x: 0, y: 0, width: 1, height: 1 }];
    const m = Math.max(1, Math.min(main, n - 1)), k = n - m;
    const rects = [];
    for (let i = 0; i < m; i++) rects.push({ x: 0, y: i / m, width: ratio, height: 1 / m });
    for (let i = 0; i < k; i++) rects.push({ x: ratio, y: i / k, width: 1 - ratio, height: 1 / k });
    return orient(rects, mirror, portrait);
}

// landscape rects -> mirrored left/right, then turned 90° for portrait screens
function orient(rects, mirror, portrait) {
    const flipped = mirror ? rects.map(r => ({ x: 1 - r.x - r.width, y: r.y, width: r.width, height: r.height })) : rects;
    return portrait ? flipped.map(r => ({ x: r.y, y: r.x, width: r.height, height: r.width })) : flipped;
}

// Spiral (dwindle): window 1 takes `ratio` of the screen, each next window takes half of what is
// left, turning left, top, right, bottom in turn; the last window gets the remainder.
function spiralRects(n, ratio, mirror = false, portrait = false) {
    const out = [];
    let x = 0, y = 0, w = 1, h = 1;
    for (let i = 0; i < n - 1; i++) {
        const r = i === 0 ? ratio : 0.5;
        switch (i % 4) {
            case 0: out.push({ x, y, width: w * r, height: h }); x += w * r; w *= 1 - r; break;
            case 1: out.push({ x, y, width: w, height: h * r }); y += h * r; h *= 1 - r; break;
            case 2: out.push({ x: x + w * (1 - r), y, width: w * r, height: h }); w *= 1 - r; break;
            default: out.push({ x, y: y + h * (1 - r), width: w, height: h * r }); h *= 1 - r;
        }
    }
    out.push({ x, y, width: w, height: h });
    return orient(out, mirror, portrait);
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

if (typeof module !== "undefined") module.exports = { slotRects, spiralRects, clampRatio, pickNeighbor }; // node self-test

if (typeof workspace !== "undefined") {
    const list = s => String(s).split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
    const classes = list(readConfig("tileClasses", "kitty,org.kde.konsole,Alacritty,com.mitchellh.ghostty,foot,org.wezfurlong.wezterm"));
    const tileAll = String(readConfig("tileAll", false)) === "true"; // then `classes` is an exclude list
    const defaultRatio = clampRatio(readConfig("masterRatio", 0.55));
    const mirror = Number(readConfig("mainSide", 0)) === 1;
    const mainCount = Math.max(1, Math.min(2, Number(readConfig("maxMain", 1)) || 1));
    const newWindow = Number(readConfig("newWindow", 0)); // 0 stack bottom, 1 stack top, 2 becomes main
    const gap = Math.max(0, Number(readConfig("gap", 0)) || 0);
    const smartGaps = String(readConfig("smartGaps", true)) === "true"; // no gap around a lone window
    const mainClasses = list(readConfig("mainClasses", "")); // apps that always take the main slot
    const focusAfterClose = String(readConfig("focusAfterClose", true)) === "true";
    const offScreens = list(readConfig("disabledScreens", ""));
    const offDesktops = list(readConfig("disabledDesktops", ""));
    const flag = k => String(readConfig(k, false)) === "true";
    const TILE = 0, SPIRAL = 1, MONOCLE = 2;
    const LAYOUT_LABELS = ["master and stack", "spiral", "monocle"];
    const layoutDefault = flag("layoutMonocle") ? MONOCLE : flag("layoutSpiral") ? SPIRAL : TILE;
    const layoutNames = { master: TILE, tile: TILE, spiral: SPIRAL, dwindle: SPIRAL, monocle: MONOCLE };
    const desktopLayouts = {}; // desktop number -> layout, from "2=monocle,3=spiral"
    String(readConfig("desktopLayouts", "")).split(",").forEach(s => {
        const [d, n] = s.split("=").map(x => x.trim().toLowerCase());
        if (d && n in layoutNames) desktopLayouts[d] = layoutNames[n];
    });
    const modes = new Map();     // group key -> layout picked with the shortcuts; lasts until restart
    const baseOf = desktop => String(desktop.x11DesktopNumber) in desktopLayouts ? desktopLayouts[String(desktop.x11DesktopNumber)] : layoutDefault;
    const modeOf = (k, desktop) => modes.has(k) ? modes.get(k) : baseOf(desktop);
    const overrides = new Map(); // class -> tile it? Set by the per-app toggle shortcut, lasts until restart.

    let order = [];             // tracked windows, oldest first; index 0 of a group = master
    const floating = new Set(); // windows the user took out of the layout
    const hooked = new WeakSet();
    const moving = new Set();     // windows being dragged right now
    const draggedOut = new Set(); // tiled windows the current drag pulled out of the layout
    const home = new WeakMap();   // window -> {output, desktop} it was last laid out in
    let active = null, closedActive = null, pendingFocus = null;
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
    // windows of a screen + desktop in layout order; apps pinned as "always main" come first
    const groupOf = (output, desktop) => {
        const g = order.filter(w => tileable(w) && w.output === output && w.desktops[0] === desktop);
        const pinned = w => mainClasses.includes(cls(w));
        return [...g.filter(pinned), ...g.filter(w => !pinned(w))];
    };
    const osd = text => callDBus("org.kde.plasmashell", "/org/kde/osdService", "org.kde.osdService",
        "showText", "view-split-left-right", text);

    const isPortrait = o => o.geometry.height > o.geometry.width;
    // main size as currently laid out in root's tiles, or undefined if the layout isn't ours
    function draggedRatio(root, portrait) {
        if (root.tiles.length !== 2 || root.layoutDirection !== (portrait ? VERTICAL : HORIZONTAL)) return undefined;
        const g = root.tiles[mirror ? 1 : 0].relativeGeometry;
        return clampRatio(portrait ? g.height : g.width);
    }

    // n tiles in a row (or column) inside one tile, split along dir
    function column(col, n, dir) {
        if (n === 1) return [col];
        col.split(dir);
        while (col.tiles.length < n) col.tiles[col.tiles.length - 1].split(dir);
        return col.tiles.slice();
    }

    function layOut(output, desktop) {
        const k = key(output, desktop);
        const wins = groupOf(output, desktop);
        if (!wins.length) return false;
        const root = workspace.rootTile(output, desktop);
        if (!root) return false;
        const portrait = isPortrait(output);
        const [outer, inner] = portrait ? [VERTICAL, HORIZONTAL] : [HORIZONTAL, VERTICAL];
        // keep a main size the user dragged, if the layout is still ours
        const dragged = groups[k] && draggedRatio(root, portrait);
        if (dragged) ratios[k] = dragged;
        const ratio = ratios[k] || defaultRatio;

        busy = true;
        try {
            for (const t of root.tiles.slice()) t.remove();
            root.padding = smartGaps && wins.length === 1 ? 0 : gap; // KWin spreads it: full at screen edges, half between tiles
            root.minimumSize = { width: 0.05, height: 0.05 }; // default 0.15 breaks stacks of 7+ windows; children inherit
            let slots = [root];
            const mode = modeOf(k, desktop);
            const one = mode === MONOCLE; // monocle: every window shares the root tile, the focused one is on top
            if (wins.length > 1 && mode === SPIRAL) {
                const rects = spiralRects(wins.length, ratio, mirror, portrait);
                slots = [];
                let cur = root;
                for (let i = 0; i < wins.length - 1; i++) {
                    // landscape frame: split left|right, top|bottom, ...; portrait turns the directions
                    let dir = i % 2 === 0 ? HORIZONTAL : VERTICAL;
                    let first = i % 4 < 2; // does window i take the first (left/top) half?
                    if (mirror && dir === HORIZONTAL) first = !first;
                    if (portrait) dir = dir === HORIZONTAL ? VERTICAL : HORIZONTAL;
                    const halves = cur.split(dir);
                    slots.push(halves[first ? 0 : 1]);
                    cur = halves[first ? 1 : 0];
                }
                slots.push(cur);
                for (let pass = 0; pass < 2; pass++) slots.forEach((t, i) => { t.relativeGeometry = rects[i]; });
            } else if (wins.length > 1 && !one) {
                const rects = slotRects(wins.length, ratio, mainCount, mirror, portrait);
                const m = Math.min(mainCount, wins.length - 1);
                const cols = root.split(outer);
                slots = [...column(cols[mirror ? 1 : 0], m, inner), ...column(cols[mirror ? 0 : 1], wins.length - m, inner)];
                // KWin shifts neighbours when one tile is resized, so a second pass settles longer stacks
                for (let pass = 0; pass < 2; pass++) slots.forEach((t, i) => { t.relativeGeometry = rects[i]; });
            }
            wins.forEach((w, i) => {
                if (w.maximizeMode) w.setMaximize(false, false);
                if (!slots[one ? 0 : i].manage(w)) // root.manage can refuse; fall back to filling the work area
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
        for (const k in next) {
            layOut(next[k].output, next[k].desktop);
            for (const w of groupOf(next[k].output, next[k].desktop)) home.set(w, next[k]);
        }
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
                if (!busy && order.includes(w) && !w.tile && tileable(w)) {
                    floating.add(w);
                    if (moving.has(w)) draggedOut.add(w);
                    retileAll();
                }
            });
            w.interactiveMoveResizeStarted.connect(() => moving.add(w));
            w.interactiveMoveResizeFinished.connect(() => {
                moving.delete(w);
                if (!draggedOut.delete(w) || !order.includes(w)) return;
                // dropped onto another tile: take its place, it takes ours
                const p = workspace.cursorPos;
                const hit = order.find(x => x !== w && tileable(x) && (g => p.x >= g.x && p.x < g.x + g.width && p.y >= g.y && p.y < g.y + g.height)(x.frameGeometry));
                if (!hit) return;
                floating.delete(w);
                const [a, b] = [order.indexOf(w), order.indexOf(hit)];
                [order[a], order[b]] = [order[b], order[a]];
                retileAll();
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

    workspace.screensChanged.connect(retileAll);
    for (const o of workspace.screens) o.geometryChanged.connect(retileAll); // rotation
    workspace.windowAdded.connect(w => { if (track(w)) place(w); retileAll(); });
    workspace.windowActivated.connect(a => {
        // KWin may move focus before windowRemoved fires: remember if the old active window just died
        if (active && active !== a && active.deleted) closedActive = active;
        if (a) active = a;
        const t = pendingFocus;
        pendingFocus = null;
        if (t && a !== t && order.includes(t)) workspace.activeWindow = t; // KWin picked its own; ours wins
    });
    workspace.windowRemoved.connect(w => {
        let next = null;
        const h = home.get(w);
        if (focusAfterClose && (w === active || w === closedActive) && h && order.includes(w)) {
            // focus the tile before the closed one, else the first remaining
            const g = groupOf(h.output, h.desktop).filter(x => x !== w), pos = order.indexOf(w);
            next = g.filter(x => order.indexOf(x) < pos).pop() || g[0] || null;
        }
        order = order.filter(x => x !== w);
        floating.delete(w);
        moving.delete(w);
        draggedOut.delete(w);
        retileAll();
        if (next) { pendingFocus = next; workspace.activeWindow = next; }
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

    // Focus by direction is KWin's own Meta+Alt+arrows, so only swapping lives here.
    for (const dir of ["Left", "Right", "Up", "Down"]) {
        const d = dir.toLowerCase();
        registerShortcut("StackletSwap" + dir, "Stacklet: Swap with window " + d, "Meta+Alt+Shift+" + dir, () => {
            const w = tracked();
            if (!w || !tileable(w)) return;
            const wins = groupOf(w.output, w.desktops[0]);
            const j = pickNeighbor(wins.map(x => x.frameGeometry), wins.indexOf(w), d);
            if (j < 0) return;
            const [a, b] = [w, wins[j]].map(x => order.indexOf(x));
            [order[a], order[b]] = [order[b], order[a]];
            retileAll();
        });
    }

    registerShortcut("StackletMonocle", "Stacklet: Monocle on / off (focused window fills the screen)", "Meta+Shift+M", () => {
        const w = tracked();
        if (!w || !tileable(w)) return;
        const k = key(w.output, w.desktops[0]), base = baseOf(w.desktops[0]);
        const now = modeOf(k, w.desktops[0]) === MONOCLE ? (base === MONOCLE ? TILE : base) : MONOCLE;
        modes.set(k, now);
        retileAll();
        osd("Stacklet: " + LAYOUT_LABELS[now]);
    });

    registerShortcut("StackletNextLayout", "Stacklet: Switch layout (master and stack / spiral / monocle)", "Meta+Shift+Space", () => {
        const w = tracked();
        if (!w || !tileable(w)) return;
        const k = key(w.output, w.desktops[0]);
        const now = (modeOf(k, w.desktops[0]) + 1) % 3;
        modes.set(k, now);
        retileAll();
        osd("Stacklet: " + LAYOUT_LABELS[now]);
    });

    // focus the next / previous tile in layout order (cycles windows in monocle, where directions don't apply)
    for (const [name, keys, dir] of [["Next", "Meta+Alt+.", 1], ["Prev", "Meta+Alt+,", -1]]) {
        registerShortcut("StackletFocus" + name, "Stacklet: Focus " + name.toLowerCase() + " window", keys, () => {
            const w = tracked();
            if (!w || !tileable(w)) return;
            const g = groupOf(w.output, w.desktops[0]);
            const t = g[(g.indexOf(w) + dir + g.length) % g.length];
            workspace.activeWindow = t;
            if (modeOf(key(w.output, w.desktops[0]), w.desktops[0]) === MONOCLE) osd("Stacklet: " + (g.indexOf(t) + 1) + " of " + g.length);
        });
    }

    // rotate the stack (everything after the main windows) one step; Shift rotates back
    for (const [name, keys, dir] of [["Next", "Meta+Alt+R", 1], ["Prev", "Meta+Alt+Shift+R", -1]]) {
        registerShortcut("StackletRotate" + name, "Stacklet: Rotate stack " + name.toLowerCase(), keys, () => {
            const w = tracked();
            if (!w || !tileable(w)) return;
            const g = groupOf(w.output, w.desktops[0]);
            const stack = g.slice(Math.min(mainCount, g.length - 1));
            if (stack.length < 2) return;
            const rotated = dir > 0 ? [...stack.slice(1), stack[0]] : [stack[stack.length - 1], ...stack.slice(0, -1)];
            const slots = stack.map(x => order.indexOf(x)).sort((a, b) => a - b);
            rotated.forEach((x, i) => { order[slots[i]] = x; });
            retileAll();
        });
    }

    // keyboard resize of the main size, in 5% steps, for the focused window's screen + desktop
    for (const [name, label, keys, delta] of [["Grow", "Grow", "Meta+Alt+]", 0.05], ["Shrink", "Shrink", "Meta+Alt+[", -0.05]]) {
        registerShortcut("Stacklet" + name + "Main", "Stacklet: " + label + " main window", keys, () => {
            const w = tracked();
            if (!w || !tileable(w)) return;
            const o = w.output, d = w.desktops[0], k = key(o, d), root = workspace.rootTile(o, d);
            const cur = (root && draggedRatio(root, isPortrait(o))) || ratios[k] || defaultRatio;
            ratios[k] = Math.min(0.85, Math.max(0.15, cur + delta));
            delete groups[k]; // so layOut uses this value instead of re-reading the old tiles
            retileAll();
        });
    }

    for (const w of workspace.windowList()) track(w);
    retileAll();
}
