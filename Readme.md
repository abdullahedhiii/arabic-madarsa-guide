To run backend  <br/>
   switch to backend-development branch <br/>
   activate a new python environemnt and install the requirements: <br/>
```pip install python-multipart==0.0.20 fastapi "uvicorn[standard]" python-dotenv openai pymupdf``

```python -m uvicorn app.main:app --reload ```

Access swagger at 
```http://127.0.0.1:8000/docs```
