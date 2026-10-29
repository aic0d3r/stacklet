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

// Centered master: main window in the middle at width `centre`, the stack alternating right and left
// (left first if mirrored), each side top to bottom. Portrait screens get master and stack turned 90°.
function centeredRects(n, centre, mirror = false, portrait = false) {
    if (portrait || n <= 1) return slotRects(n, centre, 1, mirror, portrait);
    const s = (1 - centre) / 2, k = n - 1, kr = Math.ceil(k / 2), kl = k - kr;
    const rects = [{ x: s, y: 0, width: centre, height: 1 }];
    for (let j = 0; j < k; j++) {
        const right = j % 2 === 0, count = right ? kr : kl;
        rects.push({ x: right ? s + centre : 0, y: (j >> 1) / count, width: s, height: 1 / count });
    }
    return orient(rects, mirror, false);
}

function clampRatio(r, lo = 0.15, hi = 0.85, d = 0.55) {
    r = Number(r);
    return r >= lo && r <= hi ? r : d;
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

// Swap two entries of order; rotate the `stack` windows one step inside the slots they hold in order.
function swapOrder(order, a, b) { [order[a], order[b]] = [order[b], order[a]]; }
function rotateOrder(order, stack, dir) {
    placeInSlots(order, dir > 0 ? [...stack.slice(1), stack[0]] : [stack[stack.length - 1], ...stack.slice(0, -1)]);
}
// Put `wins` (those still in order) into the slots they hold in order, in the sequence given.
function placeInSlots(order, wins) {
    const keep = wins.filter(x => order.includes(x));
    const slots = keep.map(x => order.indexOf(x)).sort((a, b) => a - b);
    keep.forEach((x, i) => { order[slots[i]] = x; });
}

if (typeof module !== "undefined") module.exports = { slotRects, spiralRects, centeredRects, clampRatio, pickNeighbor, swapOrder, rotateOrder, placeInSlots }; // node self-test

if (typeof workspace !== "undefined") {
    const list = s => String(s).split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
    const classes = list(readConfig("tileClasses", "kitty,org.kde.konsole,Alacritty,com.mitchellh.ghostty,foot,org.wezfurlong.wezterm"));
    const flag = (k, d = false) => String(readConfig(k, d)) === "true";
    const tileAll = flag("tileAll"); // then `classes` is an exclude list
    const defaultRatio = clampRatio(readConfig("masterRatio", 0.55));
    const mirror = Number(readConfig("mainSide", 0)) === 1;
    const mainCount = Math.max(1, Math.min(2, Number(readConfig("maxMain", 1)) || 1));
    const newWindow = Number(readConfig("newWindow", 0)); // 0 stack bottom, 1 stack top, 2 becomes main
    const gap = Math.max(0, Number(readConfig("gap", 0)) || 0);
    const smartGaps = flag("smartGaps", true); // no gap around a lone window
    const mainClasses = list(readConfig("mainClasses", "")); // apps that always take the main slot
    const focusAfterClose = flag("focusAfterClose", true);
    const offScreens = list(readConfig("disabledScreens", ""));
    const offDesktops = list(readConfig("disabledDesktops", ""));
    const TILE = 0, SPIRAL = 1, MONOCLE = 2, CENTERED = 3;
    const LAYOUT_LABELS = ["master and stack", "spiral", "monocle", "centered master"];
    const layoutDefault = flag("layoutCentered") ? CENTERED : flag("layoutMonocle") ? MONOCLE : flag("layoutSpiral") ? SPIRAL : TILE;
    const layoutNames = { master: TILE, tile: TILE, spiral: SPIRAL, dwindle: SPIRAL, monocle: MONOCLE, centered: CENTERED, center: CENTERED, centre: CENTERED };
    const stashDefault = flag("stash"); // centered master starts with narrow side columns
    const stashSide = clampRatio(readConfig("stashWidth", 0.15), 0.05, 0.3, 0.15);
    // main width per kind of layout: m = master/spiral, c = centered, s = centered with stash
    const WIDTHS = {
        m: [defaultRatio, 0.15, 0.85],
        c: [clampRatio(readConfig("centerRatio", 0.5), 0.15, 0.85, 0.5), 0.15, 0.85],
        s: [1 - 2 * stashSide, 0.4, 0.9],
    };
    const scratchSize = ["scratchWidth", "scratchHeight"].map(k => clampRatio(readConfig(k, 0.6), 0.2, 1, 0.6));
    const desktopLayouts = {}; // desktop number -> layout, from "2=monocle,3=spiral"
    String(readConfig("desktopLayouts", "")).split(",").forEach(s => {
        const [d, n] = s.split("=").map(x => x.trim().toLowerCase());
        if (d && n in layoutNames) desktopLayouts[d] = layoutNames[n];
    });
    const baseOf = desktop => String(desktop.x11DesktopNumber) in desktopLayouts ? desktopLayouts[String(desktop.x11DesktopNumber)] : layoutDefault;
    // group key -> {mode, stash, base, prev?} picked with the shortcuts, kept across restarts in `savedState`.
    // `base` is the settings layout at the time: once the settings page changes it, the entry is ignored.
    let modes = {}, ratios = {}; // ratios: group key -> {m, c, s} main widths the user dragged or set
    let savedJson = String(readConfig("savedState", ""));
    try {
        const s = JSON.parse(savedJson || "{}");
        if (s && typeof s.modes === "object" && typeof s.ratios === "object") ({ modes, ratios } = s);
    } catch (e) { /* unreadable: start fresh */ }
    const modeOf = (k, desktop) => {
        const m = modes[k];
        return m && m.base === baseOf(desktop) && LAYOUT_LABELS[m.mode] ? m : { mode: baseOf(desktop), stash: stashDefault };
    };
    const setMode = (k, desktop, m) => { modes[k] = Object.assign({}, m, { base: baseOf(desktop) }); };
    const kindOf = m => m.mode !== CENTERED ? "m" : m.stash ? "s" : "c";
    const widthOf = (k, kind) => clampRatio((ratios[k] || {})[kind], WIDTHS[kind][1], WIDTHS[kind][2], WIDTHS[kind][0]);
    const setWidth = (k, kind, v) => { (ratios[k] = ratios[k] || {})[kind] = Math.min(WIDTHS[kind][2], Math.max(WIDTHS[kind][1], Number(v) || WIDTHS[kind][0])); };
    // KWin 6.8 scripts can read their config but have no writeConfig; Plasma's desktop scripting can write it.
    // shortcut: needs plasmashell running when the state changes; nothing is saved without it.
    function save() {
        const json = JSON.stringify({ modes, ratios });
        if (json === savedJson) return;
        savedJson = json;
        callDBus("org.kde.plasmashell", "/PlasmaShell", "org.kde.PlasmaShell", "evaluateScript",
            "ConfigFile('kwinrc', 'Script-stacklet').writeEntry('savedState', " + JSON.stringify(json) + ");");
    }
    const overrides = new Map(); // class -> tile it? Set by the per-app toggle shortcut, lasts until restart.

    let order = [];             // tracked windows, oldest first; index 0 of a group = master
    const floating = new Set(); // windows the user took out of the layout
    // Never use WeakSet/WeakMap with windows: after KWin destroys a window the weak table keeps a dangling
    // entry and the next lookup segfaults KWin. Plain Set/Map, cleaned in windowRemoved, instead.
    const hooked = new Set();     // windows whose signals we already connected
    const moving = new Set();     // windows being dragged right now
    const draggedOut = new Set(); // tiled windows the current drag pulled out of the layout
    const home = new Map();       // window -> {output, desktop} it was last laid out in
    let active = null, closedActive = null, pendingFocus = null;
    let scratch = [];           // windows in the scratchpad, in the order they were sent
    const focusOrder = new Map(); // group key -> its windows in layout order before the focus shortcut
    const laid = {};            // group key -> width kind of the tiles we built last, to read drags from
    let groups = {};            // group key -> {output, desktop} that we laid out last time
    let busy = false;           // ignore tile changes we cause ourselves

    const key = (o, d) => o.name + "|" + d.x11DesktopNumber; // saved across restarts, so no desktop uuid
    const cls = w => String(w.resourceClass).toLowerCase();
    const listed = c => overrides.has(c) ? overrides.get(c) : classes.includes(c) !== tileAll;
    const wanted = w => w.normalWindow && !w.specialWindow && !w.transient &&
        (!tileAll || w.resizeable) && listed(cls(w));
    // a window on another Activity still sits on this screen and desktop: counting it leaves an empty tile
    const onActivity = w => !w.activities.length || w.activities.includes(workspace.currentActivity);
    const tileable = w => !w.deleted && !floating.has(w) && !scratch.includes(w) && !w.minimized && !w.fullScreen &&
        w.output && w.desktops.length === 1 && onActivity(w) &&
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
    function draggedRatio(root, portrait, kind = "m") {
        if (kind !== "m" && !portrait) // centered: three columns, main in the middle
            return root.tiles.length === 3 && root.layoutDirection === HORIZONTAL ? root.tiles[1].relativeGeometry.width : undefined;
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
        const st = modeOf(k, desktop), mode = st.mode, kind = kindOf(st);
        // keep a main size the user dragged, if the tiles are still the ones we built for this kind
        const dragged = groups[k] && laid[k] === kind && draggedRatio(root, portrait, kind);
        if (dragged) setWidth(k, kind, dragged);
        const ratio = widthOf(k, kind);
        laid[k] = kind;

        busy = true;
        try {
            for (const t of root.tiles.slice()) t.remove();
            const one = mode === MONOCLE;
            root.padding = smartGaps && (wins.length === 1 || one) ? 0 : gap; // KWin spreads it: full at screen edges, half between tiles
            root.minimumSize = { width: 0.05, height: 0.05 }; // default 0.15 breaks stacks of 7+ windows; children inherit
            let slots = [root]; // monocle: every window shares the root tile, the focused one is on top
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
            } else if (wins.length > 1 && mode === CENTERED && !portrait) {
                // left | main | right columns; with 2 windows one side stays empty so the main stays centred
                const rects = centeredRects(wins.length, ratio, mirror), k1 = wins.length - 1, s = (1 - ratio) / 2;
                const cols = column(root, 3, HORIZONTAL);
                const first = column(cols[mirror ? 0 : 2], Math.ceil(k1 / 2), VERTICAL);
                const second = k1 > 1 ? column(cols[mirror ? 2 : 0], Math.floor(k1 / 2), VERTICAL) : [];
                slots = [cols[1]];
                for (let j = 0; j < k1; j++) slots.push((j % 2 ? second : first)[j >> 1]);
                const colRects = [0, s, s + ratio].map((x, i) => ({ x, y: 0, width: i === 1 ? ratio : s, height: 1 }));
                for (let pass = 0; pass < 2; pass++) {
                    cols.forEach((t, i) => { t.relativeGeometry = colRects[i]; });
                    slots.forEach((t, i) => { t.relativeGeometry = rects[i]; });
                }
            } else if (wins.length > 1 && !one) {
                const main = mode === CENTERED ? 1 : mainCount; // centered on a portrait screen: one main row on top
                const rects = slotRects(wins.length, ratio, main, mirror, portrait);
                const m = Math.min(main, wins.length - 1);
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

    // keys of the groups a window touches: where it was laid out last and where it is now
    function keysOf(w) {
        const h = home.get(w), ks = h ? [key(h.output, h.desktop)] : [];
        if (!w.deleted && w.output && w.desktops.length === 1) ks.push(key(w.output, w.desktops[0]));
        return ks;
    }
    const tiledWindow = () => { const w = tracked(); return w && tileable(w) ? w : null; };
    function release(w) { busy = true; w.tile.unmanage(w); busy = false; }

    // Re-lay out the groups named in `only` (keys), or all of them when omitted.
    function retileAll(only) {
        const next = {};
        for (const w of order) if (tileable(w)) next[key(w.output, w.desktops[0])] = { output: w.output, desktop: w.desktops[0] };
        for (const k in next) {
            if (only && !only.includes(k)) continue;
            layOut(next[k].output, next[k].desktop);
            for (const w of groupOf(next[k].output, next[k].desktop)) home.set(w, next[k]);
        }
        // groups that just lost their last window: nothing to lay out, forget the saved ratio
        // (windows on other Activities keep it: visiting an empty Activity shouldn't reset a dragged width)
        const held = new Set(order.filter(w => !w.deleted && w.output && w.desktops.length === 1).map(w => key(w.output, w.desktops[0])));
        for (const k in groups) if (!next[k]) { delete laid[k]; if (!held.has(k)) delete ratios[k]; }
        groups = next;
        save();
    }

    // true if w was newly tracked
    function track(w) {
        if (!wanted(w) || order.includes(w)) return false;
        order.push(w);
        if (!hooked.has(w)) {
            hooked.add(w);
            for (const sig of ["desktopsChanged", "outputChanged", "minimizedChanged", "fullScreenChanged", "activitiesChanged"])
                w[sig].connect(() => retileAll(keysOf(w)));
            w.tileChanged.connect(() => {
                // user dragged a tiled window out: let it float instead of snapping it back
                if (!busy && order.includes(w) && !w.tile && tileable(w)) {
                    floating.add(w);
                    if (moving.has(w)) draggedOut.add(w);
                    retileAll(keysOf(w));
                }
            });
            w.interactiveMoveResizeStarted.connect(() => moving.add(w));
            w.interactiveMoveResizeFinished.connect(() => {
                moving.delete(w);
                if (!draggedOut.delete(w) || !order.includes(w)) return;
                // dropped onto another tile: take its place, it takes ours
                const p = workspace.cursorPos;
                const hit = order.find(x => x !== w && tileable(x) && x.output === w.output && x.desktops[0] === w.desktops[0] && (g => p.x >= g.x && p.x < g.x + g.width && p.y >= g.y && p.y < g.y + g.height)(x.frameGeometry));
                if (!hit) return;
                floating.delete(w);
                swapOrder(order, order.indexOf(w), order.indexOf(hit));
                retileAll(keysOf(w));
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
        if (w.tile && !w.deleted) release(w);
    }

    workspace.screensChanged.connect(retileAll);
    workspace.currentActivityChanged.connect(() => retileAll());
    for (const o of workspace.screens) o.geometryChanged.connect(retileAll); // rotation
    workspace.windowAdded.connect(w => { if (track(w)) { place(w); retileAll(keysOf(w)); } });
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
        const h = home.get(w), ks = keysOf(w);
        if (focusAfterClose && (w === active || w === closedActive) && h && order.includes(w)) {
            // focus the tile before the closed one, else the first remaining
            const g = groupOf(h.output, h.desktop).filter(x => x !== w), pos = order.indexOf(w);
            next = g.filter(x => order.indexOf(x) < pos).pop() || g[0] || null;
        }
        order = order.filter(x => x !== w);
        scratch = scratch.filter(x => x !== w);
        for (const [k, g] of focusOrder) focusOrder.set(k, g.filter(x => x !== w));
        floating.delete(w);
        moving.delete(w);
        draggedOut.delete(w);
        hooked.delete(w);
        home.delete(w);
        if (active === w) active = null;
        if (closedActive === w) closedActive = null;
        if (pendingFocus === w) pendingFocus = null;
        retileAll(ks);
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
        const g = tileable(w) ? groupOf(w.output, w.desktops[0]) : [];
        // centered: swap with the main window, so the stash keeps its places
        if (g[0] && g[0] !== w && modeOf(key(w.output, w.desktops[0]), w.desktops[0]).mode === CENTERED)
            swapOrder(order, order.indexOf(w), order.indexOf(g[0]));
        else order = [w, ...order.filter(x => x !== w)];
        retileAll(keysOf(w));
    });

    // Scratchpad: hidden windows (minimized, so still in the taskbar if the script stops), shown one at a
    // time centred over the current screen and desktop.
    function showScratch(w) {
        const o = workspace.activeScreen, d = workspace.currentDesktop;
        if (w.output !== o) workspace.sendClientToScreen(w, o);
        w.onAllDesktops = true; // follows you to other desktops while shown
        w.keepAbove = true;     // floats over the tiles
        w.minimized = false;
        const a = workspace.clientArea(KWin.MaximizeArea, o, d);
        const width = Math.round(a.width * scratchSize[0]), height = Math.round(a.height * scratchSize[1]);
        w.frameGeometry = { x: Math.round(a.x + (a.width - width) / 2), y: Math.round(a.y + (a.height - height) / 2), width, height };
        workspace.activeWindow = w;
    }

    // Each press shows the next scratchpad window; the press after the last one hides it.
    registerShortcut("StackletScratchpad", "Stacklet: Show / hide the scratchpad (next window on each press)", "Meta+S", () => {
        if (!scratch.length) { osd("Stacklet: the scratchpad is empty. Meta+Ctrl+S sends a window there."); return; }
        const shown = scratch.filter(w => !w.minimized), last = shown.length ? scratch.indexOf(shown[shown.length - 1]) : -1;
        for (const w of shown) w.minimized = true;
        if (last + 1 < scratch.length) showScratch(scratch[last + 1]);
    });

    // Meta+Alt+S is the screen reader toggle on a fresh Plasma. New id: 1.1.0 saved Meta+Alt+Shift+S under StackletToScratchpad.
    registerShortcut("StackletSendToScratchpad", "Stacklet: Send focused window to the scratchpad (on a shown one: put it back)", "Meta+Ctrl+S", () => {
        const w = workspace.activeWindow;
        if (!w || !w.normalWindow || w.specialWindow) return;
        if (scratch.includes(w)) {
            scratch = scratch.filter(x => x !== w);
            w.keepAbove = false;
            w.onAllDesktops = false; // KWin puts it on the current desktop
            floating.delete(w);
            retileAll(keysOf(w));
            return;
        }
        const ks = keysOf(w);
        scratch.push(w);
        if (w.tile) release(w);
        w.minimized = true;
        retileAll(ks);
        osd("Stacklet: sent to the scratchpad. Meta+S shows it.");
    });

    // Spotlight: the focused window in the centre, every other tiled window in the stash; again restores.
    // Id says FocusMode (its name in the plan); the label avoids "focus", which means keyboard focus elsewhere.
    registerShortcut("StackletFocusMode", "Stacklet: Spotlight on / off (focused window centred, the rest in the stash)", "Meta+Alt+C", () => {
        const w = tiledWindow();
        if (!w) { osd("Stacklet: focus a tiled window first"); return; }
        const d = w.desktops[0], k = key(w.output, d), st = modeOf(k, d);
        if (st.prev) {
            setMode(k, d, st.prev);
            if (focusOrder.has(k)) placeInSlots(order, focusOrder.get(k));
            focusOrder.delete(k);
            osd("Stacklet: spotlight off, back to " + LAYOUT_LABELS[st.prev.mode]);
        } else {
            const g = groupOf(w.output, d);
            focusOrder.set(k, g);
            if (g[0] !== w) swapOrder(order, order.indexOf(w), order.indexOf(g[0]));
            setMode(k, d, { mode: CENTERED, stash: true, prev: { mode: st.mode, stash: st.stash } });
            osd("Stacklet: spotlight on. Meta+Alt+C again goes back.");
        }
        retileAll([k]);
    });

    registerShortcut("StackletToggleFloat", "Stacklet: Float / tile focused window", "Meta+F", () => {
        const w = tracked();
        if (!w) return;
        if (floating.has(w)) floating.delete(w);
        else {
            floating.add(w);
            if (w.tile) release(w);
        }
        retileAll(keysOf(w));
    });

    // Session-only (scripts can't write their own config): the OSD shows the class to paste into settings.
    // New id (was StackletToggleApp): 1.0.0 saved Meta+Shift+A under the old one, which would hide the new default.
    registerShortcut("StackletToggleAppClass", "Stacklet: Tile / untile this app (shows its window class)", "Meta+Alt+A", () => {
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
            const w = tiledWindow();
            if (!w) return;
            const wins = groupOf(w.output, w.desktops[0]);
            const j = pickNeighbor(wins.map(x => x.frameGeometry), wins.indexOf(w), d);
            if (j < 0) return;
            swapOrder(order, order.indexOf(w), order.indexOf(wins[j]));
            retileAll(keysOf(w));
        });
    }

    // Layout shortcuts act on the focused tile's screen + desktop, or on the current ones when focus is on
    // something Stacklet doesn't tile, and always say what happened.
    function switchLayout(pick) {
        const w = tracked();
        const output = w && tileable(w) ? w.output : workspace.activeScreen;
        const desktop = w && tileable(w) ? w.desktops[0] : workspace.currentDesktop;
        const n = groupOf(output, desktop).length;
        if (!n) { osd("Stacklet: no tiled windows on this screen and desktop"); return; }
        const k = key(output, desktop);
        const now = pick(modeOf(k, desktop).mode, baseOf(desktop));
        setMode(k, desktop, { mode: now, stash: stashDefault }); // also ends focus
        focusOrder.delete(k);
        retileAll([k]);
        // spiral and master and stack only differ from the fourth window on
        osd("Stacklet: " + LAYOUT_LABELS[now] + (now === SPIRAL && n < 4 ? " (same as master and stack until 4 windows)" : ""));
    }

    registerShortcut("StackletMonocle", "Stacklet: Monocle on / off (focused window fills the screen)", "Meta+Shift+M", () =>
        switchLayout((cur, base) => cur === MONOCLE ? (base === MONOCLE ? TILE : base) : MONOCLE));

    registerShortcut("StackletNextLayout", "Stacklet: Switch layout (master and stack / spiral / monocle / centered)", "Meta+Shift+Space", () =>
        switchLayout(cur => (cur + 1) % LAYOUT_LABELS.length));

    // focus the next / previous tile in layout order (cycles windows in monocle, where directions don't apply)
    for (const [name, keys, dir] of [["Next", "Meta+Alt+.", 1], ["Prev", "Meta+Alt+,", -1]]) {
        registerShortcut("StackletFocus" + name, "Stacklet: Focus " + name.toLowerCase() + " window", keys, () => {
            const w = tiledWindow();
            if (!w) return;
            const g = groupOf(w.output, w.desktops[0]);
            const t = g[(g.indexOf(w) + dir + g.length) % g.length];
            workspace.activeWindow = t;
            if (modeOf(key(w.output, w.desktops[0]), w.desktops[0]).mode === MONOCLE) osd("Stacklet: " + (g.indexOf(t) + 1) + " of " + g.length);
        });
    }

    // rotate the stack (everything after the main windows) one step; Shift rotates back
    // New ids and keys: Meta+Alt+R (1.0.0) is Spectacle's Record Screen, and 1.0.0 saved it under StackletRotate*.
    for (const [name, keys, dir] of [["Next", "Meta+Alt+T", 1], ["Prev", "Meta+Alt+Shift+T", -1]]) {
        registerShortcut("StackletTurn" + name, "Stacklet: Rotate stack " + name.toLowerCase(), keys, () => {
            const w = tiledWindow();
            if (!w) return;
            const g = groupOf(w.output, w.desktops[0]);
            const main = modeOf(key(w.output, w.desktops[0]), w.desktops[0]).mode === CENTERED ? 1 : mainCount;
            const stack = g.slice(Math.min(main, g.length - 1));
            if (stack.length < 2) return;
            rotateOrder(order, stack, dir);
            retileAll(keysOf(w));
        });
    }

    // keyboard resize of the main size, in 5% steps, for the focused window's screen + desktop
    for (const [name, label, keys, delta] of [["Grow", "Grow", "Meta+Alt+]", 0.05], ["Shrink", "Shrink", "Meta+Alt+[", -0.05]]) {
        registerShortcut("Stacklet" + name + "Main", "Stacklet: " + label + " main window", keys, () => {
            const w = tiledWindow();
            if (!w) return;
            const o = w.output, d = w.desktops[0], k = key(o, d), root = workspace.rootTile(o, d);
            const kind = kindOf(modeOf(k, d));
            const cur = (root && laid[k] === kind && draggedRatio(root, isPortrait(o), kind)) || widthOf(k, kind);
            setWidth(k, kind, cur + delta);
            delete laid[k]; // so layOut uses this value instead of re-reading the old tiles
            retileAll([k]);
        });
    }

    for (const w of workspace.windowList()) track(w);
    retileAll();
}
