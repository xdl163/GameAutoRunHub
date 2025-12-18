"""任务操作日志领域服务。"""
from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import RoleEnum, TaskOperationLog, TaskStatusEnum, TaskTypeEnum, User
from app.repository import task_operation_log_repository

ALLOWED_ACTIONS = {
    "create_task",
    "start_task",
    "pause_task",
    "resume_task",
    "complete_task",
    "terminate_task",
    "move_task_group",
    "update_task_detail",
    "bind_device",
    "unbind_device",
    "swap_device",
}


def log_action(
    db: Session,
    *,
    performer: User,
    task_id: int,
    action: str,
    detail: str | None = None,
) -> TaskOperationLog | None:
    if action not in ALLOWED_ACTIONS:
        return None
    return task_operation_log_repository.create_log(
        db, task_id=task_id, user_id=performer.id, action=action, detail=detail
    )


def list_logs(db: Session, *, requester: User, task_ids: list[int] | None = None):
    if requester.role in {RoleEnum.ADMIN, RoleEnum.SUPER_ADMIN}:
        return task_operation_log_repository.list_logs(db)
    if task_ids is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权查看所有任务日志")
    return task_operation_log_repository.list_logs(db, task_ids=task_ids)


__all__ = ["log_action", "list_logs", "ALLOWED_ACTIONS"]
