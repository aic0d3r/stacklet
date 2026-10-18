"""Opens and closes plain Qt windows under a given app id (= window class), for tests/stress/run.sh.

usage: churn.py <app id> <how many windows in total> <how many stay open at once>
"""
import sys
from PyQt6.QtCore import QTimer
from PyQt6.QtWidgets import QApplication, QWidget

app_id, total, hold = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
app = QApplication(sys.argv)
app.setDesktopFileName(app_id)
state = {"opened": 0, "open": []}


def step():
    if state["opened"] >= total and not state["open"]:
        app.quit()
        return
    if state["opened"] < total:
        w = QWidget()
        w.setWindowTitle(f"churn{state['opened']}")
        w.resize(300, 200)
        w.show()
        state["open"].append(w)
        state["opened"] += 1
    # close the oldest while newer ones stay open: add and remove overlap, as in real use
    if len(state["open"]) > hold or state["opened"] >= total:
        state["open"].pop(0).close()


timer = QTimer()
timer.timeout.connect(step)
timer.start(120)
QTimer.singleShot(180_000, app.quit)  # never hang a test run
app.exec()
print("churn done", total, flush=True)
