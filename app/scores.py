"""Tiny JSON-file high score store: top 5 per round length."""
import json
from datetime import date
from pathlib import Path

FILE = Path(__file__).resolve().parent.parent / "data" / "scores.json"
KEEP = 5
DURATIONS = ("30", "60", "120")


def load() -> dict:
    if FILE.exists():
        data = json.loads(FILE.read_text())
    else:
        data = {}
    return {d: data.get(d, []) for d in DURATIONS}


def add(duration: int, wpm: float, accuracy: float, topic: str) -> dict:
    data = load()
    entry = {
        "wpm": round(wpm),
        "accuracy": round(accuracy, 1),
        "topic": topic[:60],
        "date": date.today().isoformat(),
    }
    board = data[str(duration)]
    board.append(entry)
    board.sort(key=lambda e: (-e["wpm"], -e["accuracy"]))
    del board[KEEP:]
    FILE.parent.mkdir(exist_ok=True)
    FILE.write_text(json.dumps(data, indent=2))
    rank = next((i + 1 for i, e in enumerate(board) if e is entry), None)
    return {"rank": rank, "new_best": rank == 1}
