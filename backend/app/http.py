"""HTTP platform: CORS, security headers and safe error handling."""
import logging
import uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings

logger = logging.getLogger("app.http")

_CSP = "default-src 'none'; frame-ancestors 'none'"
_DOCS_PATHS = ("/docs", "/redoc", "/openapi.json")


def apply_security_headers(response, path: str) -> None:
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    docs_relaxed = settings.ENABLE_API_DOCS and path.startswith(_DOCS_PATHS)
    if not docs_relaxed:
        response.headers["Content-Security-Policy"] = _CSP
    if settings.ENVIRONMENT == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"


class StatusConflict(HTTPException):
    """409 for an action not allowed in the resource's current status.

    Rendered as `{"detail": ..., "current_status": ..., **extra}` by `status_conflict_handler`
    (e.g. `missing_document_types` on submit).
    """

    def __init__(self, detail: str, current_status: str, **extra):
        super().__init__(status_code=409, detail=detail)
        self.current_status = current_status
        self.extra = extra


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        apply_security_headers(response, request.url.path)
        return response


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    error_id = str(uuid.uuid4())
    logger.error(
        "Unhandled exception error_id=%s %s %s",
        error_id,
        request.method,
        request.url.path,
        exc_info=(type(exc), exc, exc.__traceback__),
    )
    response = JSONResponse(
        status_code=500, content={"detail": "Internal server error", "error_id": error_id}
    )
    # This handler runs outside the user middleware stack (security headers and CORS),
    # so add both here; browsers need CORS to read error_id.
    apply_security_headers(response, request.url.path)
    origin = request.headers.get("origin")
    if origin and origin in settings.cors_origin_list:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Vary"] = "Origin"
    return response


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    # Pydantic's `input`/`ctx`/`url` would echo submitted values (passwords) back; keep only the shape.
    detail = [
        {"loc": list(err.get("loc", ())), "msg": str(err.get("msg", "")), "type": str(err.get("type", ""))}
        for err in exc.errors()
    ]
    response = JSONResponse(status_code=422, content={"detail": detail})
    apply_security_headers(response, request.url.path)
    return response


async def status_conflict_handler(request: Request, exc: StatusConflict) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={**exc.extra, "detail": exc.detail, "current_status": exc.current_status},
    )


def install(app: FastAPI) -> None:
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(StatusConflict, status_conflict_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
