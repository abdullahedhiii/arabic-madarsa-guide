from datetime import datetime, timezone

from fastapi import HTTPException

from app.config import EXTRACTIONS_DIR, GENERATIONS_DIR
from app.services.file_storage import read_json


def _iso_from_mtime(path):
    return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat()


def _load_extraction_metadata(extraction_id: str):
    metadata_path = EXTRACTIONS_DIR / extraction_id / "metadata.json"

    if not metadata_path.exists():
        return None

    return read_json(metadata_path)


def list_generation_history():
    generations = []

    for generation_dir in GENERATIONS_DIR.iterdir():
        if not generation_dir.is_dir():
            continue

        metadata_path = generation_dir / "metadata.json"
        result_path = generation_dir / "learning_material.json"

        if not metadata_path.exists() or not result_path.exists():
            continue

        metadata = read_json(metadata_path)
        result = read_json(result_path)
        extraction = _load_extraction_metadata(metadata.get("extraction_id", ""))
        mini_lesson = result.get("mini_lesson") or {}

        generations.append({
            "generation_id": metadata.get("generation_id", generation_dir.name),
            "extraction_id": metadata.get("extraction_id"),
            "book_id": extraction.get("book_id") if extraction else None,
            "pages": extraction.get("pages") if extraction else [],
            "title": result.get("title") or "Generated learning material",
            "summary": result.get("summary") or mini_lesson.get("simple_intro") or "",
            "created_at": _iso_from_mtime(result_path),
            "counts": {
                "mini_lesson_steps": len(mini_lesson.get("step_by_step_explanation", [])),
                "revision_notes": len(result.get("revision_notes", [])),
                "flashcards": len(result.get("flashcards", [])),
                "key_terms": len(result.get("key_terms", [])),
                "quiz": len(result.get("quiz", [])),
                "exercise_answers": len(result.get("exercise_answers", [])),
                "diagram": 1 if result.get("diagram") else 0,
            }
        })

    return sorted(generations, key=lambda item: item["created_at"], reverse=True)


def get_generation_history_item(generation_id: str):
    generation_dir = GENERATIONS_DIR / generation_id
    metadata_path = generation_dir / "metadata.json"
    result_path = generation_dir / "learning_material.json"

    if not metadata_path.exists() or not result_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Generation not found: {generation_id}"
        )

    metadata = read_json(metadata_path)

    return {
        "generation_id": metadata.get("generation_id", generation_id),
        "extraction_id": metadata.get("extraction_id"),
        "result": read_json(result_path),
    }
