from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.enums import DevicePlatformEnum, DeviceStatusEnum, RoleEnum
from app.models.user import User
from app.repository import device_repository


def _require_admin(user: User):
    if user.role not in {RoleEnum.ADMIN, RoleEnum.SUPER_ADMIN}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限操作设备")


def create_device(
    db: Session,
    *,
    requester: User,
    device_id: str,
    platform: DevicePlatformEnum,
    config: str | None = None,
    remark: str | None = None,
):
    _require_admin(requester)
    existing = device_repository.get_by_device_id(db, device_id)
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="设备ID已存在")

    return device_repository.create_device(
        db,
        device_id=device_id,
        platform=platform,
        config=config,
        remark=remark,
        created_by=requester.id,
    )


def list_devices(
    db: Session,
    *,
    requester: User,
    device_id: str | None = None,
    task_id: int | None = None,
    status: DeviceStatusEnum | None = None,
    idle_only: bool = False,
):
    return device_repository.list_devices(
        db,
        device_id=device_id,
        task_id=task_id,
        status=status,
        idle_only=idle_only,
    )


def update_device(
    db: Session,
    *,
    requester: User,
    device_pk: int,
    platform: DevicePlatformEnum | None = None,
    status: DeviceStatusEnum | None = None,
    config: str | None = None,
    remark: str | None = None,
):
    _require_admin(requester)
    device = device_repository.get_by_id(db, device_pk)
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="设备不存在")

    if platform:
        device.platform = platform
    if status:
        device.status = status
    if config is not None:
        device.config = config
    if remark is not None:
        device.remark = remark

    return device_repository.save(db, device)


def delete_device(db: Session, *, requester: User, device_pk: int):
    _require_admin(requester)
    device = device_repository.get_by_id(db, device_pk)
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="设备不存在")
    device_repository.delete(db, device)


__all__ = ["create_device", "list_devices", "update_device", "delete_device"]
