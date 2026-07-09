import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers import upload, session, analiz
from services import store


@asynccontextmanager
async def lifespan(app: FastAPI):
    store.load_persisted_sessions()
    yield


app = FastAPI(title="Olay Takip API", lifespan=lifespan)
app.include_router(upload.router, prefix="/api/upload", tags=["upload"])
app.include_router(session.router, prefix="/api/sessions", tags=["sessions"])
app.include_router(analiz.router, prefix="/api/analiz", tags=["analiz"])

allowed_origins = os.environ.get("CORS_ALLOWED_ORIGINS", "")
if allowed_origins.strip():
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in allowed_origins.split(",") if o.strip()],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# Serve the built React frontend from backend/static.
# This is mounted last so /api/* routes take precedence.
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
