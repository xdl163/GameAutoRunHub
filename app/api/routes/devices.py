"""设备相关接口。"""

from __future__ import annotations

from datetime import datetime
from typing import Dict, List

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import get_current_user, get_db
from app.models.enums import DevicePlatformEnum, DeviceStatusEnum
from app.models.user import User
from app.service import device_service

router = APIRouter()


class DeviceCreate(BaseModel):
    device_id: str
    platform: DevicePlatformEnum
    config: str | None = None
    remark: str | None = None


class DeviceUpdate(BaseModel):
    platform: DevicePlatformEnum | None = None
    status: DeviceStatusEnum | None = None
    config: str | None = None
    remark: str | None = None


class DeviceRead(BaseModel):
    id: int
    device_id: str
    platform: DevicePlatformEnum
    status: DeviceStatusEnum
    config: str | None
    remark: str | None
    created_by: int
    created_by_username: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DeviceListResponse(BaseModel):
    items: List[DeviceRead]
    total: int
    page: int
    page_size: int


def _build_user_map(db, devices: List):
    user_ids = {getattr(d, "created_by", None) for d in devices if getattr(d, "created_by", None)}
    if not user_ids:
        return {}
    fetched = db.scalars(select(User).where(User.id.in_(user_ids))).all()
    return {u.id: u.username for u in fetched}


def _as_device_read(device, user_map: Dict[int, str] | None = None) -> DeviceRead:
    user_map = user_map or {}
    return DeviceRead(
        id=device.id,
        device_id=device.device_id,
        platform=device.platform,
        status=device.status,
        config=device.config,
        remark=device.remark,
        created_by=device.created_by,
        created_by_username=user_map.get(device.created_by),
        created_at=device.created_at,
        updated_at=device.updated_at,
    )


@router.get(
    "/devices",
    response_model=DeviceListResponse,
    summary="查询设备列表",
    dependencies=[Depends(get_current_user)],
)
async def list_devices(
    device_id: str | None = None,
    task_id: int | None = None,
    status: DeviceStatusEnum | None = None,
    idle_only: bool = False,
    username: str | None = None,
    page: int = 1,
    page_size: int = 20,
    current=Depends(get_current_user),
    db=Depends(get_db),
):
    user: User = current["user"]
    devices, total = device_service.list_devices(
        db,
        requester=user,
        device_id=device_id,
        task_id=task_id,
        status=status,
        idle_only=idle_only,
        creator_username=username,
        owner_only=False,
        page=page,
        page_size=page_size,
    )
    user_map = _build_user_map(db, devices)
    return DeviceListResponse(
        items=[_as_device_read(device, user_map) for device in devices],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/devices/options",
    response_model=List[DeviceRead],
    summary="设备选择列表",
    dependencies=[Depends(get_current_user)],
)
async def list_device_options(q: str | None = None, idle_only: bool = True, current=Depends(get_current_user), db=Depends(get_db)):
    user: User = current["user"]
    devices, _ = device_service.list_devices(
        db, requester=user, device_id=q, idle_only=idle_only, owner_only=True, page_size=200
    )
    user_map = _build_user_map(db, devices)
    return [_as_device_read(device, user_map) for device in devices]


@router.get(
    "/devices/idle",
    response_model=List[DeviceRead],
    summary="查看空闲设备",
    dependencies=[Depends(get_current_user)],
)
async def list_idle_devices(current=Depends(get_current_user), db=Depends(get_db)):
    user: User = current["user"]
    devices, _ = device_service.list_devices(db, requester=user, idle_only=True, owner_only=True, page_size=200)
    user_map = _build_user_map(db, devices)
    return [_as_device_read(device, user_map) for device in devices]


@router.post(
    "/devices",
    response_model=DeviceRead,
    status_code=status.HTTP_201_CREATED,
    summary="新建设备",
    dependencies=[Depends(get_current_user)],
)
async def create_device(payload: DeviceCreate, current=Depends(get_current_user), db=Depends(get_db)):
    user: User = current["user"]
    device = device_service.create_device(
        db,
        requester=user,
        device_id=payload.device_id,
        platform=payload.platform,
        config=payload.config,
        remark=payload.remark,
    )
    return _as_device_read(device, {user.id: user.username})


@router.put(
    "/devices/{device_id}",
    response_model=DeviceRead,
    summary="修改设备",
    dependencies=[Depends(get_current_user)],
)
async def update_device(
    device_id: int, payload: DeviceUpdate, current=Depends(get_current_user), db=Depends(get_db)
):
    user: User = current["user"]
    device = device_service.update_device(
        db, requester=user, device_pk=device_id, **payload.dict(exclude_unset=True)
    )
    creator_map = _build_user_map(db, [device])
    return _as_device_read(device, creator_map)


@router.delete(
    "/devices/{device_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="删除设备",
    dependencies=[Depends(get_current_user)],
)
async def delete_device(device_id: int, current=Depends(get_current_user), db=Depends(get_db)):
    user: User = current["user"]
    device_service.delete_device(db, requester=user, device_pk=device_id)
    return None
