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

DIAGRAM_STYLE_GUIDE = """
Available diagram styles:

1. classification_tree
Use when the lesson classifies one main concept into smaller types.
Example: Kalima → Ism / Fi'l / Harf.

2. sentence_anatomy
Use when the lesson explains parts of a sentence, such as verb, doer, receiver.

3. iraab_color_diagram
Use when the lesson explains grammatical case, such as Raf', Nasb, Jarr, or Jazm.

4. flowchart
Use when the lesson gives yes/no rules or steps to identify something.

5. timeline
Use when the lesson explains tense or time, such as past, present, command.

6. effect_diagram
Use when a particle or word affects the i'rab/case of another word.

7. jumla_structure
Use when the lesson explains nominal or verbal sentence structure.

8. dependency_arrows
Use when the lesson explains relationships between words.

9. morphology_breakdown
Use when a word is broken into parts, such as article, root, suffix, or plural marker.

10. comparison_cards
Use when the lesson compares two or more grammar concepts.
"""

def build_learning_material_prompt(section_markdown: str) -> str:
   return f"""
You are an expert Arabic grammar teacher creating EASY and INTERACTIVE learning material for madrasa students.

STUDENT LEVEL:
- Beginner madrasa student
- Age around 10+
- Assume the student is learning Arabic grammar for the first time.
- Use very simple English.
- Use short sentences.
- Avoid difficult grammar terminology unless the source uses it.
- When a term is necessary, explain it simply.

MAIN GOAL:
Create revision material that feels like a friendly mini-lesson, not a hard textbook summary.

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
- Do not make the lesson advanced.
- Break hard ideas into small steps.
- Prefer simple explanation over completeness.
- If the text is unclear, mention it in teacher_review_flags.
- Solve ONLY the exercises present in the text.

SECTION-WISE OUTPUT RULES:
- The input markdown may contain one or more sections.
- Section IDs are NOT hardcoded.
- Extract section_id from the visible section number in the markdown, such as "1.1", "1.2", "2.3".
- If no visible section number exists, use "unknown".
- Use the visible section heading as "title".
- Create one object inside "sections" for each detected section.
- Keep the exact same inner object format for every section.
- Do not merge two different numbered sections.
- Do not split one numbered section unless another numbered section starts.
- All flashcards, quiz questions, exercises, and diagrams must belong only to their own section.

INTERACTIVE LESSON RULES:
- Start with a very simple explanation of the topic.
- Add a “Think about it” question.
- Add a “Try it yourself” mini task.
- Add a “Common mistake” only if supported by the section.
- Add a tiny recap at the end.
- Keep everything beginner-friendly.

ARABIC WORD HELP RULES:
- Add a small "word_help" list for Arabic words that a beginner may not know.
- Include names and example words when they appear, such as Zayd, daraba, ism, fi'l, harf, kitab.
- Keep each meaning very simple, like "Zayd is a person's name" or "daraba means he hit".
- Add a friendly note that explains why the word matters in this lesson.
- Use transliteration only as a helper, not as a replacement for Arabic.
- Do not add words that are not present in the source text.
- If no helpful Arabic words appear in the section, return an empty list.

FLASHCARD RULES:
- Make flashcards short and easy.
- One idea per flashcard.
- Use Arabic examples from the source when possible.
- The back side should be simple enough for a 10-year-old.

QUIZ RULES:
- Generate a short beginner quiz from the section.
- Base quiz questions ONLY on the provided markdown section.
- Do not invent new Arabic examples unless clearly marked as generated.
- Prefer Arabic examples from the source.
- Keep questions easy and interactive.
- Include mixed question types:
  - multiple_choice
  - fill_blank
  - true_false
  - short_answer
- Each quiz question must include:
  - question
  - options, if needed
  - correct_answer
  - simple_explanation
- If the section is too short for a quiz, return an empty list.

EXERCISE ANSWER RULES:
- For each exercise answer:
  - give the correct answer
  - give a short simple reason
- For dictionary/plural questions:
  - provide common meaning
  - provide common plural
- If unsure, say so in teacher_review_flags.

{DIAGRAM_STYLE_GUIDE}

DIAGRAM RULES:
- Create a diagram ONLY if it helps explain the section.
- If no useful diagram applies, set "diagram": null.
- Choose only one best diagram type from the guide.
- Use Arabic exactly as provided.
- Keep diagram labels short.
- Prefer examples from the section.
- Do not invent grammar rules for the diagram.
- Diagram should be simple enough for a beginner.
- The diagram must be returned as JSON data, not as an image.

Return valid JSON only.
OUTPUT FORMAT:
{{
  "sections": [
    {{
      "section_id": "",
      "title": "",
      "difficulty_level": "beginner",
      "mini_lesson": {{
        "simple_intro": "",
        "step_by_step_explanation": [
          ""
        ],
        "think_about_it": {{
          "question": "",
          "hint": "",
          "answer": ""
        }},
        "try_it_yourself": {{
          "task": "",
          "expected_answer": "",
          "simple_reason": ""
        }},
        "common_mistake": {{
          "mistake": "",
          "correction": ""
        }},
        "tiny_recap": [
          ""
        ]
      }},
      "key_terms": [
        {{
          "arabic": "",
          "english": "",
          "simple_explanation": "",
          "example_from_text": ""
        }}
      ],
      "word_help": [
        {{
          "arabic": "",
          "transliteration": "",
          "english": "",
          "kid_note": "",
          "why_it_matters": ""
        }}
      ],
      "flashcards": [
        {{
          "front": "",
          "back": "",
          "arabic_focus": ""
        }}
      ],
      "quiz": [
        {{
          "type": "multiple_choice",
          "question": "",
          "options": ["", "", "", ""],
          "correct_answer": "",
          "simple_explanation": ""
        }},
        {{
          "type": "fill_blank",
          "question": "",
          "options": [],
          "correct_answer": "",
          "simple_explanation": ""
        }},
        {{
          "type": "true_false",
          "question": "",
          "options": ["True", "False"],
          "correct_answer": "",
          "simple_explanation": ""
        }},
        {{
          "type": "short_answer",
          "question": "",
          "options": [],
          "correct_answer": "",
          "simple_explanation": ""
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
      "diagram": {{
        "type": "",
        "title": "",
        "purpose": "",
        "source_example": "",
        "nodes": [
          {{
            "id": "",
            "label": "",
            "arabic": "",
            "english": "",
            "role": "",
            "color_hint": ""
          }}
        ],
        "connections": [
          {{
            "from": "",
            "to": "",
            "label": ""
          }}
        ],
        "notes": []
      }},
      "teacher_review_flags": []
    }}
  ]
}}
IMPORTANT:
- Keep quiz questions separate from exercise answers.
- Quiz questions are generated for practice.
- Exercise answers are only for exercises already present in the source text.
- If there is no common mistake supported by the section, use:
  "common_mistake": null
- If there is no suitable diagram, use:
  "diagram": null
- Do not include markdown outside the JSON.
- Do not include explanations outside the JSON.
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
