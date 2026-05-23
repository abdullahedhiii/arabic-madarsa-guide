from pydantic import BaseModel, Field
from typing import List


class ExtractRequest(BaseModel):
    book_id: str
    pages: List[int] = Field(..., min_length=1)


class ExtractResponse(BaseModel):
    extraction_id: str
    book_id: str
    pages: List[int]
    markdown: str


class GenerateRequest(BaseModel):
    extraction_id: str


class GenerateResponse(BaseModel):
    generation_id: str
    extraction_id: str
    result: dict