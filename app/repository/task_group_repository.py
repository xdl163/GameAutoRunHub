"""任务分组数据访问层。"""
from __future__ import annotations

from typing import List, Optional, Sequence

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.models import Task, TaskGroup


def _build_base_query() -> Select[tuple[TaskGroup]]:
    return select(TaskGroup)


def get_by_id(db: Session, group_id: int) -> Optional[TaskGroup]:
    return db.get(TaskGroup, group_id)


def get_default(db: Session) -> Optional[TaskGroup]:
    return db.scalars(select(TaskGroup).where(TaskGroup.is_default.is_(True))).first()


def list_all(db: Session) -> List[TaskGroup]:
    return db.scalars(_build_base_query().order_by(TaskGroup.id)).all()


def list_by_ids(db: Session, group_ids: Sequence[int]) -> List[TaskGroup]:
    if not group_ids:
        return []
    stmt = _build_base_query().where(TaskGroup.id.in_(group_ids)).order_by(TaskGroup.id)
    return db.scalars(stmt).all()


def list_owned_or_authorized(db: Session, *, owner_id: int, authorized_group_ids: Sequence[int]) -> List[TaskGroup]:
    stmt = _build_base_query().where(
        (TaskGroup.created_by == owner_id) | (TaskGroup.id.in_(authorized_group_ids))
    ).order_by(TaskGroup.id)
    return db.scalars(stmt).all()


def create_group(
    db: Session,
    *,
    name: str,
    description: str | None,
    is_default: bool,
    created_by: int,
) -> TaskGroup:
    group = TaskGroup(
        name=name,
        description=description,
        is_default=is_default,
        created_by=created_by,
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


def save(db: Session, group: TaskGroup) -> TaskGroup:
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


def delete(db: Session, group: TaskGroup) -> None:
    db.delete(group)
    db.commit()


def move_tasks_to_group(db: Session, source_group_id: int, target_group_id: int) -> None:
    tasks = db.scalars(select(Task).where(Task.group_id == source_group_id)).all()
    for task in tasks:
        task.group_id = target_group_id
        db.add(task)
    db.commit()


__all__ = [
    "create_group",
    "delete",
    "get_by_id",
    "get_default",
    "list_all",
    "list_by_ids",
    "list_owned_or_authorized",
    "move_tasks_to_group",
    "save",
]
