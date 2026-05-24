from pydantic import BaseModel, Field
from typing import List, Optional


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
    book_id: Optional[str] = None
    pages: List[int] = Field(default_factory=list)
    result: dict
