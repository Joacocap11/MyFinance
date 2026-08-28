import logging
import time
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.api import public_router, router
from app.config import get_settings

settings = get_settings()
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("myfinance.api")
UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

app = FastAPI(title="MyFinance API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(public_router)
app.include_router(router)


@app.middleware("http")
async def log_requests(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    started = time.perf_counter()
    origin = request.headers.get("origin")
    response: Response
    if (
        request.method in UNSAFE_METHODS
        and origin is not None
        and origin not in settings.cors_origins
    ):
        response = JSONResponse(
            status_code=403,
            content={"detail": "Origen no permitido para modificar datos"},
        )
    else:
        response = await call_next(request)
    logger.info(
        "%s %s %s %.1fms",
        request.method,
        request.url.path,
        response.status_code,
        (time.perf_counter() - started) * 1000,
    )
    return response


@app.exception_handler(IntegrityError)
async def integrity_error(_: Request, exc: IntegrityError) -> JSONResponse:
    logger.warning("Database constraint rejected request: %s", exc.orig)
    return JSONResponse(
        status_code=409, content={"detail": "El recurso entra en conflicto con datos existentes"}
    )


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    from app.db import SessionLocal

    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        return JSONResponse(status_code=503, content={"status": "unavailable"})
    return {"status": "ok"}
