FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app
RUN pip install --no-cache-dir uv
COPY backend/pyproject.toml ./
COPY backend/app ./app
RUN uv sync --no-dev
COPY backend/alembic.ini ./
COPY backend/alembic ./alembic
COPY scripts ./scripts
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
