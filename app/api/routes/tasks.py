"""任务相关接口。"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel

from app.api.deps import get_current_user, get_db
from app.core import config
from app.models.enums import TaskStatusEnum, TaskTypeEnum
from app.models.user import User
from app.service import task_service

router = APIRouter()


class TaskCreate(BaseModel):
    name: str | None = None
    task_type: TaskTypeEnum
    group_id: int
    device_id: int
    start_time: datetime | None = None
    score_point_rate: int | None = None
    score_target: int | None = None
    score_current: int | None = None
    multiplier_hours: int | None = None
    multiplier_initial: float | None = None
    multiplier_current: float | None = None
    chest_hours: int | None = None


class TaskRead(BaseModel):
    id: int
    name: str
    task_type: TaskTypeEnum
    status: TaskStatusEnum
    group_id: int
    device_id: int | None
    device_identifier: str | None = None
    created_by: int
    start_time: datetime | None
    end_time: datetime | None
    paused_seconds: int | None
    paused_at: datetime | None
    point_rate: Optional[int] = None
    target_points: Optional[int] = None
    current_points: Optional[int] = None
    duration_hours: Optional[int] = None
    initial_multiplier: Optional[float] = None
    current_multiplier: Optional[float] = None
    updated_at: datetime

    class Config:
        from_attributes = True


class TaskListResponse(BaseModel):
    items: list[TaskRead]
    total: int
    page: int
    page_size: int


class TaskStatusChange(BaseModel):
    action: str


class TaskAdjustPayload(BaseModel):
    add_points: int | None = None
    add_hours: int | None = None


class TaskDetailUpdatePayload(BaseModel):
    score_target: int | None = None
    score_rate: int | None = None
    multiplier_hours: int | None = None
    multiplier_initial: float | None = None
    multiplier_increment: float | None = None
    chest_hours: int | None = None


class MoveTaskPayload(BaseModel):
    target_group_id: int


class BindDevicePayload(BaseModel):
    device_id: int | None


class TaskDefaults(BaseModel):
    default_score_rate: int
    default_multiplier: float


def _as_task_read(task) -> TaskRead:
    point_rate = getattr(task.score_detail, "point_rate", None)
    target_points = getattr(task.score_detail, "target_points", None)
    current_points = getattr(task.score_detail, "current_points", None)

    duration_hours = None
    initial_multiplier = None
    current_multiplier = None
    if getattr(task, "multiplier_detail", None):
        duration_hours = task.multiplier_detail.duration_hours
        initial_multiplier = task.multiplier_detail.initial_multiplier
        current_multiplier = task.multiplier_detail.current_multiplier
    if getattr(task, "chest_detail", None):
        duration_hours = task.chest_detail.duration_hours

    return TaskRead(
        id=task.id,
        name=task.name,
        task_type=task.task_type,
        status=task.status,
        group_id=task.group_id,
        device_id=task.device_id,
        device_identifier=getattr(task.device, "device_id", None),
        created_by=task.created_by,
        start_time=task.start_time,
        end_time=task.end_time,
        paused_seconds=task.paused_seconds,
        paused_at=task.paused_at,
        point_rate=point_rate,
        target_points=target_points,
        current_points=current_points,
        duration_hours=duration_hours,
        initial_multiplier=initial_multiplier,
        current_multiplier=current_multiplier,
        updated_at=task.updated_at,
    )


@router.get(
    "/tasks",
    response_model=TaskListResponse,
    summary="任务列表",
    dependencies=[Depends(get_current_user)],
)
async def list_tasks(
    group_id: int | None = None,
    task_type: TaskTypeEnum | None = None,
    status: TaskStatusEnum | None = None,
    device_identifier: str | None = None,
    sort_by: str | None = "status",
    page: int = 1,
    page_size: int = 30,
    current=Depends(get_current_user),
    db=Depends(get_db),
):
    user: User = current["user"]
    tasks, total = task_service.list_tasks_paginated(
        db,
        requester=user,
        group_id=group_id,
        task_type=task_type,
        status=status,
        device_identifier=device_identifier,
        sort_by=sort_by,
        page=page,
        page_size=page_size,
    )
    return TaskListResponse(
        items=[_as_task_read(t) for t in tasks],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/tasks/defaults",
    response_model=TaskDefaults,
    summary="获取任务默认配置",
    dependencies=[Depends(get_current_user)],
)
async def get_task_defaults(current=Depends(get_current_user)):
    _ = current
    settings = config.get_settings()
    return TaskDefaults(default_score_rate=settings.default_score_rate, default_multiplier=settings.default_multiplier)


@router.post(
    "/tasks",
    response_model=TaskRead,
    status_code=status.HTTP_201_CREATED,
    summary="创建任务",
    dependencies=[Depends(get_current_user)],
)
async def create_task(payload: TaskCreate, current=Depends(get_current_user), db=Depends(get_db)):
    user: User = current["user"]
    task = task_service.create_task(
        db,
        requester=user,
        name=payload.name,
        task_type=payload.task_type,
        group_id=payload.group_id,
        device_id=payload.device_id,
        start_time=payload.start_time,
        score_detail={
            "point_rate": payload.score_point_rate,
            "target_points": payload.score_target,
            "current_points": payload.score_current,
        }
        if payload.task_type == TaskTypeEnum.SCORE
        else None,
        multiplier_detail={
            "duration_hours": payload.multiplier_hours,
            "initial_multiplier": payload.multiplier_initial,
            "current_multiplier": payload.multiplier_current,
        }
        if payload.task_type == TaskTypeEnum.MULTIPLIER
        else None,
        chest_detail={"duration_hours": payload.chest_hours} if payload.task_type == TaskTypeEnum.CHEST else None,
    )
    return _as_task_read(task)


@router.patch(
    "/tasks/{task_id}/status",
    response_model=TaskRead,
    summary="变更任务状态",
    dependencies=[Depends(get_current_user)],
)
async def change_task_status(task_id: int, payload: TaskStatusChange, current=Depends(get_current_user), db=Depends(get_db)):
    user: User = current["user"]
    task = task_service.update_status(db, requester=user, task_id=task_id, action=payload.action)
    return _as_task_read(task)


@router.patch(
    "/tasks/{task_id}/patch",
    response_model=TaskRead,
    summary="补暂停/补时或积分",
    dependencies=[Depends(get_current_user)],
)
async def patch_task(task_id: int, payload: TaskAdjustPayload, current=Depends(get_current_user), db=Depends(get_db)):
    user: User = current["user"]
    task = task_service.patch_task(
        db,
        requester=user,
        task_id=task_id,
        add_points=payload.add_points,
        add_hours=payload.add_hours,
    )
    return _as_task_read(task)


@router.patch(
    "/tasks/{task_id}/detail",
    response_model=TaskRead,
    summary="修改任务明细（加目标积分/时长/倍率）",
    dependencies=[Depends(get_current_user)],
)
async def update_task_detail(
    task_id: int,
    payload: TaskDetailUpdatePayload,
    current=Depends(get_current_user),
    db=Depends(get_db),
):
    user: User = current["user"]
    task = task_service.update_detail(
        db,
        requester=user,
        task_id=task_id,
        score_target=payload.score_target,
        score_rate=payload.score_rate,
        multiplier_hours=payload.multiplier_hours,
        multiplier_initial=payload.multiplier_initial,
        multiplier_increment=payload.multiplier_increment,
        chest_hours=payload.chest_hours,
    )
    return _as_task_read(task)


@router.patch(
    "/tasks/{task_id}/group",
    response_model=TaskRead,
    summary="移动任务到其它分组",
    dependencies=[Depends(get_current_user)],
)
async def move_task_group(task_id: int, payload: MoveTaskPayload, current=Depends(get_current_user), db=Depends(get_db)):
    user: User = current["user"]
    task = task_service.move_group(db, requester=user, task_id=task_id, target_group_id=payload.target_group_id)
    return _as_task_read(task)


@router.patch(
    "/tasks/{task_id}/device",
    response_model=TaskRead,
    summary="绑定或解绑任务设备",
    dependencies=[Depends(get_current_user)],
)
async def bind_task_device(task_id: int, payload: BindDevicePayload, current=Depends(get_current_user), db=Depends(get_db)):
    user: User = current["user"]
    task = task_service.change_device(db, requester=user, task_id=task_id, device_id=payload.device_id)
    return _as_task_read(task)
