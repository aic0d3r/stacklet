"""Opens two normal windows plus every kind of dialog-ish window under one app id, for tests/dialogs/run.sh.
The window title says what each one is, and run.sh says which of them may get a tile.

usage: windows.py <app id> <seconds to stay open>
"""
import sys
from PyQt6.QtCore import QTimer, Qt
from PyQt6.QtWidgets import QApplication, QDialog, QMessageBox, QWidget

app_id, seconds = sys.argv[1], int(sys.argv[2])
app = QApplication(sys.argv)
app.setDesktopFileName(app_id)
keep = []


def win(title, w, size=(300, 200)):
    w.setWindowTitle(title)
    w.resize(*size)
    w.show()
    keep.append(w)
    return w


main = win("normal-1", QWidget())
steps = [
    lambda: win("normal-2", QWidget()),
    lambda: win("dialog-child", QDialog(main)),                       # transient for main
    lambda: win("about-child", QMessageBox(QMessageBox.Icon.Information, "about-child", "About", parent=main)),
    lambda: win("dialog-modal", QDialog(main)).setModal(True),
    lambda: win("dialog-parentless", QDialog()),                      # dialog with no parent
    lambda: win("fixed-parentless", QWidget()).setFixedSize(320, 180),  # plain window that can't be resized
    lambda: win("tool-child", QWidget(main, Qt.WindowType.Tool)),
    lambda: win("ghost", QWidget()),  # run.sh hides it from taskbar + switcher, like Xwayland Video Bridge
]


def next_step():
    if steps:
        steps.pop(0)()
        QTimer.singleShot(400, next_step)


QTimer.singleShot(400, next_step)
QTimer.singleShot(seconds * 1000, app.quit)
app.exec()
