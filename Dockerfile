# Multi-stage build: frontend (Vite) + backend (FastAPI)
# Resulting image serves the React SPA from FastAPI at the same origin,
# so /api calls work without CORS configuration.

# ---------- Stage 1: build frontend ----------
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend ./
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# ---------- Stage 2: backend + static frontend ----------
FROM python:3.11-slim

# Install backend dependencies
WORKDIR /app/backend
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r ./requirements.txt

# Copy backend source
COPY backend ./

# Copy built frontend into backend/static so FastAPI can serve it
COPY --from=frontend-builder /app/frontend/dist ./static

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
