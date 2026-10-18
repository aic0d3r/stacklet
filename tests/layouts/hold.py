"""Opens N plain Qt windows under an app id (= window class) and keeps them open, for tests/layouts/run.sh.

usage: hold.py <app id> <count> <seconds to stay open>
"""
import sys
from PyQt6.QtCore import QTimer
from PyQt6.QtWidgets import QApplication, QWidget

app_id, count, seconds = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
app = QApplication(sys.argv)
app.setDesktopFileName(app_id)
windows = []


def open_next():
    w = QWidget()
    w.setWindowTitle(f"w{len(windows) + 1}")
    w.resize(300, 200)
    w.show()
    windows.append(w)
    if len(windows) < count:
        QTimer.singleShot(400, open_next)  # one at a time, like a person opening terminals


open_next()
QTimer.singleShot(seconds * 1000, app.quit)
app.exec()
