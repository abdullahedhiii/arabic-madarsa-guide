# Arabic Madrasa Guide Demo

This repository is split into:

- `backend` - FastAPI extraction and generation API.
- `frontend` - Vite + React client demo for selecting books, extracting pages, and generating learning content.

## Run Backend

```powershell
cd backend
py -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The demo API key is configured in `backend/.env` as `dev-secret-key`.

## Frontend Env

The frontend reads Vite environment variables from `frontend/.env`:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

## Run Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.
