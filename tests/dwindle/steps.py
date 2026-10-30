"""Window script for tests/dwindle/run.sh: opens w1, w2, w3, waits (run.sh focuses w1), opens w4, then closes w3.

usage: steps.py <app id>
"""
import sys
from PyQt6.QtCore import QTimer
from PyQt6.QtWidgets import QApplication, QWidget

app = QApplication(sys.argv)
app.setDesktopFileName(sys.argv[1])
wins = {}


def show(name):
    w = QWidget()
    w.setWindowTitle(name)
    w.resize(300, 200)
    w.show()
    wins[name] = w


for i, name in enumerate(["w1", "w2", "w3"]):
    QTimer.singleShot(400 * i, lambda n=name: show(n))
QTimer.singleShot(6000, lambda: show("w4"))      # run.sh focuses w1 at ~4s
QTimer.singleShot(10000, lambda: wins["w3"].close())
QTimer.singleShot(16000, app.quit)
app.exec()
