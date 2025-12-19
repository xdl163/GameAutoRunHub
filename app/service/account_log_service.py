"""账户操作日志领域服务。"""
from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.enums import RoleEnum
from app.models.user import User
from app.repository import account_log_repository


ALLOWED_ACTIONS = {
    "login",
    "logout",
    "create_user",
    "delete_user",
    "change_role",
    "change_status",
    "update_password",
    "reset_password",
}


def log_action(
    db: Session,
    *,
    performer: User,
    target: User,
    action: str,
    detail: str | None = None,
):
    if action not in ALLOWED_ACTIONS:
        return None
    return account_log_repository.create_log(
        db,
        target_user_id=target.id,
        performed_by=performer.id,
        action=action,
        detail=detail,
    )


def list_logs(db: Session, *, requester: User, page: int = 1, page_size: int = 20):
    if requester.role not in {RoleEnum.ADMIN, RoleEnum.SUPER_ADMIN}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限查看日志")
    return account_log_repository.list_logs(db, page=page, page_size=page_size)


__all__ = ["log_action", "list_logs"]
