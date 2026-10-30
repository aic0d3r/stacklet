"""Fires each Stacklet shortcut in the private KWin started by run.sh and checks the result."""
import os, re, subprocess, sys, time

WORK = os.environ["WORK"]
n = 0


def q(*a):
    return subprocess.run(["qdbus6", *a], capture_output=True, text=True).stdout


def js(code):
    """Runs code inside KWin; returns what it print()s after DUMP."""
    global n
    n += 1
    path, name = f"{WORK}/j{n}.js", f"j{n}"
    open(path, "w").write(code)
    q("org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.loadScript", path, name)
    q("org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting.start")
    time.sleep(0.5)
    log = open(f"{WORK}/kwin.log").read()
    out = subprocess.run(["journalctl", "--user", "-b", "--no-pager"], capture_output=True, text=True).stdout if not log else ""
    hits = re.findall(rf"DUMP{n} (.*)", log + out)
    return hits[-1] if hits else ""


def state():
    """caption -> (x, y, w, h, tiled, minimized), plus the active caption."""
    raw = js("""print("DUMP%d " + workspace.windowList().filter(w => w.normalWindow).map(w => {
      const g = w.frameGeometry; return [w.caption, Math.round(g.x), Math.round(g.y), Math.round(g.width), Math.round(g.height),
      w.tile ? 1 : 0, workspace.activeWindow === w ? 1 : 0, w.minimized ? 1 : 0].join(",") }).join(";"));""" % (n + 1))
    s, active = {}, None
    for item in raw.split(";"):
        if not item:
            continue
        c, x, y, w, h, t, a, mn = item.split(",")
        s[c] = (int(x), int(y), int(w), int(h), int(t), int(mn))
        if a == "1":
            active = c
    return s, active


def focus(caption):
    js('workspace.activeWindow = workspace.windowList().find(w => w.caption === "%s"); print("DUMP%d x");' % (caption, n + 1))


def fire(name):
    q("org.kde.kglobalaccel", "/component/kwin", "org.kde.kglobalaccel.Component.invokeShortcut", name)
    time.sleep(1.2)


def rects(s):
    return {c: v[:4] for c, v in s.items()}


def main_of(s):
    return max(s, key=lambda c: s[c][2] * s[c][3])


fails = 0


def check(label, ok, detail=""):
    global fails
    fails += 0 if ok else 1
    print(("ok    " if ok else "FAIL  ") + label + ("" if ok else "  <- " + detail))


s0, _ = state()
if len(s0) != 4:
    print(f"!! expected 4 windows, found {len(s0)}: {s0}")
    sys.exit(1)
check("start: 4 tiled windows", all(v[4] for v in s0.values()), str(s0))
main0 = main_of(s0)

# Make focused window main
other = next(c for c in sorted(s0) if c != main0)
focus(other)
fire("StackletSetMaster")
s, _ = state()
check("Meta+Shift+Return makes the focused window main", main_of(s) == other, f"main was {main0}, focused {other}, main now {main_of(s)}")

# Float / re-tile
focus(other)
fire("StackletToggleFloat")
s, _ = state()
check("Meta+F floats the focused window", s[other][4] == 0, str(s[other]))
fire("StackletToggleFloat")
s, _ = state()
check("Meta+F again re-tiles it", s[other][4] == 1, str(s[other]))

# Tile / untile this app (all four windows share one class)
fire("StackletToggleAppClass")
s, _ = state()
check("Meta+Alt+A untiles the app's windows", all(v[4] == 0 for v in s.values()), str(s))
focus(other)
fire("StackletToggleFloat")
s, _ = state()
check("Meta+F tiles a window Stacklet leaves floating (that one only)",
      s[other][4] == 1 and all(v[4] == 0 for c, v in s.items() if c != other), str(s))
fire("StackletToggleAppClass")
s, _ = state()
check("Meta+Alt+A again tiles them", all(v[4] == 1 for v in s.values()), str(s))

# Grow / shrink main
sb, _ = state()
m = main_of(sb)
focus(m)
fire("StackletGrowMain")
sg, _ = state()
check("Meta+Alt+] grows the main window", sg[m][2] > sb[m][2], f"{sb[m]} -> {sg[m]}")
fire("StackletShrinkMain")
fire("StackletShrinkMain")
ss, _ = state()
check("Meta+Alt+[ shrinks the main window", ss[m][2] < sg[m][2], f"{sg[m]} -> {ss[m]}")
fire("StackletGrowMain")

# Focus next / previous
focus(m)
fire("StackletFocusNext")
_, a1 = state()
fire("StackletFocusPrev")
_, a2 = state()
check("Meta+Alt+. moves focus to another window", a1 not in (None, m), f"{m} -> {a1}")
check("Meta+Alt+, moves it back", a2 == m, f"{a1} -> {a2}")

# Swap with neighbour
s, _ = state()
m = main_of(s)
focus(m)
before = rects(s)
fire("StackletSwapRight")
s, _ = state()
check("Meta+Alt+Shift+Right swaps the main window with its right neighbour", s[m][:4] != before[m] and rects(s) != before, f"{before[m]} -> {s[m][:4]}")
fire("StackletSwapLeft")
s, _ = state()
check("Meta+Alt+Shift+Left swaps back", rects(s) == before, f"{before} -> {rects(s)}")
stack = sorted((c for c in s if c != m), key=lambda c: s[c][1])
focus(stack[0])
fire("StackletSwapDown")
s2, _ = state()
check("Meta+Alt+Shift+Down swaps within the stack", s2[stack[0]][1] > s[stack[0]][1], f"{s[stack[0]]} -> {s2[stack[0]]}")
fire("StackletSwapUp")
s3, _ = state()
check("Meta+Alt+Shift+Up swaps back", s3[stack[0]][:4] == s[stack[0]][:4], f"{s[stack[0]]} -> {s3[stack[0]]}")

# Rotate stack
s, _ = state()
before = rects(s)
fire("StackletTurnNext")
s, _ = state()
changed = rects(s) != before
check("Meta+Alt+T rotates the stack", changed, str(before))
fire("StackletTurnPrev")
s, _ = state()
check("Meta+Alt+Shift+T rotates it back", rects(s) == before, f"{before} -> {rects(s)}")

# Layouts
s, _ = state()
before = rects(s)
fire("StackletMonocle")
s, _ = state()
check("Meta+Shift+M: every window fills the same area", len(set(rects(s).values())) == 1, str(rects(s)))
fire("StackletMonocle")
s, _ = state()
check("Meta+Shift+M again returns to the tiled layout", rects(s) == before, f"{before} -> {rects(s)}")
fire("StackletNextLayout")
s, _ = state()
check("Meta+Shift+Space switches the layout", rects(s) != before, str(rects(s)))
fire("StackletNextLayout")
fire("StackletNextLayout")
s, _ = state()
m = main_of(s)
check("Meta+Shift+Space reaches centered master (main window in the middle)", s[m][0] + s[m][2] // 2 == 800, str(s[m]))
fire("StackletNextLayout")
s, _ = state()
check("Meta+Shift+Space wraps from centered to the first layout", rects(s) == before, f"{before} -> {rects(s)}")

# Spotlight: centre + stash, then back
m = main_of(s)
side = next(c for c in sorted(s) if c != m)
focus(side)
fire("StackletFocusMode")
s, _ = state()
stash = [c for c in s if c != side]
check("Meta+Alt+C centres the focused window at 70%", s[side][:4] == (240, 0, 1120, 900), str(s[side]))
check("Meta+Alt+C puts the others in 15% stash columns", all(s[c][2] == 240 for c in stash), str(rects(s)))
focus(stash[0])
fire("StackletSetMaster")
s2, _ = state()
check("Meta+Shift+Return swaps a stashed window into the centre", s2[stash[0]][:4] == s[side][:4] and s2[side][:4] == s[stash[0]][:4], str(rects(s2)))
fire("StackletFocusMode")
s, _ = state()
check("Meta+Alt+C again restores the previous layout", rects(s) == before, f"{before} -> {rects(s)}")

# Scratchpad
x, y = sorted(s)[:2]
focus(x)
fire("StackletSendToScratchpad")
focus(y)
fire("StackletSendToScratchpad")
s, _ = state()
rest = [c for c in s if c not in (x, y)]
check("Meta+Ctrl+S hides windows in the scratchpad", s[x][4:] == (0, 1) and s[y][4:] == (0, 1), f"{s[x]} {s[y]}")
check("the other windows re-tile without them", all(s[c][4] for c in rest) and len(set(rects({c: s[c] for c in rest}).values())) == 2, str(rects(s)))
fire("StackletScratchpad")
s, a = state()
check("Meta+S shows the first one centred at 60% x 60%", s[x][:4] == (320, 180, 960, 540) and s[x][5] == 0 and s[y][5] == 1 and a == x, f"{s[x]} {s[y]} active={a}")
fire("StackletScratchpad")
s, _ = state()
check("Meta+S again shows the next one", s[x][5] == 1 and s[y][5] == 0 and s[y][:4] == (320, 180, 960, 540), f"{s[x]} {s[y]}")
fire("StackletScratchpad")
s, _ = state()
check("Meta+S after the last one hides the scratchpad", s[x][5] == 1 and s[y][5] == 1, f"{s[x]} {s[y]}")
for c in (x, y):
    fire("StackletScratchpad")  # shows the first window still in the scratchpad
    focus(c)
    fire("StackletSendToScratchpad")
s, _ = state()
check("Meta+Ctrl+S on a shown window puts it back in tiling", all(v[4] == 1 and v[5] == 0 for v in s.values()), str(s))

# Real key bindings: every default key must reach exactly its Stacklet action, nothing else.
# (invokeShortcut above skips the key, so this is what catches a clash like Meta+Shift+A.)
META, SHIFT, ALT, CTRL = 0x10000000, 0x02000000, 0x08000000, 0x04000000
K = {"Return": 0x01000004, "Space": 0x20, ".": 0x2E, ",": 0x2C, "[": 0x5B, "]": 0x5D,
     "Left": 0x01000012, "Up": 0x01000013, "Right": 0x01000014, "Down": 0x01000015}
BINDINGS = {
    "Meta+Shift+Return": "StackletSetMaster", "Meta+F": "StackletToggleFloat", "Meta+Alt+A": "StackletToggleAppClass",
    "Meta+Shift+M": "StackletMonocle", "Meta+Shift+Space": "StackletNextLayout",
    "Meta+Alt+.": "StackletFocusNext", "Meta+Alt+,": "StackletFocusPrev",
    "Meta+Alt+]": "StackletGrowMain", "Meta+Alt+[": "StackletShrinkMain",
    "Meta+Alt+T": "StackletTurnNext", "Meta+Alt+Shift+T": "StackletTurnPrev",
    "Meta+Alt+C": "StackletFocusMode", "Meta+S": "StackletScratchpad", "Meta+Ctrl+S": "StackletSendToScratchpad",
    **{f"Meta+Alt+Shift+{d}": f"StackletSwap{d}" for d in ("Left", "Right", "Up", "Down")},
}


def code(keys):
    c = 0
    for part in keys.split("+"):
        c |= {"Meta": META, "Shift": SHIFT, "Alt": ALT, "Ctrl": CTRL}.get(part) or K.get(part) or ord(part.upper())
    return c


for keys, action in BINDINGS.items():
    out = q("--literal", "org.kde.kglobalaccel", "/kglobalaccel", "org.kde.KGlobalAccel.getGlobalShortcutsByKey", str(code(keys)))
    owners = re.findall(r'\(ssssssaiai\) "([^"]*)"', out)
    check(f"key {keys} reaches only {action}", owners == [action], f"bound to {owners}")

print("PASS" if not fails else f"FAIL ({fails})")
sys.exit(1 if fails else 0)
