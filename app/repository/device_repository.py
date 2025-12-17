from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.device import Device
from app.models.enums import DeviceStatusEnum
from app.models.task import Task
from app.models.user import User


def get_by_id(db: Session, device_pk: int) -> Optional[Device]:
    return db.get(Device, device_pk)


def get_by_device_id(db: Session, device_id: str) -> Optional[Device]:
    return db.scalars(select(Device).where(Device.device_id == device_id)).first()


def list_devices(
    db: Session,
    *,
    device_id: str | None = None,
    task_id: int | None = None,
    status: DeviceStatusEnum | None = None,
    idle_only: bool = False,
    created_by: int | None = None,
    creator_username: str | None = None,
) -> List[Device]:
    stmt = select(Device)

    if task_id is not None:
        stmt = stmt.join(Device.tasks).where(Task.id == task_id)

    if creator_username:
        stmt = stmt.join(User, Device.created_by == User.id).where(
            User.username.contains(creator_username)
        )

    if created_by is not None:
        stmt = stmt.where(Device.created_by == created_by)

    if device_id:
        stmt = stmt.where(Device.device_id.contains(device_id))

    if status:
        stmt = stmt.where(Device.status == status)

    if idle_only:
        stmt = stmt.where(Device.status == DeviceStatusEnum.IDLE)

    stmt = stmt.order_by(Device.updated_at.desc())
    return db.scalars(stmt).unique().all()


def create_device(
    db: Session,
    *,
    device_id: str,
    platform,
    config: str | None,
    remark: str | None,
    created_by: int,
) -> Device:
    device = Device(
        device_id=device_id,
        platform=platform,
        config=config,
        remark=remark,
        created_by=created_by,
    )
    db.add(device)
    db.commit()
    db.refresh(device)
    return device


def save(db: Session, device: Device) -> Device:
    db.add(device)
    db.commit()
    db.refresh(device)
    return device


def delete(db: Session, device: Device) -> None:
    db.delete(device)
    db.commit()


__all__ = [
    "get_by_id",
    "get_by_device_id",
    "list_devices",
    "create_device",
    "save",
    "delete",
]
