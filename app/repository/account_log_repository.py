"""账户操作日志数据访问层。"""
from __future__ import annotations

from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.account_operation_log import AccountOperationLog


def create_log(
    db: Session,
    *,
    target_user_id: int,
    performed_by: int,
    action: str,
    detail: Optional[str] = None,
) -> AccountOperationLog:
    log = AccountOperationLog(
        target_user_id=target_user_id,
        performed_by=performed_by,
        action=action,
        detail=detail,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def list_logs(db: Session, limit: int = 200) -> List[AccountOperationLog]:
    return db.scalars(
        select(AccountOperationLog)
        .order_by(AccountOperationLog.created_at.desc())
        .limit(limit)
    ).all()


__all__ = ["create_log", "list_logs"]
