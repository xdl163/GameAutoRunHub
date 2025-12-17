"""系统配置领域服务。"""
from __future__ import annotations

from fastapi import HTTPException, status

from app.core import config
from app.models.enums import RoleEnum
from app.models.user import User
from app.repository import config_repository


def _ensure_admin(requester: User):
    if requester.role not in {RoleEnum.ADMIN, RoleEnum.SUPER_ADMIN}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限访问该配置")


def get_global_params(*, requester: User) -> dict:
    _ensure_admin(requester)
    settings = config.get_settings()
    return {
        "default_score_rate": settings.default_score_rate,
        "default_multiplier": settings.default_multiplier,
    }


def update_global_params(*, requester: User, default_score_rate: int, default_multiplier: float) -> dict:
    _ensure_admin(requester)

    raw = config_repository.load_settings()
    raw["DEFAULT_SCORE_RATE"] = default_score_rate
    raw["DEFAULT_MULTIPLIER"] = default_multiplier
    config_repository.save_settings(raw)
    config.get_settings.cache_clear()
    return get_global_params(requester=requester)


__all__ = ["get_global_params", "update_global_params"]
