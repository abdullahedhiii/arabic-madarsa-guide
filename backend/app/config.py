from pathlib import Path
from dotenv import load_dotenv
import os

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

STORAGE_DIR = BASE_DIR / "storage"
BOOKS_DIR = STORAGE_DIR / "books"
EXTRACTIONS_DIR = STORAGE_DIR / "extractions"
GENERATIONS_DIR = STORAGE_DIR / "generations"

API_KEY = os.getenv("API_KEY")

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_BASE_URL = os.getenv(
    "OPENROUTER_BASE_URL",
    "https://openrouter.ai/api/v1"
)
QWEN_VISION_MODEL = os.getenv(
    "QWEN_VISION_MODEL",
    "qwen/qwen2.5-vl-72b-instruct"
)

MAX_PAGES_PER_REQUEST = 5