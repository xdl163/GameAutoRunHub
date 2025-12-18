"""任务操作日志数据访问层。"""
from __future__ import annotations

from typing import List

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import TaskOperationLog


def create_log(
    db: Session,
    *,
    task_id: int,
    user_id: int,
    action: str,
    detail: str | None = None,
) -> TaskOperationLog:
    log = TaskOperationLog(task_id=task_id, user_id=user_id, action=action, detail=detail)
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def list_logs(db: Session, *, task_ids: List[int] | None = None, limit: int = 200) -> List[TaskOperationLog]:
    stmt = select(TaskOperationLog).order_by(TaskOperationLog.created_at.desc()).limit(limit)
    if task_ids is not None:
        stmt = stmt.where(TaskOperationLog.task_id.in_(task_ids))
    return db.scalars(stmt).all()


__all__ = ["create_log", "list_logs"]
