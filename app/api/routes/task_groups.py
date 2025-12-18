"""任务分组相关接口。"""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.service import task_group_service

router = APIRouter()


class TaskGroupCreate(BaseModel):
    name: str
    description: str | None = None
    owner_id: int | None = None


class TaskGroupRead(BaseModel):
    id: int
    name: str
    description: str | None
    is_default: bool
    created_by: int

    class Config:
        from_attributes = True


class GroupManagerPayload(BaseModel):
    manager_ids: List[int]


@router.get(
    "/task-groups",
    response_model=List[TaskGroupRead],
    summary="任务分组列表",
    dependencies=[Depends(get_current_user)],
)
async def list_task_groups(current=Depends(get_current_user), db=Depends(get_db)):
    user: User = current["user"]
    groups = task_group_service.list_groups(db, requester=user)
    return groups


@router.post(
    "/task-groups",
    response_model=TaskGroupRead,
    summary="创建任务分组",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(get_current_user)],
)
async def create_task_group(payload: TaskGroupCreate, current=Depends(get_current_user), db=Depends(get_db)):
    user: User = current["user"]
    created = task_group_service.create_group(
        db,
        requester=user,
        name=payload.name,
        description=payload.description,
        owner_id=payload.owner_id,
    )
    return created


@router.post(
    "/task-groups/{group_id}/managers",
    response_model=List[int],
    summary="为分组授权管理员（不可创建任务，仅管理）",
    dependencies=[Depends(get_current_user)],
)
async def add_group_managers(
    group_id: int,
    payload: GroupManagerPayload,
    current=Depends(get_current_user),
    db=Depends(get_db),
):
    user: User = current["user"]
    return task_group_service.add_managers(db, requester=user, group_id=group_id, manager_ids=payload.manager_ids)


@router.delete(
    "/task-groups/{group_id}",
    response_model=TaskGroupRead,
    summary="删除任务分组（组内任务回收到默认分组）",
    dependencies=[Depends(get_current_user)],
)
async def delete_task_group(group_id: int, current=Depends(get_current_user), db=Depends(get_db)):
    user: User = current["user"]
    return task_group_service.delete_group(db, requester=user, group_id=group_id)
