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


def _normalize_sections(result: dict):
    sections = result.get("sections")

    if isinstance(sections, list) and sections:
        return sections

    return [result]


def _count_diagrams(sections):
    return sum(1 for section in sections if section.get("diagram"))


def _section_summaries(sections):
    return [
        {
            "section_id": section.get("section_id") or f"section-{index + 1}",
            "title": section.get("title") or f"Section {index + 1}",
        }
        for index, section in enumerate(sections)
    ]


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
        sections = _normalize_sections(result)
        first_section = sections[0] if sections else {}
        first_mini_lesson = first_section.get("mini_lesson") or {}

        generations.append({
            "generation_id": metadata.get("generation_id", generation_dir.name),
            "extraction_id": metadata.get("extraction_id"),
            "book_id": extraction.get("book_id") if extraction else None,
            "pages": extraction.get("pages") if extraction else [],
            "title": result.get("title") or first_section.get("title") or "Generated learning material",
            "summary": result.get("summary") or first_section.get("summary") or first_mini_lesson.get("simple_intro") or "",
            "created_at": _iso_from_mtime(result_path),
            "sections": _section_summaries(sections),
            "counts": {
                "sections": len(sections),
                "mini_lesson_steps": sum(len((section.get("mini_lesson") or {}).get("step_by_step_explanation", [])) for section in sections),
                "revision_notes": sum(len(section.get("revision_notes", [])) for section in sections),
                "flashcards": sum(len(section.get("flashcards", [])) for section in sections),
                "key_terms": sum(len(section.get("key_terms", [])) for section in sections),
                "word_help": sum(len(section.get("word_help", [])) for section in sections),
                "quiz": sum(len(section.get("quiz", [])) for section in sections),
                "exercise_answers": sum(len(section.get("exercise_answers", [])) for section in sections),
                "diagram": _count_diagrams(sections),
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
    extraction = _load_extraction_metadata(metadata.get("extraction_id", ""))

    return {
        "generation_id": metadata.get("generation_id", generation_id),
        "extraction_id": metadata.get("extraction_id"),
        "book_id": extraction.get("book_id") if extraction else None,
        "pages": extraction.get("pages") if extraction else [],
        "result": read_json(result_path),
    }
