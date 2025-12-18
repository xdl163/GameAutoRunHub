"""设备操作日志领域服务。"""
from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.enums import RoleEnum
from app.models.device import Device
from app.models.user import User
from app.repository import device_operation_log_repository

ALLOWED_ACTIONS = {
    "create_device",
    "update_device",
    "delete_device",
    "bind_task",
    "unbind_task",
}


def log_action(
    db: Session,
    *,
    performer: User,
    device: Device,
    action: str,
    detail: str | None = None,
):
    if action not in ALLOWED_ACTIONS:
        return None
    return device_operation_log_repository.create_log(
        db,
        device_id=device.id,
        user_id=performer.id,
        action=action,
        detail=detail,
    )


def list_logs(db: Session, *, requester: User):
    if requester.role not in {RoleEnum.ADMIN, RoleEnum.SUPER_ADMIN}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限查看日志")
    return device_operation_log_repository.list_logs(db)


__all__ = ["log_action", "list_logs"]
