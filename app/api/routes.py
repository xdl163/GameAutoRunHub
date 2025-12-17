"""API 路由层（控制器），用于组织业务接口。"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.deps import get_current_user, get_db
from app.models.enums import RoleEnum
from app.models.user import User
from app.service import config_service, user_service

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


@router.post("/login", response_model=LoginResponse, summary="登录获取令牌")
async def login(payload: LoginRequest, db=Depends(get_db)):
    result = user_service.authenticate(db, username=payload.username, password=payload.password)
    return LoginResponse(token=result.token, user=result.user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, summary="注销并回收令牌")
async def logout(current=Depends(get_current_user)):
    user_service.logout(current["token"])
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
