from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

from app.auth import verify_api_key
from app.schemas import ExtractRequest, ExtractResponse, GenerateRequest, GenerateResponse
from app.services.file_storage import ensure_dirs
from app.services.extraction import extract_pages
from app.services.generation import generate_material
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
        books.append({
            "book_id": pdf_file.stem,
            "title": pdf_file.stem.replace("_", " ").title()
        })

    return books

@app.post(
    "/extract",
    response_model=ExtractResponse,
    dependencies=[Depends(verify_api_key)]
)
def extract(req: ExtractRequest):
    return extract_pages(
        book_id=req.book_id,
        pages=req.pages
    )


@app.post(
    "/generate",
    response_model=GenerateResponse,
    dependencies=[Depends(verify_api_key)]
)
def generate(req: GenerateRequest):
    return generate_material(
        extraction_id=req.extraction_id
    )