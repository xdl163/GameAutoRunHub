"""设备操作日志数据访问层。"""
from __future__ import annotations

from typing import List, Optional

from sqlalchemy import delete, select
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


def delete_logs_for_device(db: Session, device_id: int) -> None:
    db.execute(delete(DeviceOperationLog).where(DeviceOperationLog.device_id == device_id))
    db.commit()


__all__ = ["create_log", "list_logs", "delete_logs_for_device"]
