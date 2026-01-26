import os
import time
from typing import Optional

import requests
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel

bearer_scheme = HTTPBearer(auto_error=True)

_cached_jwks = {"data": None, "expires_at": 0.0}


class ClerkUser(BaseModel):
    user_id: str
    email: Optional[str] = None


def _get_jwks() -> dict:
    ttl_seconds = int(os.getenv("CLERK_JWKS_TTL_SECONDS", "3600"))
    now = time.time()

    if _cached_jwks["data"] and _cached_jwks["expires_at"] > now:
        return _cached_jwks["data"]

    jwks_url = os.getenv("CLERK_JWKS_URL")
    issuer = os.getenv("CLERK_ISSUER")

    if not jwks_url and issuer:
        jwks_url = issuer.rstrip("/") + "/.well-known/jwks.json"

    if not jwks_url:
        raise RuntimeError("CLERK_JWKS_URL or CLERK_ISSUER must be set")

    response = requests.get(jwks_url, timeout=5)
    response.raise_for_status()
    jwks = response.json()

    _cached_jwks["data"] = jwks
    _cached_jwks["expires_at"] = now + ttl_seconds

    return jwks


def _extract_email(payload: dict) -> Optional[str]:
    for key in ("email", "email_address", "primary_email"):
        if payload.get(key):
            return payload.get(key)

    email_addresses = payload.get("email_addresses")
    if isinstance(email_addresses, list) and email_addresses:
        first_entry = email_addresses[0]
        if isinstance(first_entry, dict):
            return first_entry.get("email_address") or first_entry.get("email")
        if isinstance(first_entry, str):
            return first_entry

    return None


def _get_public_key(jwks: dict, kid: str) -> Optional[dict]:
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return key
    return None


def verify_clerk_token(token: str) -> ClerkUser:
    try:
        jwks = _get_jwks()
        header = jwt.get_unverified_header(token)
        key = _get_public_key(jwks, header.get("kid"))

        if not key:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token key id",
            )

        audience = os.getenv("CLERK_AUDIENCE")
        issuer = os.getenv("CLERK_ISSUER")

        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=audience if audience else None,
            issuer=issuer if issuer else None,
            options={"verify_aud": bool(audience)},
        )

        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing user id",
            )

        return ClerkUser(user_id=user_id, email=_extract_email(payload))
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        ) from exc
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to fetch JWKS",
        ) from exc


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> ClerkUser:
    return verify_clerk_token(credentials.credentials)
