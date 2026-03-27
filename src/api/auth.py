"""
FastAPI Authentication Module

Validates session tokens created by the Next.js frontend.
The session token is an HMAC-SHA256 signed token containing:
- username: The authenticated user's username
- exp: Unix timestamp when the token expires

Token format: {base64url(payload)}.{hmac_sha256_signature}

This module mirrors the authentication logic in web/lib/auth.ts to ensure
the backend can validate tokens created by the frontend.
"""

import base64
import hashlib
import hmac
import json
import os
import time
from dataclasses import dataclass
from typing import Optional

from fastapi import HTTPException, Request, status


# Constants matching web/lib/auth-shared.ts
SESSION_COOKIE_NAME = "deeptutor_session"
SESSION_TTL_SECONDS = 60 * 60 * 12  # 12 hours


@dataclass
class AuthenticatedUser:
    """Represents an authenticated user extracted from a valid session token."""
    username: str


class AuthenticationError(Exception):
    """Raised when authentication fails."""
    pass


def _get_env(name: str) -> str:
    """Get a required environment variable or raise an error."""
    value = os.environ.get(name)
    if not value:
        raise AuthenticationError(f"Missing required environment variable: {name}")
    return value


def _is_auth_configured() -> bool:
    """Check if authentication is properly configured."""
    return all([
        os.environ.get("APP_LOGIN_USERNAME"),
        os.environ.get("APP_LOGIN_PASSWORD_HASH"),
        os.environ.get("APP_SESSION_SECRET"),
    ])


def _base64url_decode(input_str: str) -> bytes:
    """Decode a base64url-encoded string."""
    # Add padding if necessary
    padding = 4 - len(input_str) % 4
    if padding != 4:
        input_str += "=" * padding
    return base64.urlsafe_b64decode(input_str)


def _sign_payload(payload: str) -> str:
    """
    Create HMAC-SHA256 signature for the payload.
    Mirrors the signPayload function in web/lib/auth.ts
    """
    session_secret = _get_env("APP_SESSION_SECRET")
    signature = hmac.new(
        session_secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return base64.urlsafe_b64encode(signature).rstrip(b"=").decode("utf-8")


def _safe_compare(a: str, b: str) -> bool:
    """
    Constant-time string comparison to prevent timing attacks.
    Mirrors the safeEqual function in web/lib/auth.ts
    """
    if len(a) != len(b):
        return False
    result = 0
    for x, y in zip(a.encode("utf-8"), b.encode("utf-8")):
        result |= x ^ y
    return result == 0


def decode_session_token(token: str) -> Optional[AuthenticatedUser]:
    """
    Decode and validate a session token.
    
    Args:
        token: The session token string (format: {payload}.{signature})
        
    Returns:
        AuthenticatedUser if the token is valid, None otherwise
        
    Raises:
        AuthenticationError: If authentication is not configured
    """
    if not _is_auth_configured():
        # If auth is not configured, allow all requests (development mode)
        return None
    
    if not token:
        return None
    
    # Split token into payload and signature
    parts = token.split(".")
    if len(parts) != 2:
        return None
    
    encoded_payload, signature = parts
    
    # Verify signature
    expected_signature = _sign_payload(encoded_payload)
    if not _safe_compare(signature, expected_signature):
        return None
    
    # Decode and parse payload
    try:
        payload_bytes = _base64url_decode(encoded_payload)
        payload = json.loads(payload_bytes.decode("utf-8"))
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
        return None
    
    # Check expiration
    exp = payload.get("exp")
    if not exp:
        return None
    
    current_timestamp = int(time.time())
    if exp < current_timestamp:
        return None
    
    # Return authenticated user
    username = payload.get("username")
    if not username:
        return None
    
    return AuthenticatedUser(username=username)


def get_session_from_request(request: Request) -> Optional[str]:
    """
    Extract session token from request cookies.
    
    Args:
        request: The FastAPI request object
        
    Returns:
        The session token string if found, None otherwise
    """
    return request.cookies.get(SESSION_COOKIE_NAME)


async def get_current_user(request: Request) -> Optional[AuthenticatedUser]:
    """
    FastAPI dependency to get the current authenticated user.
    
    This dependency can be used to protect API routes:
    
    @app.get("/protected")
    async def protected_route(user: Optional[AuthenticatedUser] = Depends(get_current_user)):
        if not user:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return {"user": user.username}
    
    Args:
        request: The FastAPI request object
        
    Returns:
        AuthenticatedUser if authenticated, None otherwise
        
    Raises:
        HTTPException: 401 Unauthorized if authentication is required but missing
    """
    if not _is_auth_configured():
        # Auth not configured - allow all requests (development mode)
        return None
    
    session_token = get_session_from_request(request)
    if not session_token:
        return None
    
    return decode_session_token(session_token)


async def require_auth(request: Request) -> AuthenticatedUser:
    """
    FastAPI dependency that requires authentication.
    
    Use this for routes that must have a valid session.
    
    @app.get("/protected")
    async def protected_route(user: AuthenticatedUser = Depends(require_auth)):
        return {"user": user.username}
    
    Args:
        request: The FastAPI request object
        
    Returns:
        AuthenticatedUser with valid session
        
    Raises:
        HTTPException: 401 if not authenticated
    """
    if not _is_auth_configured():
        # Auth not configured - allow all requests
        return AuthenticatedUser(username="dev_user")
    
    user = await get_current_user(request)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. Please log in through the frontend.",
            headers={"WWW-Authenticate": "Cookie"},
        )
    
    return user


def hash_password(password: str) -> str:
    """
    Hash a plaintext password using SHA-256.
    Mirrors the hashPlaintextPassword function in web/lib/auth.ts
    
    Note: This is used to generate the password hash for APP_LOGIN_PASSWORD_HASH.
    Run this once to generate a hash for your environment variables.
    """
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def verify_password(password: str, password_hash: str) -> bool:
    """
    Verify a password against its hash.
    
    Args:
        password: The plaintext password
        password_hash: The SHA-256 hash to verify against
        
    Returns:
        True if the password matches, False otherwise
    """
    return _safe_compare(hash_password(password), password_hash)
