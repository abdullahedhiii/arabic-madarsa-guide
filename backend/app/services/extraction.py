import base64
from typing import List

import fitz
from fastapi import HTTPException
from openai import OpenAI

from app.config import (
    BOOKS_DIR,
    EXTRACTIONS_DIR,
    MAX_PAGES_PER_REQUEST,
    OPENROUTER_API_KEY,
    OPENROUTER_BASE_URL,
    QWEN_VISION_MODEL,
)
from app.services.file_storage import new_id, save_text, save_json


client = OpenAI(
    base_url=OPENROUTER_BASE_URL,
    api_key=OPENROUTER_API_KEY,
)


def get_book_path(book_id: str):
    book_path = BOOKS_DIR / f"{book_id}.pdf"

    if not book_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Book not found: {book_id}"
        )

    return book_path


def get_book_total_pages(book_id: str) -> int:
    book_path = get_book_path(book_id)
    doc = fitz.open(book_path)

    try:
        return len(doc)
    finally:
        doc.close()


def validate_pages(pages: List[int]):
    if len(pages) > MAX_PAGES_PER_REQUEST:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_PAGES_PER_REQUEST} pages allowed."
        )

    if any(page <= 0 for page in pages):
        raise HTTPException(
            status_code=400,
            detail="Page numbers must start from 1."
        )

STRICT_EXTRACTION_RULES = """
STRICT EXTRACTION MODE:
- You are performing OCR-style visual copying only.
- You are NOT a teacher in this step.
- You are NOT allowed to correct grammar.
- You are NOT allowed to infer missing labels.
- You are NOT allowed to guess unclear Arabic.
- You are NOT allowed to replace unclear Arabic with a likely term.
- You are NOT allowed to rewrite bilingual text into a single language.
- You are NOT allowed to paraphrase, summarize, translate, simplify, or clean formatting.
- You must copy visible text only.
- The output must remain visually faithful to the page image.
- If a word is unclear, write "[UNCLEAR]".
- If a full line is unreadable, write "[UNREADABLE LINE]".
- Do not generate repeated labels unless they are visibly repeated on the page.
- Do not change signs/headings into another Arabic or English term.
- Do not explain the content.

ANTI-HALLUCINATION RULES:
- If you are not visually certain, do NOT guess.
- It is better to output [UNCLEAR] than to output a likely Arabic word.
- Never complete a partially visible Arabic word.
- Never fill missing parts from grammar knowledge.
- Never use textbook knowledge to repair text.
- Never convert a blurry word into a common grammar term.
- Never add examples that are not visible.
- Never add words because they “make sense”.
- Copy only what your eyes can see.
"""

def build_extraction_prompt(page_num):
    return f"""
You are performing STRICT OCR extraction from a mixed Arabic-English textbook page.

Page number: {page_num}

TASK:
Copy the visible text from the image as faithfully as possible.

{STRICT_EXTRACTION_RULES}

COPYING METHOD:
- Work line by line from top to bottom.
- Within each line, preserve the visible order as much as possible.
- Do not merge separate lines.
- Do not split one visible line into a different explanation.
- For tables, copy row by row.
- For diagrams, copy visible boxes and arrows only.
- Use indentation only to show visible hierarchy.

MIXED LANGUAGE PRESERVATION RULES:
- Many lines contain BOTH Arabic and English.
- Preserve the exact language mixture visible on the page.
- NEVER convert English into Arabic.
- NEVER convert Arabic into English.
- NEVER rewrite mixed-language lines into a single language.
- If a line contains Arabic + English together, preserve BOTH exactly as visible.
- Keep English words inline where they appear.
- Keep Arabic words inline where they appear.
- Do NOT complete partially Arabic lines.
- Do NOT rewrite bilingual educational formatting.

CRITICAL ARABIC RULES:
- Preserve ALL Arabic words exactly as visible.
- Preserve ALL tashkeel/harakat exactly:
  - fathah / zabar (َ)
  - kasrah / zer (ِ)
  - dammah / pesh (ُ)
  - sukoon (ْ)
  - shaddah (ّ)
  - tanween (ً ٍ ٌ)
- NEVER remove harakat.
- NEVER add harakat if not visible.
- NEVER normalize Arabic spelling.
- NEVER substitute a likely Arabic grammar term.
- Arabic words MUST remain inline inside the line where they appear.
- If harakat are unclear, preserve the base letters and mark the unclear part with [UNCLEAR].
- If a full Arabic word is unclear, use [UNCLEAR] instead of guessing.

ENGLISH PRESERVATION RULES:
- Preserve English text EXACTLY as visible.
- Do not remove English words from mixed lines.
- Do not replace English explanations with Arabic.
- If a heading contains Arabic + English, preserve both.
- If a bullet contains Arabic + English, preserve both.

DOCUMENT RULES:
- Preserve headings, examples, exercises, footnotes, and numbering.
- Preserve line breaks as much as possible.
- Do not translate.
- Do not summarize.
- Do not invent missing text.
- Do not add section titles that are not visible.
- Do not add explanations.

DIAGRAM/TABLE RULES:
- If the page contains a diagram, flowchart, relationship tree, or table:
  - Copy only visually observable text.
  - Copy only visually observable structure.
  - Preserve hierarchy using indentation.
  - If some branches are unclear, write [UNCLEAR].
  - Do not invent missing relationships or structure.
  - Do not describe images unless text labels are visible.

SELF-CHECK BEFORE FINAL OUTPUT:
Before returning, silently check:
1. Did I translate anything? If yes, undo it.
2. Did I add any Arabic word not clearly visible? If yes, replace with [UNCLEAR].
3. Did I normalize or correct Arabic? If yes, restore visible form.
4. Did I remove English from a mixed line? If yes, restore it.
5. Did I add grammar knowledge? If yes, remove it.

EXAMPLES:

Visible line:
المركباتُ وَالجُمَلُ – Sentences and Phrases

Correct output:
المركباتُ وَالجُمَلُ – Sentences and Phrases

WRONG:
المركباتُ وَالجُمَلُ – الجمل والعبارات

Visible line:
Types of Sentences

Correct output:
Types of Sentences

WRONG:
أنواع الجمل

Visible blurry Arabic word:
[unclear visual word]

Correct output:
[UNCLEAR]

WRONG:
اِسْمٌ

OUTPUT:
- Return ONLY markdown text.
- Do NOT return JSON.
- Do NOT wrap in ```markdown.
- Do NOT remove tashkeel/harakat from visible Arabic terms.
- Preserve headings and numbering exactly as visible.
"""

def image_bytes_to_data_url(image_bytes: bytes) -> str:
    encoded = base64.b64encode(image_bytes).decode("utf-8")
    return f"data:image/png;base64,{encoded}"


def render_page_to_png_bytes(doc: fitz.Document, page_num: int, zoom: float = 2.5) -> bytes:
    page = doc[page_num - 1]
    matrix = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=matrix, alpha=False)
    return pix.tobytes("png")


def render_book_page_preview(book_id: str, page_num: int) -> bytes:
    if page_num <= 0:
        raise HTTPException(
            status_code=400,
            detail="Page numbers must start from 1."
        )

    book_path = get_book_path(book_id)
    doc = fitz.open(book_path)

    try:
        total_pages = len(doc)
        if page_num > total_pages:
            raise HTTPException(
                status_code=400,
                detail=f"Page {page_num} does not exist. PDF has {total_pages} pages."
            )

        return render_page_to_png_bytes(doc, page_num, zoom=1.35)
    finally:
        doc.close()


def extract_page_with_qwen(page_num: int, image_bytes: bytes) -> str:
    data_url = image_bytes_to_data_url(image_bytes)

    response = client.chat.completions.create(
        model=QWEN_VISION_MODEL,
        messages=[
            {
                "role": "system",
                "content": """
You are a strict OCR engine.
Return ONLY markdown text.
Do NOT return JSON.
Do NOT explain anything.
"""
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": build_extraction_prompt(page_num),
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": data_url},
                    },
                ],
            },
        ],
        temperature=0.0,
        top_p=0.1,
        max_tokens=3000,
    )

    return response.choices[0].message.content


def extract_pages(book_id: str, pages: List[int]) -> dict:
    validate_pages(pages)

    book_path = get_book_path(book_id)

    doc = fitz.open(book_path)
    total_pages = len(doc)

    all_markdown = []

    try:
        for page_num in pages:
            if page_num > total_pages:
                raise HTTPException(
                    status_code=400,
                    detail=f"Page {page_num} does not exist. PDF has {total_pages} pages."
                )

            image_bytes = render_page_to_png_bytes(doc, page_num)
            page_markdown = extract_page_with_qwen(page_num, image_bytes)

            all_markdown.append(f"\n\n<!-- PAGE {page_num} -->\n\n")
            all_markdown.append(page_markdown)

    finally:
        doc.close()

    final_markdown = "\n".join(all_markdown)

    extraction_id = new_id()
    extraction_dir = EXTRACTIONS_DIR / extraction_id
    extraction_dir.mkdir(parents=True, exist_ok=True)

    save_text(extraction_dir / "extracted.md", final_markdown)

    save_json(
        extraction_dir / "metadata.json",
        {
            "extraction_id": extraction_id,
            "book_id": book_id,
            "pages": pages,
            "model": QWEN_VISION_MODEL,
        }
    )

    return {
        "extraction_id": extraction_id,
        "book_id": book_id,
        "pages": pages,
        "markdown": final_markdown,
    }
