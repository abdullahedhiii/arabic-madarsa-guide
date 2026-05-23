from io import BytesIO

import fitz
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app.schemas import ExtractRequest, ExtractResponse, GenerateRequest, GenerateResponse
from app.services.file_storage import ensure_dirs
from app.services.extraction import extract_pages, render_book_page_preview
from app.services.generation import generate_material
from app.services.history import get_generation_history_item, list_generation_history
from app.config import BOOKS_DIR


app = FastAPI(title="Arabic Madrasa Guide Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # later replace with frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    ensure_dirs()


@app.get("/")
def health_check():
    return {"status": "ok"}


@app.get("/books")
def list_books():
    books = []

    for pdf_file in BOOKS_DIR.glob("*.pdf"):
        doc = fitz.open(pdf_file)
        try:
            total_pages = len(doc)
        finally:
            doc.close()

        books.append({
            "book_id": pdf_file.stem,
            "book_title": pdf_file.stem.replace("_", " ").title(),
            "total_pages": total_pages,
        })

    return books


@app.get("/books/{book_id}/pages/{page_num}/preview")
def preview_book_page(book_id: str, page_num: int):
    image_bytes = render_book_page_preview(book_id=book_id, page_num=page_num)

    return StreamingResponse(
        BytesIO(image_bytes),
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=3600"}
    )


@app.post(
    "/extract",
    response_model=ExtractResponse,
)
def extract(req: ExtractRequest):
    return extract_pages(
        book_id=req.book_id,
        pages=req.pages
    )


@app.post(
    "/generate",
    response_model=GenerateResponse,
)
def generate(req: GenerateRequest):
    return generate_material(
        extraction_id=req.extraction_id
    )


@app.get("/generations")
def generations_history():
    return list_generation_history()


@app.get("/generations/{generation_id}", response_model=GenerateResponse)
def generation_history_item(generation_id: str):
    return get_generation_history_item(generation_id)
