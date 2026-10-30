"""Window helper for tests/dwindle/run.sh: reads commands from stdin, one per line.

  open NAME    show a plain window titled NAME
  close NAME   close it
  quit

usage: steps.py <app id> < commands
"""
import sys
from PyQt6.QtCore import QSocketNotifier
from PyQt6.QtWidgets import QApplication, QWidget

app = QApplication(sys.argv)
app.setDesktopFileName(sys.argv[1])
wins = {}


def command():
    line = sys.stdin.readline()
    if not line:
        app.quit()
        return
    cmd, _, name = line.strip().partition(" ")
    if cmd == "open":
        w = QWidget()
        w.setWindowTitle(name)
        w.resize(300, 200)
        w.show()
        wins[name] = w
    elif cmd == "close" and name in wins:
        wins.pop(name).close()
    elif cmd == "quit":
        app.quit()


notifier = QSocketNotifier(sys.stdin.fileno(), QSocketNotifier.Type.Read)
notifier.activated.connect(command)
app.exec()
