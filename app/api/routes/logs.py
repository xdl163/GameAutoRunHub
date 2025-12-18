"""日志相关接口。"""

from __future__ import annotations

from typing import Dict, List

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import get_current_user, get_db
from app.models.enums import RoleEnum
from app.models.user import User
from app.service import account_log_service, device_operation_log_service, task_log_service, task_service

router = APIRouter()


class AccountLogRead(BaseModel):
    id: int
    action: str
    detail: str | None
    created_at: str
    target_username: str
    performer_username: str


class SimpleLogRead(BaseModel):
    id: int
    action: str
    detail: str | None
    created_at: str
    performer_username: str


@router.get(
    "/logs/account",
    response_model=List[AccountLogRead],
    summary="账户操作日志（管理员及以上）",
    dependencies=[Depends(get_current_user)],
)
async def list_account_logs(current=Depends(get_current_user), db=Depends(get_db)):
    user: User = current["user"]
    logs = account_log_service.list_logs(db, requester=user)

    user_ids = set()
    for log in logs:
        if log.performed_by:
            user_ids.add(log.performed_by)
        if log.target_user_id:
            user_ids.add(log.target_user_id)

    user_map: Dict[int, str] = {}
    if user_ids:
        fetched_users = db.scalars(select(User).where(User.id.in_(user_ids))).all()
        user_map = {u.id: u.username for u in fetched_users}

    results = []
    for log in logs:
        results.append(
            AccountLogRead(
                id=log.id,
                action=log.action,
                detail=log.detail,
                created_at=log.created_at.isoformat(),
                target_username=user_map.get(log.target_user_id, ""),
                performer_username=user_map.get(log.performed_by, ""),
            )
        )
    return results


@router.get(
    "/logs/task",
    response_model=List[SimpleLogRead],
    summary="任务操作日志",
    dependencies=[Depends(get_current_user)],
)
async def list_task_logs(current=Depends(get_current_user), db=Depends(get_db)):
    user: User = current["user"]
    accessible_tasks = task_service.list_tasks(db, requester=user)
    task_ids = [t.id for t in accessible_tasks]

    logs = task_log_service.list_logs(
        db,
        requester=user,
        task_ids=None if user.role in {RoleEnum.ADMIN, RoleEnum.SUPER_ADMIN} else task_ids,
    )

    user_ids = {log.user_id for log in logs}
    user_map: Dict[int, str] = {}
    if user_ids:
        fetched_users = db.scalars(select(User).where(User.id.in_(user_ids))).all()
        user_map = {u.id: u.username for u in fetched_users}

    return [
        SimpleLogRead(
            id=log.id,
            action=log.action,
            detail=log.detail,
            created_at=log.created_at.isoformat(),
            performer_username=user_map.get(log.user_id, ""),
        )
        for log in logs
    ]


@router.get(
    "/logs/device",
    response_model=List[SimpleLogRead],
    summary="设备池操作日志（管理员及以上）",
    dependencies=[Depends(get_current_user)],
)
async def list_device_logs(current=Depends(get_current_user), db=Depends(get_db)):
    user: User = current["user"]
    logs = device_operation_log_service.list_logs(db=db, requester=user)

    results: List[SimpleLogRead] = []
    user_map = {}
    user_ids = {log.user_id for log in logs}
    if user_ids:
        fetched_users = db.scalars(select(User).where(User.id.in_(user_ids))).all()
        user_map = {u.id: u.username for u in fetched_users}

    for log in logs:
        results.append(
            SimpleLogRead(
                id=log.id,
                action=log.action,
                detail=log.detail,
                created_at=log.created_at.isoformat(),
                performer_username=user_map.get(log.user_id, ""),
            )
        )
    return results
