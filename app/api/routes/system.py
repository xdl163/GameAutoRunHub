"""系统配置相关接口。"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import get_current_user
from app.models.user import User
from app.service import config_service

router = APIRouter()


class GlobalParams(BaseModel):
    default_score_rate: int
    default_multiplier: float


@router.get(
    "/system/global",
    response_model=GlobalParams,
    summary="获取全局参数（管理员及以上）",
    dependencies=[Depends(get_current_user)],
)
async def get_global_params(current=Depends(get_current_user)):
    user: User = current["user"]
    params = config_service.get_global_params(requester=user)
    return GlobalParams(**params)


@router.put(
    "/system/global",
    response_model=GlobalParams,
    summary="更新全局参数（管理员及以上）",
    dependencies=[Depends(get_current_user)],
)
async def update_global_params(payload: GlobalParams, current=Depends(get_current_user)):
    user: User = current["user"]
    params = config_service.update_global_params(
        requester=user,
        default_score_rate=payload.default_score_rate,
        default_multiplier=payload.default_multiplier,
    )
    return GlobalParams(**params)
