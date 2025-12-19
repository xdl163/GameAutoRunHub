"""账户操作日志数据访问层。"""
from __future__ import annotations

from typing import List, Optional, Tuple

from sqlalchemy import func, select
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


def list_logs(db: Session, *, page: int = 1, page_size: int = 20) -> Tuple[List[AccountOperationLog], int]:
    page = max(page, 1)
    page_size = max(min(page_size, 200), 1)

    base_stmt = select(AccountOperationLog)
    total = db.scalar(select(func.count()).select_from(base_stmt.subquery())) or 0

    logs = db.scalars(
        base_stmt.order_by(AccountOperationLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return logs, total


__all__ = ["create_log", "list_logs"]
