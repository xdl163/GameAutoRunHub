"""分组操作日志领域服务。"""
from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import RoleEnum, User
from app.repository import group_operation_log_repository

ALLOWED_ACTIONS = {
    "create_group",
    "update_group",
    "delete_group",
}


def log_action(
    db: Session,
    *,
    performer: User,
    group_id: int,
    action: str,
    detail: str | None = None,
):
    if action not in ALLOWED_ACTIONS:
        return None
    return group_operation_log_repository.create_log(
        db,
        group_id=group_id,
        user_id=performer.id,
        action=action,
        detail=detail,
    )


def list_logs(db: Session, *, requester: User):
    if requester.role not in {RoleEnum.ADMIN, RoleEnum.SUPER_ADMIN}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限查看分组日志")
    return group_operation_log_repository.list_logs(db)


__all__ = ["log_action", "list_logs", "ALLOWED_ACTIONS"]

