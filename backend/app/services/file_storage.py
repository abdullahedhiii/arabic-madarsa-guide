import json
from pathlib import Path
from uuid import uuid4

from app.config import EXTRACTIONS_DIR, GENERATIONS_DIR, BOOKS_DIR


def ensure_dirs():
    BOOKS_DIR.mkdir(parents=True, exist_ok=True)
    EXTRACTIONS_DIR.mkdir(parents=True, exist_ok=True)
    GENERATIONS_DIR.mkdir(parents=True, exist_ok=True)


def new_id():
    return str(uuid4())


def save_json(path: Path, data: dict):
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def save_text(path: Path, text: str):
    path.write_text(text, encoding="utf-8")


def read_text(path: Path):
    return path.read_text(encoding="utf-8")