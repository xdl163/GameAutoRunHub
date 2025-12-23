"""任务数据访问层。"""
from __future__ import annotations

from typing import List, Optional, Sequence, Tuple

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.models import Device, Task, TaskStatusEnum, TaskTypeEnum


def _build_base_query() -> Select[tuple[Task]]:
    return select(Task)


def get_by_id(db: Session, task_id: int) -> Optional[Task]:
    return db.get(Task, task_id)


def list_tasks(
    db: Session,
    *,
    group_ids: Sequence[int] | None = None,
    created_by: int | None = None,
    task_type: TaskTypeEnum | None = None,
    status: TaskStatusEnum | None = None,
    include_all: bool = False,
    device_identifier: str | None = None,
) -> List[Task]:
    stmt = _build_base_query()
    if not include_all:
        if group_ids:
            stmt = stmt.where(Task.group_id.in_(group_ids))
        if created_by is not None:
            stmt = stmt.where(Task.created_by == created_by)
    if task_type:
        stmt = stmt.where(Task.task_type == task_type)
    if status:
        stmt = stmt.where(Task.status == status)

    if device_identifier:
        stmt = stmt.join(Task.device, isouter=True).where(Device.device_id.contains(device_identifier))

    stmt = stmt.order_by(Task.updated_at.desc(), Task.id.desc())
    return db.scalars(stmt).unique().all()


def list_tasks_paginated(
    db: Session,
    *,
    group_ids: Sequence[int] | None = None,
    created_by: int | None = None,
    task_type: TaskTypeEnum | None = None,
    status: TaskStatusEnum | None = None,
    include_all: bool = False,
    page: int = 1,
    page_size: int = 20,
    device_identifier: str | None = None,
) -> Tuple[List[Task], int]:
    page = max(page, 1)
    page_size = max(min(page_size, 200), 1)

    stmt = _build_base_query()
    if not include_all:
        if group_ids:
            stmt = stmt.where(Task.group_id.in_(group_ids))
        if created_by is not None:
            stmt = stmt.where(Task.created_by == created_by)
    if task_type:
        stmt = stmt.where(Task.task_type == task_type)
    if status:
        stmt = stmt.where(Task.status == status)

    if device_identifier:
        stmt = stmt.join(Task.device, isouter=True).where(Device.device_id.contains(device_identifier))

    stmt = stmt.order_by(Task.updated_at.desc(), Task.id.desc())

    total_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.scalar(total_stmt) or 0

    stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    tasks = db.scalars(stmt).unique().all()
    return tasks, total


def create_task(
    db: Session,
    *,
    name: str,
    task_type: TaskTypeEnum,
    group_id: int,
    created_by: int,
    device_id: int | None = None,
    start_time=None,
    status: TaskStatusEnum = TaskStatusEnum.PENDING,
) -> Task:
    task = Task(
        name=name,
        task_type=task_type,
        group_id=group_id,
        created_by=created_by,
        device_id=device_id,
        start_time=start_time,
        status=status,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def save(db: Session, task: Task) -> Task:
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def delete(db: Session, task: Task) -> None:
    db.delete(task)
    db.commit()


__all__ = ["create_task", "delete", "get_by_id", "list_tasks", "save", "list_tasks_paginated"]
