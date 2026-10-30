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

// Dwindle (as in Hyprland and bspwm): the windows are leaves of a binary tree; a node is a window or {kids: [a, b]}.
// A new window splits the tile of the window before it in `wins` (the focused one when it opened, see place);
// a closed window's sibling takes its space. Leaves get relabelled with `wins` in order, so swaps still work.
function dwindleSync(tree, wins) {
    const prune = n => !n ? null : !n.kids ? (wins.includes(n) ? n : null) :
        (([a, b]) => a && b ? { kids: [a, b] } : a || b)(n.kids.map(prune));
    const leaves = n => !n ? [] : n.kids ? [...leaves(n.kids[0]), ...leaves(n.kids[1])] : [n];
    const put = (n, at, r) => n === at ? r : n.kids ? { kids: n.kids.map(x => put(x, at, r)) } : n;
    tree = prune(tree);
    wins.forEach((w, i) => {
        const have = leaves(tree);
        if (have.includes(w)) return;
        const before = wins.slice(0, i).reverse().find(x => have.includes(x));
        const after = wins.slice(i + 1).find(x => have.includes(x));
        tree = before ? put(tree, before, { kids: [before, w] }) : after ? put(tree, after, { kids: [w, after] }) : w;
    });
    let i = 0;
    const relabel = n => !n ? null : n.kids ? { kids: n.kids.map(relabel) } : wins[i++];
    return relabel(tree);
}

// Leaf rects in leaf order, plus the direction of each split in depth-first order. Each split goes side by side
// when its tile is wider than tall (`aspect` = screen width / height), else top and bottom. The root split takes
// `ratio`, the rest halves. `mirror` flips along the root split, so the first window's side moves.
function dwindleRects(tree, ratio, aspect, mirror = false) {
    const rects = [], splits = [];
    (function walk(n, r, f) {
        if (!n.kids) { rects.push(r); return; }
        const side = r.width * aspect >= r.height;
        splits.push(side ? HORIZONTAL : VERTICAL);
        walk(n.kids[0], side ? { x: r.x, y: r.y, width: r.width * f, height: r.height } : { x: r.x, y: r.y, width: r.width, height: r.height * f }, 0.5);
        walk(n.kids[1], side ? { x: r.x + r.width * f, y: r.y, width: r.width * (1 - f), height: r.height }
            : { x: r.x, y: r.y + r.height * f, width: r.width, height: r.height * (1 - f) }, 0.5);
    })(tree, { x: 0, y: 0, width: 1, height: 1 }, ratio);
    if (!mirror || !splits.length) return { rects, splits };
    const flip = splits[0] === HORIZONTAL ? r => Object.assign({}, r, { x: 1 - r.x - r.width }) : r => Object.assign({}, r, { y: 1 - r.y - r.height });
    return { rects: rects.map(flip), splits };
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

const TERMINALS = "kitty,org.kde.konsole,Alacritty,com.mitchellh.ghostty,foot,org.wezfurlong.wezterm";
const list = s => String(s).split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
// "Float system apps and utilities" in tile-all mode. `x*` matches a prefix, `*x` a suffix.
const SYSTEM_FLOAT = list(
    "systemsettings,kcmshell6,org.kde.kcmshell6,org.kde.kinfocenter,org.kde.partitionmanager,org.kde.discover,org.kde.kwalletmanager," +
    "org.kde.kmenuedit,pavucontrol,org.pulseaudio.pavucontrol,nm-connection-editor,blueman-manager," + // settings & system
    "xdg-desktop-portal-kde,org.freedesktop.impl.portal.desktop.kde,xdg-desktop-portal-gtk,xdg-desktop-portal-gnome," +
    "org.kde.polkit-kde-authentication-agent-1,polkit-kde-authentication-agent-1,pinentry*,gcr-prompter," +
    "org.kde.ksecretd,kwalletd6,kwalletd5," + // portals & prompts
    "steam,steam_app_*,steamwebhelper,net.lutris.lutris,lutris,heroic,com.heroicgameslauncher.hgl,com.usebottles.bottles," +
    "*.exe,wine," + // games & launchers
    "org.kde.kcalc,org.kde.kalk,org.kde.spectacle,org.kde.kcolorchooser,org.kde.kruler,org.kde.kcharselect,org.kde.kdeconnect.*," +
    "org.kde.ark,org.kde.gwenview,org.gnome.loupe,eog,qimgv,feh,imv," + // viewers & small tools
    "mpv,vlc,org.kde.haruna,io.github.celluloid_player.celluloid,spotify,org.kde.elisa,strawberry"); // media
const SYSTEM_TITLE = /^(configure\b|settings$|preferences$)/i; // parentless "Configure — App" dialogs
const matches = (l, c) => l.some(p => p.endsWith("*") ? c.startsWith(p.slice(0, -1)) : p.startsWith("*") ? c.endsWith(p.slice(1)) : p === c);
// Should a window of class `c` titled `title` tile? o: {tileAll, system, tileClasses, floatClasses, tileAnyway}
function appTiles(c, title, o) {
    if (!o.tileAll) return matches(o.tileClasses, c);
    if (matches(o.floatClasses, c)) return false;
    if (o.tileAnyway.includes(c)) return true; // Meta+Alt+A over the built-in list
    return !(o.system && (matches(SYSTEM_FLOAT, c) || SYSTEM_TITLE.test(title)));
}
// Meta+Alt+A: flip `c` and return the list entries that change. Tile-all edits floatClasses and the
// hidden tileAnyway list (to beat the built-in list), otherwise tileClasses.
function toggleApp(c, title, o) {
    const tiled = !appTiles(c, title, o), drop = l => l.filter(x => x !== c);
    if (!o.tileAll) return { tiled, lists: { tileClasses: tiled ? [...o.tileClasses, c] : drop(o.tileClasses) } };
    const n = { floatClasses: drop(o.floatClasses), tileAnyway: drop(o.tileAnyway) };
    if (tiled !== appTiles(c, title, Object.assign({}, o, n))) (tiled ? n.tileAnyway : n.floatClasses).push(c);
    return { tiled, lists: n };
}
// Up to 1.1.x one list was the exclude list in tile-all mode. Move it to floatClasses once (`done` marks it).
// Skipped once floatClasses was edited: at login plasmashell may not be up yet, so this can run again.
function migrateApps(done, tileAll, tileRaw, floatRaw = "") {
    if (done) return null;
    const out = { appListsV2: "true" };
    if (tileAll && list(tileRaw).join() !== list(TERMINALS).join() && !list(floatRaw).length) Object.assign(out, { floatClasses: list(tileRaw).join(","), tileClasses: TERMINALS });
    return out;
}

if (typeof module !== "undefined") module.exports = { slotRects, spiralRects, dwindleSync, dwindleRects, centeredRects, clampRatio, pickNeighbor, swapOrder, rotateOrder, placeInSlots, appTiles, toggleApp, migrateApps, list, TERMINALS }; // node self-test

const kwinRead = typeof readConfig !== "undefined" ? readConfig : null;
if (typeof workspace !== "undefined") {
    // Every setting read at start, to restart when one changes. key -> [default, value, values we wrote...]
    const seen = {};
    const readConfig = (k, d) => { const v = kwinRead(k, d); seen[k] = [d, String(v)]; return v; };
    const flag = (k, d = false) => String(readConfig(k, d)) === "true";
    const tileAll = flag("tileAll");
    // KWin 6.8 scripts can read their config but have no writeConfig; Plasma's desktop scripting can write it.
    // shortcut: needs plasmashell running; nothing is saved without it.
    const writeConfig = entries => {
        // our own writes are no reason to restart, whether plasmashell stored them yet or not
        for (const k in entries) if (seen[k]) seen[k].push(String(entries[k]));
        callDBus("org.kde.plasmashell", "/PlasmaShell", "org.kde.PlasmaShell", "evaluateScript",
        "const c = ConfigFile('kwinrc', 'Script-stacklet');" +
        Object.keys(entries).map(k => "c.writeEntry(" + JSON.stringify(k) + ", " + JSON.stringify(entries[k]) + ");").join(""));
    };
    const apps = { tileAll, system: flag("floatSystem", true), tileClasses: list(readConfig("tileClasses", TERMINALS)),
        floatClasses: list(readConfig("floatClasses", "")), tileAnyway: list(readConfig("tileAnyway", "")) };
    const migrated = migrateApps(flag("appListsV2"), tileAll, readConfig("tileClasses", TERMINALS), readConfig("floatClasses", ""));
    if (migrated) {
        for (const k of ["tileClasses", "floatClasses"]) if (k in migrated) apps[k] = list(migrated[k]);
        writeConfig(migrated);
    }
    const defaultRatio = clampRatio(readConfig("masterRatio", 0.55));
    const mirror = Number(readConfig("mainSide", 0)) === 1;
    const mainCount = Math.max(1, Math.min(2, Number(readConfig("maxMain", 1)) || 1));
    const newWindow = Number(readConfig("newWindow", 0)); // 0 stack bottom, 1 stack top, 2 becomes main
    const gap = Math.max(0, Number(readConfig("gap", 0)) || 0);
    const smartGaps = flag("smartGaps", true); // no gap around a lone window
    const mainClasses = list(readConfig("mainClasses", "")); // apps that always take the main slot
    const focusAfterClose = flag("focusAfterClose", true);
    const dragFloats = flag("dragFloats", true);
    const offScreens = list(readConfig("disabledScreens", ""));
    const offDesktops = list(readConfig("disabledDesktops", ""));
    const TILE = 0, SPIRAL = 1, MONOCLE = 2, CENTERED = 3, DWINDLE = 4; // saved by number: append only
    const LAYOUT_LABELS = ["master and stack", "spiral", "monocle", "centered master", "dwindle"];
    const layoutDefault = flag("layoutCentered") ? CENTERED : flag("layoutMonocle") ? MONOCLE : flag("layoutSpiral") ? SPIRAL : TILE;
    const layoutNames = { master: TILE, tile: TILE, spiral: SPIRAL, dwindle: DWINDLE, monocle: MONOCLE, centered: CENTERED, center: CENTERED, centre: CENTERED };
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
    function save() {
        const json = JSON.stringify({ modes, ratios });
        if (json === savedJson) return;
        savedJson = json;
        writeConfig({ savedState: json });
    }

    let order = [];             // tracked windows, oldest first; index 0 of a group = master
    const floating = new Set(); // windows the user took out of the layout
    // Never use WeakSet/WeakMap with windows: after KWin destroys a window the weak table keeps a dangling
    // entry and the next lookup segfaults KWin. Plain Set/Map, cleaned in windowRemoved, instead.
    const hooked = new Set();     // windows whose signals we already connected
    const moving = new Set();     // windows being dragged right now
    const draggedOut = new Set(); // tiled windows the current drag pulled out of the layout
    const home = new Map();       // window -> {output, desktop} it was last laid out in
    let active = null, prevActive = null, closedActive = null, pendingFocus = null;
    const trees = {};           // group key -> dwindle tree (not saved: rebuilt in layout order after a restart)
    let scratch = [];           // windows in the scratchpad, in the order they were sent
    const focusOrder = new Map(); // group key -> its windows in layout order before the focus shortcut
    const laid = {};            // group key -> width kind of the tiles we built last, to read drags from
    let groups = {};            // group key -> {output, desktop} that we laid out last time
    let busy = false;           // ignore tile changes we cause ourselves

    const key = (o, d) => o.name + "|" + d.x11DesktopNumber; // saved across restarts, so no desktop uuid
    const cls = w => String(w.resourceClass).toLowerCase();
    const wanted = w => w.normalWindow && !w.specialWindow && !w.transient &&
        (!tileAll || w.resizeable) && appTiles(cls(w), String(w.caption), apps);
    // a window on another Activity still sits on this screen and desktop: counting it leaves an empty tile
    const onActivity = w => !w.activities.length || w.activities.includes(workspace.currentActivity);
    // hidden from taskbar and switcher = not a window the user manages (e.g. Xwayland Video Bridge: invisible, type normal)
    const helper = w => w.skipTaskbar && w.skipSwitcher;
    const tileable = w => !w.deleted && !floating.has(w) && !scratch.includes(w) && !w.minimized && !w.fullScreen &&
        !helper(w) && w.output && w.desktops.length === 1 && onActivity(w) &&
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
            if (mode === DWINDLE) trees[k] = dwindleSync(trees[k], wins); else delete trees[k];
            if (wins.length > 1 && mode === DWINDLE) {
                const { rects, splits } = dwindleRects(trees[k], ratio, output.geometry.width / output.geometry.height, mirror);
                slots = [];
                let s = 0;
                const build = (n, tile) => {
                    if (!n.kids) { slots.push(tile); return; }
                    const dir = splits[s++], halves = tile.split(dir), swap = mirror && dir === splits[0];
                    build(n.kids[0], halves[swap ? 1 : 0]);
                    build(n.kids[1], halves[swap ? 0 : 1]);
                };
                build(trees[k], root);
                for (let pass = 0; pass < 2; pass++) slots.forEach((t, i) => { t.relativeGeometry = rects[i]; });
            } else if (wins.length > 1 && mode === SPIRAL) {
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
        for (const k in groups) if (!next[k]) { delete laid[k]; delete trees[k]; if (!held.has(k)) delete ratios[k]; }
        groups = next;
        save();
    }

    // true if w was newly tracked
    // force: tile it even though the app lists / resize rule say float (Meta+F on a floating window)
    function track(w, force) {
        if (!(force ? w.normalWindow && !w.specialWindow : wanted(w)) || order.includes(w)) return false;
        order.push(w);
        if (!hooked.has(w)) {
            hooked.add(w);
            for (const sig of ["desktopsChanged", "outputChanged", "minimizedChanged", "fullScreenChanged", "activitiesChanged", "skipTaskbarChanged", "skipSwitcherChanged"])
                w[sig].connect(() => retileAll(keysOf(w)));
            w.tileChanged.connect(() => {
                // KWin moves windows out of tiles we remove into another tile, later (Wayland is async):
                // one we don't lay out (helper, other Activity, ...) would sit invisibly in someone else's tile
                if (!busy && w.tile && order.includes(w) && !floating.has(w) && !tileable(w)) { release(w); return; }
                // dragFloats off: leave its tile empty while dragging; on drop it swaps or snaps back
                if (!dragFloats && !busy && moving.has(w) && order.includes(w) && !w.tile && tileable(w)) { draggedOut.add(w); return; }
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
                if (!hit) { if (!dragFloats) retileAll(keysOf(w)); return; }
                floating.delete(w);
                swapOrder(order, order.indexOf(w), order.indexOf(hit));
                retileAll(keysOf(w));
            });
        }
        return true;
    }

    // move a freshly added window to where the "new windows go" setting wants it
    function place(w) {
        if (!w.output || w.desktops.length !== 1) return;
        if (modeOf(key(w.output, w.desktops[0]), w.desktops[0]).mode === DWINDLE) {
            // dwindle: right after the window that had focus, so it splits that one (KWin focuses w before windowAdded)
            const f = active === w ? prevActive : active;
            if (!f || f === w || !groupOf(w.output, w.desktops[0]).includes(f)) return;
            order = order.filter(x => x !== w);
            order.splice(order.indexOf(f) + 1, 0, w);
            return;
        }
        if (newWindow !== 1 && newWindow !== 2) return;
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
    // Apply on the settings page only writes kwinrc: KWin neither re-reads it nor restarts scripts. So when the
    // user leaves or closes System Settings, have KWin re-read it, and restart Stacklet if its settings changed.
    const settingsApp = w => w && ["systemsettings", "kcmshell6", "org.kde.kcmshell6"].includes(cls(w));
    const reconfigure = () => callDBus("org.kde.KWin", "/KWin", "org.kde.KWin", "reconfigure");
    options.configChanged.connect(() => {
        if (!Object.keys(seen).some(k => k !== "savedState" && !seen[k].slice(1).includes(String(kwinRead(k, seen[k][0]))))) return;
        // A clean off and on. Unload only deletes us later, so a direct Scripting.start would still see us
        // loaded; reconfigure runs start after its timer, once we're gone.
        callDBus("org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting", "unloadScript", "stacklet");
        reconfigure();
    });
    workspace.windowActivated.connect(a => {
        if (settingsApp(active) && !settingsApp(a)) reconfigure();
        // KWin may move focus before windowRemoved fires: remember if the old active window just died
        if (active && active !== a && active.deleted) closedActive = active;
        if (a && a !== active) prevActive = active;
        if (a) active = a;
        const t = pendingFocus;
        pendingFocus = null;
        if (t && a !== t && order.includes(t)) workspace.activeWindow = t; // KWin picked its own; ours wins
    });
    workspace.windowRemoved.connect(w => {
        if (settingsApp(w)) reconfigure();
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
        if (prevActive === w) prevActive = null;
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
        const w = workspace.activeWindow;
        if (!w) return;
        if (!order.includes(w)) {
            // a window Stacklet leaves floating (not in the tile list, system app, ...): tile this one window
            if (!track(w, true)) { osd("Stacklet: this window can't be tiled"); return; }
            osd("Stacklet: tiling this window. Meta+F again floats it.");
        } else if (floating.has(w)) floating.delete(w);
        else {
            floating.add(w);
            if (w.tile) release(w);
        }
        retileAll(keysOf(w));
    });

    // Saved to the list the settings page shows for the current mode.
    // New id (was StackletToggleApp): 1.0.0 saved Meta+Shift+A under the old one, which would hide the new default.
    registerShortcut("StackletToggleAppClass", "Stacklet: Tile / untile this app (shows its window class)", "Meta+Alt+A", () => {
        const w = workspace.activeWindow;
        if (!w || !w.normalWindow || w.specialWindow) return;
        const c = cls(w), t = toggleApp(c, String(w.caption), apps), now = t.tiled;
        Object.assign(apps, t.lists);
        const out = {};
        for (const k in t.lists) out[k] = t.lists[k].join(",");
        writeConfig(out);
        for (const x of workspace.windowList()) {
            if (cls(x) !== c) continue;
            if (now) track(x); else untile(x);
        }
        retileAll();
        osd("Stacklet: " + (now ? "tiling " : "not tiling ") + c + " (saved)");
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

    registerShortcut("StackletNextLayout", "Stacklet: Switch layout (master and stack / spiral / monocle / centered / dwindle)", "Meta+Shift+Space", () =>
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
    if (!flag("welcomed")) { // once: nothing visible happens until a tiled app opens
        osd(tileAll ? "Stacklet is on: tiling all apps. Meta+F floats a window." : "Stacklet is on: tiling terminals. Meta+Alt+A tiles any app.");
        writeConfig({ welcomed: "true" });
    }
}
