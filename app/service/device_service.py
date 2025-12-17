from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.enums import DevicePlatformEnum, DeviceStatusEnum, RoleEnum
from app.models.user import User
from app.repository import device_repository
from app.service import device_operation_log_service


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
    existing = device_repository.get_by_device_id(db, device_id)
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="设备ID已存在")

    device = device_repository.create_device(
        db,
        device_id=device_id,
        platform=platform,
        config=config,
        remark=remark,
        created_by=requester.id,
    )

    device_operation_log_service.log_action(
        db,
        performer=requester,
        device=device,
        action="create_device",
        detail=f"新建设备 {device.device_id}",
    )

    return device


def list_devices(
    db: Session,
    *,
    requester: User,
    device_id: str | None = None,
    task_id: int | None = None,
    status: DeviceStatusEnum | None = None,
    idle_only: bool = False,
    creator_username: str | None = None,
):
    created_by = None
    username_filter = None

    if requester.role not in {RoleEnum.ADMIN, RoleEnum.SUPER_ADMIN}:
        created_by = requester.id
    else:
        username_filter = creator_username

    return device_repository.list_devices(
        db,
        device_id=device_id,
        task_id=task_id,
        status=status,
        idle_only=idle_only,
        created_by=created_by,
        creator_username=username_filter,
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

    changes = []

    if platform:
        if device.platform != platform:
            changes.append(f"platform: {device.platform} -> {platform}")
        device.platform = platform
    if status:
        if device.status != status:
            changes.append(f"status: {device.status} -> {status}")
        device.status = status
    if config is not None:
        if device.config != config:
            changes.append("config updated")
        device.config = config
    if remark is not None:
        if device.remark != remark:
            changes.append("remark updated")
        device.remark = remark

    updated = device_repository.save(db, device)

    detail = "；".join(changes) if changes else "未变更字段"
    device_operation_log_service.log_action(
        db,
        performer=requester,
        device=updated,
        action="update_device",
        detail=f"修改设备 {updated.device_id}：{detail}",
    )

    return updated


def delete_device(db: Session, *, requester: User, device_pk: int):
    _require_admin(requester)
    device = device_repository.get_by_id(db, device_pk)
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="设备不存在")

    device_operation_log_service.log_action(
        db,
        performer=requester,
        device=device,
        action="delete_device",
        detail=f"删除设备 {device.device_id}",
    )

    device_repository.delete(db, device)


__all__ = ["create_device", "list_devices", "update_device", "delete_device"]
