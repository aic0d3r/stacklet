"""Stand-in for Plasma's shell on the private D-Bus session of tests/save/run.sh, covering what Stacklet uses it for:
evaluateScript, which writes Stacklet's settings to kwinrc (KWin scripts can't write their config), and the on-screen
messages (logged as "OSD <text>").

Not the real plasmashell on purpose: started next to a private KWin, its D-Bus-activated services (kactivitymanagerd,
kded6, portals, kdeconnectd, ...) are started by the user's own systemd session, with the real config folders.
"""
import json
import re
import subprocess

import dbus
import dbus.service
from dbus.mainloop.glib import DBusGMainLoop
from gi.repository import GLib

WRITES = re.compile(r'c\.writeEntry\(("(?:[^"\\]|\\.)*"), ("(?:[^"\\]|\\.)*")\)')


class Shell(dbus.service.Object):
    def __init__(self, bus):
        dbus.service.Object.__init__(self, bus, "/PlasmaShell")

    @dbus.service.method("org.kde.PlasmaShell", in_signature="s")
    def evaluateScript(self, script):
        # ConfigFile('kwinrc', 'Script-stacklet') and its writeEntry(key, value) calls, in order; keys and values are JSON strings
        for key, value in WRITES.findall(script):
            subprocess.run(["kwriteconfig6", "--file", "kwinrc", "--group", "Script-stacklet", "--key",
                            json.loads(key), json.loads(value)], check=True)


class Osd(dbus.service.Object):
    def __init__(self, bus):
        dbus.service.Object.__init__(self, bus, "/org/kde/osdService")

    @dbus.service.method("org.kde.osdService", in_signature="ss")
    def showText(self, icon, text):
        print("OSD " + text, flush=True)


DBusGMainLoop(set_as_default=True)
bus = dbus.SessionBus()
name = dbus.service.BusName("org.kde.plasmashell", bus) # keep a reference: the name is released with the object
Shell(bus)
Osd(bus)
print("shell ready", flush=True)
GLib.MainLoop().run()
