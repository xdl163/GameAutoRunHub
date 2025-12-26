"""任务数据访问层。"""
from __future__ import annotations

from typing import List, Optional, Sequence, Tuple

from sqlalchemy import Select, asc, case, desc, func, select, text
from sqlalchemy.orm import Session

from app.models import (
    ChestTaskDetail,
    Device,
    MultiplierTaskDetail,
    ScoreTaskDetail,
    Task,
    TaskStatusEnum,
    TaskTypeEnum,
)


def _build_base_query() -> Select[tuple[Task]]:
    return select(Task)


def _order_nulls_last(column, descending: bool = False):
    nulls_last_flag = case((column.is_(None), 1), else_=0)
    direction = desc if descending else asc
    return nulls_last_flag, direction(column)


def _attach_detail_joins(stmt: Select[tuple[Task]]) -> Select[tuple[Task]]:
    return (
        stmt.outerjoin(ScoreTaskDetail, ScoreTaskDetail.task_id == Task.id)
        .outerjoin(MultiplierTaskDetail, MultiplierTaskDetail.task_id == Task.id)
        .outerjoin(ChestTaskDetail, ChestTaskDetail.task_id == Task.id)
    )


def _remaining_seconds_expr():
    start_expr = func.coalesce(Task.start_time, func.now())
    paused_expr = func.coalesce(Task.paused_seconds, 0)

    score_remaining_points = func.greatest(
        func.coalesce(ScoreTaskDetail.target_points, 0) - func.coalesce(ScoreTaskDetail.current_points, 0),
        0,
    )
    score_rate = func.nullif(func.coalesce(ScoreTaskDetail.point_rate, 0), 0)
    score_duration_seconds = func.coalesce(score_remaining_points * 3600 / score_rate, 0)

    multiplier_duration_seconds = func.coalesce(MultiplierTaskDetail.duration_hours, 0)
    chest_duration_seconds = func.coalesce(ChestTaskDetail.duration_hours, 0)

    finish_time_expr = case(
        (Task.task_type == TaskTypeEnum.SCORE, func.timestampadd(text("SECOND"), paused_expr + score_duration_seconds, start_expr)),
        (Task.task_type == TaskTypeEnum.MULTIPLIER, func.timestampadd(text("SECOND"), paused_expr + multiplier_duration_seconds, start_expr)),
        (Task.task_type == TaskTypeEnum.CHEST, func.timestampadd(text("SECOND"), paused_expr + chest_duration_seconds, start_expr)),
        else_=None,
    )

    remaining_seconds = func.coalesce(func.timestampdiff(text("SECOND"), func.now(), finish_time_expr), 999999999)
    normalized_remaining = func.greatest(remaining_seconds, 0)

    return case(
        (Task.status.in_((TaskStatusEnum.COMPLETED, TaskStatusEnum.TERMINATED)), 0),
        else_=normalized_remaining,
    )


def _apply_sorting(stmt: Select[tuple[Task]], sort_by: str | None) -> Select[tuple[Task]]:
    sort_key = (sort_by or "status").lower()
    status_order = case(
        (Task.status == TaskStatusEnum.RUNNING, 0),
        (Task.status == TaskStatusEnum.PAUSED, 1),
        (Task.status == TaskStatusEnum.PENDING, 2),
        (Task.status == TaskStatusEnum.COMPLETED, 3),
        (Task.status == TaskStatusEnum.TERMINATED, 4),
        else_=5,
    )

    if sort_key in {"status", ""}:
        return stmt.order_by(status_order, Task.updated_at.desc(), Task.id.desc())
    if sort_key == "type":
        return stmt.order_by(Task.task_type, Task.updated_at.desc(), Task.id.desc())
    if sort_key in {"start_time", "start_time_asc"}:
        nulls_last_flag, ordered = _order_nulls_last(Task.start_time, descending=False)
        return stmt.order_by(nulls_last_flag, ordered, Task.id.desc())
    if sort_key == "start_time_desc":
        nulls_last_flag, ordered = _order_nulls_last(Task.start_time, descending=True)
        return stmt.order_by(nulls_last_flag, ordered, Task.id.desc())
    if sort_key in {"remaining_asc", "remaining_desc"}:
        stmt = _attach_detail_joins(stmt)
        remaining_expr = _remaining_seconds_expr()
        nulls_last_flag, ordered = _order_nulls_last(remaining_expr, descending=sort_key.endswith("desc"))
        return stmt.order_by(nulls_last_flag, ordered, Task.id.desc())

    return stmt.order_by(Task.updated_at.desc(), Task.id.desc())


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
    sort_by: str | None = None,
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

    stmt = _apply_sorting(stmt, sort_by)
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
    sort_by: str | None = None,
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

    stmt = _apply_sorting(stmt, sort_by)

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
