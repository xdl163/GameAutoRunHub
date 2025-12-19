"""任务操作日志数据访问层。"""
from __future__ import annotations

from typing import List, Tuple

from sqlalchemy import func, select
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


def list_logs(
    db: Session,
    *,
    task_ids: List[int] | None = None,
    page: int = 1,
    page_size: int = 20,
) -> Tuple[List[TaskOperationLog], int]:
    page = max(page, 1)
    page_size = max(min(page_size, 200), 1)

    base_stmt = select(TaskOperationLog)
    if task_ids is not None:
        base_stmt = base_stmt.where(TaskOperationLog.task_id.in_(task_ids))

    total = db.scalar(select(func.count()).select_from(base_stmt.subquery())) or 0

    stmt = (
        base_stmt.order_by(TaskOperationLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return db.scalars(stmt).all(), total


__all__ = ["create_log", "list_logs"]
