import json
from fastapi import HTTPException
from openai import OpenAI
from typing import List

from app.config import (
    EXTRACTIONS_DIR,
    GENERATIONS_DIR,
    OPENROUTER_API_KEY,
    OPENROUTER_BASE_URL,
    QWEN_VISION_MODEL,
)
from app.services.file_storage import new_id, save_json, save_text, read_text


client = OpenAI(
    api_key=OPENROUTER_API_KEY,
    base_url=OPENROUTER_BASE_URL,
)


def safe_json_parse(raw: str) -> dict:
    raw = raw.strip()

    if raw.startswith("```json"):
        raw = raw.replace("```json", "").replace("```", "").strip()
    elif raw.startswith("```"):
        raw = raw.replace("```", "").strip()

    try:
        return json.loads(raw)
    except Exception:
        return {
            "parse_error": True,
            "raw_output": raw
        }


def build_learning_material_prompt(section_markdown: str) -> str:
    return f"""
You are an expert Arabic grammar teacher creating learning material for madrasa students.

STUDENT LEVEL:
- Madrasa student
- Beginner Arabic grammar
- Age around 10+
- Keep explanations simple, clear, and revision-friendly.

CRITICAL ARABIC RULES:
- Preserve Arabic exactly as provided.
- Preserve ALL tashkeel/harakat:
  - َ
  - ِ
  - ُ
  - ْ
  - ّ
  - ً ٍ ٌ
- Never remove harakat.
- Never normalize Arabic spelling.
- Do not invent Arabic examples unless clearly marked as generated.
- Prefer examples from the source text.

CONTENT RULES:
- Base everything ONLY on the provided markdown section.
- Do not add grammar rules not found in the text.
- Generate proper revision notes, not vague one-line notes.
- Generate flashcards for revision.
- Generate quiz questions from the content.
- Solve ONLY the exercises present in the text.
- If no exercise is present, return an empty exercise_answers array.
- For exercise answers:
  - give the correct answer
  - give a short reason
- For dictionary/plural questions:
  - provide common meaning
  - provide common plural
- If uncertain, mention it in teacher_review_flags.
- Return valid JSON only.

NOTES REQUIREMENTS:
- Notes must be useful for exam/revision.
- Explain the main concept clearly.
- Include rules mentioned in the text.
- Include examples from the text.
- Keep explanations simple.
- Do not create advanced grammar explanations beyond the text.

QUIZ REQUIREMENTS:
- Create beginner-friendly questions.
- Mix question types:
  - short_answer
  - multiple_choice
  - fill_in_the_blank
  - true_false
- Every quiz question must include the answer.
- Add a short explanation for the answer.

OUTPUT FORMAT:
{{
  "title": "",
  "summary": "",
  "revision_notes": [
    {{
      "heading": "",
      "explanation": "",
      "examples": [
        {{
          "arabic": "",
          "english": "",
          "note": ""
        }}
      ]
    }}
  ],
  "flashcards": [
    {{
      "front": "",
      "back": "",
      "arabic_focus": ""
    }}
  ],
  "key_terms": [
    {{
      "arabic": "",
      "english": "",
      "simple_explanation": ""
    }}
  ],
  "quiz": [
    {{
      "question_type": "",
      "question": "",
      "options": [],
      "answer": "",
      "explanation": ""
    }}
  ],
  "exercise_answers": [
    {{
      "exercise_number": "",
      "question": "",
      "answer": "",
      "reason": ""
    }}
  ],
  "teacher_review_flags": []
}}

SECTION MARKDOWN:

{section_markdown}
"""


def call_qwen_for_learning_material(markdown: str) -> dict:
    prompt = build_learning_material_prompt(markdown)

    response = client.chat.completions.create(
        model=QWEN_VISION_MODEL,
        messages=[
            {
                "role": "system",
                "content": "You generate structured Arabic grammar learning material. Return valid JSON only."
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        temperature=0.2,
        max_tokens=6000,
    )

    raw_output = response.choices[0].message.content
    return safe_json_parse(raw_output)


def generate_material(extraction_id: str) -> dict:
    extraction_dir = EXTRACTIONS_DIR / extraction_id
    extracted_md_path = extraction_dir / "extracted.md"

    if not extracted_md_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Extraction not found: {extraction_id}"
        )

    markdown = read_text(extracted_md_path)

    generation_id = new_id()
    generation_dir = GENERATIONS_DIR / generation_id
    generation_dir.mkdir(parents=True, exist_ok=True)

    result = call_qwen_for_learning_material(markdown)

    save_json(generation_dir / "learning_material.json", result)

    save_json(
        generation_dir / "metadata.json",
        {
            "generation_id": generation_id,
            "extraction_id": extraction_id,
        }
    )

    return {
        "generation_id": generation_id,
        "extraction_id": extraction_id,
        "result": result,
    }