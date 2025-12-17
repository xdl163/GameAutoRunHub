"""安全相关的工具函数与令牌管理。"""
from __future__ import annotations

import hashlib
import secrets
import string
import threading
from dataclasses import dataclass
from typing import Dict, Optional


@dataclass
class AuthenticatedUser:
    token: str
    user: "User"  # forward declaration for type checkers


# 简单的内存令牌存储，适合演示场景
_ACTIVE_TOKENS: Dict[str, int] = {}
_TOKEN_LOCK = threading.Lock()


def hash_password(raw_password: str) -> str:
    """对明文密码进行 SHA256 哈希。"""

    return hashlib.sha256(raw_password.encode("utf-8")).hexdigest()


def verify_password(raw_password: str, hashed: str) -> bool:
    return hash_password(raw_password) == hashed


def generate_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    with _TOKEN_LOCK:
        _ACTIVE_TOKENS[token] = user_id
    return token


def get_user_id_from_token(token: str) -> Optional[int]:
    with _TOKEN_LOCK:
        return _ACTIVE_TOKENS.get(token)


def invalidate_token(token: str) -> None:
    with _TOKEN_LOCK:
        _ACTIVE_TOKENS.pop(token, None)


def clear_all_tokens() -> None:
    with _TOKEN_LOCK:
        _ACTIVE_TOKENS.clear()


def generate_random_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


__all__ = [
    "AuthenticatedUser",
    "hash_password",
    "verify_password",
    "generate_token",
    "invalidate_token",
    "get_user_id_from_token",
    "clear_all_tokens",
    "generate_random_password",
]
