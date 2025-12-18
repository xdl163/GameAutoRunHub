"""分组操作日志数据访问层。"""
from __future__ import annotations

from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.group_operation_log import GroupOperationLog


def create_log(
    db: Session,
    *,
    group_id: int,
    user_id: int,
    action: str,
    detail: Optional[str] = None,
) -> GroupOperationLog:
    log = GroupOperationLog(
        group_id=group_id,
        user_id=user_id,
        action=action,
        detail=detail,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def list_logs(db: Session, limit: int = 200) -> List[GroupOperationLog]:
    return db.scalars(select(GroupOperationLog).order_by(GroupOperationLog.created_at.desc()).limit(limit)).all()


__all__ = ["create_log", "list_logs"]

