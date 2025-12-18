"""API 路由层（控制器），用于组织业务接口。"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel

from sqlalchemy import select

from app.api.deps import get_current_user, get_db
from app.models.enums import DevicePlatformEnum, DeviceStatusEnum, RoleEnum, TaskStatusEnum, TaskTypeEnum
from app.models.user import User
from app.service import (
    account_log_service,
    config_service,
    device_operation_log_service,
    device_service,
    task_group_service,
    task_log_service,
    task_service,
    user_service,
)

router = APIRouter(prefix="/api")


class UserCreate(BaseModel):
    username: str
    display_name: str
    password: str
    role: RoleEnum
    is_active: bool = True


class UserRead(BaseModel):
    id: int
    username: str
    display_name: str
    role: RoleEnum
    is_active: bool

    class Config:
        from_attributes = True


class PasswordUpdate(BaseModel):
    new_password: str
    old_password: str | None = None


class RoleUpdate(BaseModel):
    role: RoleEnum


class StatusUpdate(BaseModel):
    is_active: bool


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    user: UserRead


class GlobalParams(BaseModel):
    default_score_rate: int
    default_multiplier: float


class ResetPasswordResponse(BaseModel):
    new_password: str
    user: UserRead


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


class TaskCreate(BaseModel):
    name: str
    task_type: TaskTypeEnum
    group_id: int
    device_id: int | None = None
    start_time: datetime | None = None
    score_point_rate: int | None = None
    score_target: int | None = None
    multiplier_hours: int | None = None
    multiplier_current: float | None = None
    chest_hours: int | None = None


class TaskRead(BaseModel):
    id: int
    name: str
    task_type: TaskTypeEnum
    status: TaskStatusEnum
    group_id: int
    device_id: int | None
    created_by: int
    start_time: datetime | None
    end_time: datetime | None
    point_rate: Optional[int] = None
    target_points: Optional[int] = None
    current_points: Optional[int] = None
    duration_hours: Optional[int] = None
    current_multiplier: Optional[float] = None
    updated_at: datetime

    class Config:
        from_attributes = True


class TaskStatusChange(BaseModel):
    action: str


class TaskAdjustPayload(BaseModel):
    add_points: int | None = None
    add_hours: int | None = None


class TaskDetailUpdatePayload(BaseModel):
    score_target: int | None = None
    score_rate: int | None = None
    multiplier_hours: int | None = None
    multiplier_increment: float | None = None
    chest_hours: int | None = None


class MoveTaskPayload(BaseModel):
    target_group_id: int


class BindDevicePayload(BaseModel):
    device_id: int | None


class DeviceCreate(BaseModel):
    device_id: str
    platform: DevicePlatformEnum
    config: str | None = None
    remark: str | None = None


class DeviceUpdate(BaseModel):
    platform: DevicePlatformEnum | None = None
    status: DeviceStatusEnum | None = None
    config: str | None = None
    remark: str | None = None


class DeviceRead(BaseModel):
    id: int
    device_id: str
    platform: DevicePlatformEnum
    status: DeviceStatusEnum
    config: str | None
    remark: str | None
    created_by: int
    created_by_username: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


def _build_user_map(db, devices: List):
    user_ids = {getattr(d, "created_by", None) for d in devices if getattr(d, "created_by", None)}
    if not user_ids:
        return {}
    fetched = db.scalars(select(User).where(User.id.in_(user_ids))).all()
    return {u.id: u.username for u in fetched}


def _as_device_read(device, user_map: Dict[int, str] | None = None) -> DeviceRead:
    user_map = user_map or {}
    return DeviceRead(
        id=device.id,
        device_id=device.device_id,
        platform=device.platform,
        status=device.status,
        config=device.config,
        remark=device.remark,
        created_by=device.created_by,
        created_by_username=user_map.get(device.created_by),
        created_at=device.created_at,
        updated_at=device.updated_at,
    )


def _as_task_read(task) -> TaskRead:
    point_rate = getattr(task.score_detail, "point_rate", None)
    target_points = getattr(task.score_detail, "target_points", None)
    current_points = getattr(task.score_detail, "current_points", None)

    duration_hours = None
    current_multiplier = None
    if getattr(task, "multiplier_detail", None):
        duration_hours = task.multiplier_detail.duration_hours
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
        created_by=task.created_by,
        start_time=task.start_time,
        end_time=task.end_time,
        point_rate=point_rate,
        target_points=target_points,
        current_points=current_points,
        duration_hours=duration_hours,
        current_multiplier=current_multiplier,
        updated_at=task.updated_at,
    )


@router.post("/login", response_model=LoginResponse, summary="登录获取令牌")
async def login(payload: LoginRequest, response: Response, db=Depends(get_db)):
    result = user_service.authenticate(db, username=payload.username, password=payload.password)
    response.set_cookie(
        "access_token",
        result.token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=60 * 60 * 12,
    )
    return LoginResponse(token=result.token, user=result.user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, summary="注销并回收令牌")
async def logout(response: Response, current=Depends(get_current_user), db=Depends(get_db)):
    user_service.logout(db, user=current["user"], token=current["token"])
    response.delete_cookie("access_token")
    return None


@router.get("/health", summary="健康检查", dependencies=[Depends(get_current_user)])
async def health_check():
    return {"status": "ok"}


@router.get(
    "/layout/menus",
    summary="根据角色返回可见菜单",
    dependencies=[Depends(get_current_user)],
)
async def get_menus(current=Depends(get_current_user)) -> Dict[str, List[Dict]]:
    user: User = current["user"]

    def base_sidebar() -> List[Dict]:
        return [
            {"key": "tasks", "label": "任务管理"},
            {"key": "devices", "label": "设备池"},
            {"key": "account", "label": "账户设置"},
        ]

    sidebar = base_sidebar()

    if user.role in {RoleEnum.ADMIN, RoleEnum.SUPER_ADMIN}:
        sidebar.insert(2, {"key": "users", "label": "用户管理"})
        sidebar.insert(
            3,
            {
                "key": "logs",
                "label": "日志中心",
                "children": [
                    {"key": "task_logs", "label": "任务操作日志"},
                    {"key": "device_logs", "label": "设备池操作日志"},
                    {"key": "account_logs", "label": "账户操作日志"},
                ],
            },
        )

        system_children = [{"key": "global_config", "label": "全局参数配置"}]
        if user.role is RoleEnum.SUPER_ADMIN:
            system_children.insert(0, {"key": "platform_config", "label": "平台级配置"})

        sidebar.append({"key": "system", "label": "系统配置", "children": system_children})

    topbar = {
        "current_user": {"username": user.username, "role": user.role},
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "actions": ["修改密码", "退出登录"],
    }

    return {"topbar": topbar, "sidebar": sidebar}


@router.get(
    "/system/global",
    response_model=GlobalParams,
    summary="获取全局参数（管理员及以上）",
    dependencies=[Depends(get_current_user)],
)
async def get_global_params(current=Depends(get_current_user)):
    user: User = current["user"]
    params = config_service.get_global_params(requester=user)
    return GlobalParams(**params)


@router.put(
    "/system/global",
    response_model=GlobalParams,
    summary="更新全局参数（管理员及以上）",
    dependencies=[Depends(get_current_user)],
)
async def update_global_params(payload: GlobalParams, current=Depends(get_current_user)):
    user: User = current["user"]
    params = config_service.update_global_params(
        requester=user,
        default_score_rate=payload.default_score_rate,
        default_multiplier=payload.default_multiplier,
    )
    return GlobalParams(**params)


@router.post(
    "/users",
    response_model=UserRead,
    summary="创建用户（管理员及以上）",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(get_current_user)],
)
async def create_user(payload: UserCreate, current=Depends(get_current_user), db=Depends(get_db)):
    user: User = current["user"]
    created = user_service.create_user(
        db,
        requester=user,
        username=payload.username,
        display_name=payload.display_name,
        password=payload.password,
        role=payload.role,
        is_active=payload.is_active,
    )
    return created


@router.get(
    "/users",
    response_model=List[UserRead],
    summary="用户列表（管理员及以上）",
    dependencies=[Depends(get_current_user)],
)
async def list_users(current=Depends(get_current_user), db=Depends(get_db)):
    user: User = current["user"]
    return user_service.list_users(db, requester=user)


@router.patch(
    "/users/password",
    summary="修改个人密码",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(get_current_user)],
)
async def update_password(payload: PasswordUpdate, current=Depends(get_current_user), db=Depends(get_db)):
    user: User = current["user"]
    user_service.update_password(
        db,
        requester=user,
        new_password=payload.new_password,
        old_password=payload.old_password,
    )
    return None


@router.patch(
    "/users/{user_id}/role",
    response_model=UserRead,
    summary="更新角色（仅超级管理员）",
    dependencies=[Depends(get_current_user)],
)
async def update_role(user_id: int, payload: RoleUpdate, current=Depends(get_current_user), db=Depends(get_db)):
    user: User = current["user"]
    return user_service.change_role(db, requester=user, target_id=user_id, role=payload.role)


@router.patch(
    "/users/{user_id}/status",
    response_model=UserRead,
    summary="切换用户状态",
    dependencies=[Depends(get_current_user)],
)
async def update_status(
    user_id: int,
    payload: StatusUpdate,
    current=Depends(get_current_user),
    db=Depends(get_db),
):
    user: User = current["user"]
    return user_service.change_status(db, requester=user, target_id=user_id, is_active=payload.is_active)


@router.post(
    "/users/{user_id}/reset-password",
    response_model=ResetPasswordResponse,
    summary="重置用户密码",
    dependencies=[Depends(get_current_user)],
)
async def reset_password(user_id: int, current=Depends(get_current_user), db=Depends(get_db)):
    user: User = current["user"]
    new_password, updated = user_service.reset_password(db, requester=user, target_id=user_id)
    return ResetPasswordResponse(new_password=new_password, user=updated)


@router.delete(
    "/users/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="删除用户",
    dependencies=[Depends(get_current_user)],
)
async def remove_user(user_id: int, current=Depends(get_current_user), db=Depends(get_db)):
    user: User = current["user"]
    if user.id == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能删除自己")
    user_service.delete_user(db, requester=user, target_id=user_id)
    return None


@router.get(
    "/devices",
    response_model=List[DeviceRead],
    summary="查询设备列表",
    dependencies=[Depends(get_current_user)],
)
async def list_devices(
    device_id: str | None = None,
    task_id: int | None = None,
    status: DeviceStatusEnum | None = None,
    idle_only: bool = False,
    username: str | None = None,
    current=Depends(get_current_user),
    db=Depends(get_db),
):
    user: User = current["user"]
    devices = device_service.list_devices(
        db,
        requester=user,
        device_id=device_id,
        task_id=task_id,
        status=status,
        idle_only=idle_only,
        creator_username=username,
    )
    user_map = _build_user_map(db, devices)
    return [_as_device_read(device, user_map) for device in devices]


@router.get(
    "/devices/idle",
    response_model=List[DeviceRead],
    summary="查看空闲设备",
    dependencies=[Depends(get_current_user)],
)
async def list_idle_devices(current=Depends(get_current_user), db=Depends(get_db)):
    user: User = current["user"]
    devices = device_service.list_devices(db, requester=user, idle_only=True)
    user_map = _build_user_map(db, devices)
    return [_as_device_read(device, user_map) for device in devices]


@router.post(
    "/devices",
    response_model=DeviceRead,
    status_code=status.HTTP_201_CREATED,
    summary="新建设备",
    dependencies=[Depends(get_current_user)],
)
async def create_device(payload: DeviceCreate, current=Depends(get_current_user), db=Depends(get_db)):
    user: User = current["user"]
    device = device_service.create_device(
        db,
        requester=user,
        device_id=payload.device_id,
        platform=payload.platform,
        config=payload.config,
        remark=payload.remark,
    )
    return _as_device_read(device, {user.id: user.username})


@router.put(
    "/devices/{device_id}",
    response_model=DeviceRead,
    summary="修改设备",
    dependencies=[Depends(get_current_user)],
)
async def update_device(
    device_id: int, payload: DeviceUpdate, current=Depends(get_current_user), db=Depends(get_db)
):
    user: User = current["user"]
    device = device_service.update_device(
        db, requester=user, device_pk=device_id, **payload.dict(exclude_unset=True)
    )
    creator_map = _build_user_map(db, [device])
    return _as_device_read(device, creator_map)


@router.delete(
    "/devices/{device_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="删除设备",
    dependencies=[Depends(get_current_user)],
)
async def delete_device(device_id: int, current=Depends(get_current_user), db=Depends(get_db)):
    user: User = current["user"]
    device_service.delete_device(db, requester=user, device_pk=device_id)
    return None


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


@router.get(
    "/tasks",
    response_model=List[TaskRead],
    summary="任务列表",
    dependencies=[Depends(get_current_user)],
)
async def list_tasks(
    group_id: int | None = None,
    task_type: TaskTypeEnum | None = None,
    status: TaskStatusEnum | None = None,
    current=Depends(get_current_user),
    db=Depends(get_db),
):
    user: User = current["user"]
    tasks = task_service.list_tasks(
        db,
        requester=user,
        group_id=group_id,
        task_type=task_type,
        status=status,
    )
    return [_as_task_read(t) for t in tasks]


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
        score_detail={"point_rate": payload.score_point_rate, "target_points": payload.score_target}
        if payload.task_type == TaskTypeEnum.SCORE
        else None,
        multiplier_detail={
            "duration_hours": payload.multiplier_hours,
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
