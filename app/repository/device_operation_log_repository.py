"""设备操作日志数据访问层。"""
from __future__ import annotations

from typing import List, Optional

from sqlalchemy import select, text
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.orm import Session

from app.models.device_operation_log import DeviceOperationLog


def create_log(
    db: Session,
    *,
    device_id: int,
    user_id: int,
    action: str,
    detail: Optional[str] = None,
) -> DeviceOperationLog:
    log = DeviceOperationLog(
        device_id=device_id,
        user_id=user_id,
        action=action,
        detail=detail,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def list_logs(db: Session, limit: int = 200) -> List[DeviceOperationLog]:
    return db.scalars(
        select(DeviceOperationLog)
        .order_by(DeviceOperationLog.created_at.desc())
        .limit(limit)
    ).all()


def drop_user_fk_constraints(db: Session) -> None:
    """Drop any lingering user foreign key constraints for device logs.

    Older databases may still have the user_id FK even though the model no longer
    declares it. This helper removes such constraints so user deletions are not
    blocked by historical device operation logs.
    """

    constraint_names = [
        row[0]
        for row in db.execute(
            text(
                """
                SELECT CONSTRAINT_NAME
                FROM information_schema.KEY_COLUMN_USAGE
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'device_operation_logs'
                  AND COLUMN_NAME = 'user_id'
                  AND REFERENCED_TABLE_NAME IS NOT NULL
                """
            )
        ).all()
    ]

    if not constraint_names:
        return

    try:
        for name in constraint_names:
            db.execute(
                text(f"ALTER TABLE device_operation_logs DROP FOREIGN KEY {name}")
            )
        db.commit()
    except (OperationalError, ProgrammingError):
        db.rollback()
        raise


__all__ = ["create_log", "list_logs", "drop_user_fk_constraints"]
