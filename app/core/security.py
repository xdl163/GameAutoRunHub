"""安全相关的工具函数。"""
from __future__ import annotations

import hashlib


def hash_password(raw_password: str) -> str:
    """对明文密码进行 SHA256 哈希。"""

    return hashlib.sha256(raw_password.encode("utf-8")).hexdigest()
