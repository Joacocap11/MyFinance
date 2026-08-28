from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Annotated

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.config import get_settings
from app.db import get_db


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    salt_text = base64.urlsafe_b64encode(salt).decode()
    digest_text = base64.urlsafe_b64encode(digest).decode()
    return f"scrypt${salt_text}${digest_text}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        _, salt_text, digest_text = encoded.split("$", 2)
        salt = base64.urlsafe_b64decode(salt_text.encode())
        expected = base64.urlsafe_b64decode(digest_text.encode())
        actual = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def _encode(payload: dict[str, object]) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    parts = []
    for value in (header, payload):
        parts.append(
            base64.urlsafe_b64encode(json.dumps(value, separators=(",", ":")).encode())
            .rstrip(b"=")
            .decode()
        )
    unsigned = ".".join(parts)
    signature = hmac.new(
        get_settings().jwt_secret.encode(), unsigned.encode(), hashlib.sha256
    ).digest()
    return f"{unsigned}.{base64.urlsafe_b64encode(signature).rstrip(b'=').decode()}"


def _decode(token: str) -> dict[str, object]:
    try:
        encoded_header, encoded_payload, encoded_signature = token.split(".")
        unsigned = f"{encoded_header}.{encoded_payload}"
        expected = hmac.new(
            get_settings().jwt_secret.encode(), unsigned.encode(), hashlib.sha256
        ).digest()
        actual = base64.urlsafe_b64decode(encoded_signature + "===")
        if not hmac.compare_digest(actual, expected):
            raise ValueError
        header = json.loads(base64.urlsafe_b64decode(encoded_header + "==="))
        payload = json.loads(base64.urlsafe_b64decode(encoded_payload + "==="))
        if (
            not isinstance(header, dict)
            or header.get("alg") != "HS256"
            or header.get("typ") != "JWT"
            or not isinstance(payload, dict)
            or int(payload["exp"]) <= int(time.time())
            or int(payload["sub"]) < 1
        ):
            raise ValueError
        return payload
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        raise HTTPException(status_code=401, detail="Token inválido o expirado") from None


def issue_tokens(user: models.User) -> dict[str, object]:
    settings = get_settings()
    now = int(time.time())
    access = _encode(
        {
            "sub": str(user.id),
            "type": "access",
            "iat": now,
            "exp": now + settings.jwt_access_token_expire_minutes * 60,
        }
    )
    refresh = _encode(
        {
            "sub": str(user.id),
            "type": "refresh",
            "iat": now,
            "exp": now + settings.jwt_refresh_token_expire_days * 86400,
        }
    )
    return {
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "bearer",
        "expires_in": settings.jwt_access_token_expire_minutes * 60,
    }


def current_user(
    authorization: Annotated[str | None, Header()] = None, db: Session = Depends(get_db)
) -> models.User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Autenticación requerida")
    payload = _decode(authorization[7:])
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Token de acceso requerido")
    user = db.get(models.User, int(payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Usuario no disponible")
    db.info["owner_id"] = user.id
    return user


def require_admin(user: CurrentUser) -> models.User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Se requieren permisos de administrador")
    return user


Db = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[models.User, Depends(current_user)]
