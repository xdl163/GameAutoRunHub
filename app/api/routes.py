"""API 路由层（控制器），用于组织业务接口。"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.enums import RoleEnum
from app.models.user import User

router = APIRouter(prefix="/api")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


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
    username: str
    new_password: str


@router.get("/health", summary="健康检查")
async def health_check():
    """健康检查示例接口。"""
    return {"status": "ok"}


@router.get("/layout/menus", summary="根据角色返回可见菜单")
async def get_menus(role: RoleEnum = Query(..., description="当前登录角色")) -> Dict[str, List[Dict]]:
    def base_sidebar() -> List[Dict]:
        return [
            {"key": "tasks", "label": "任务管理"},
            {"key": "devices", "label": "设备池"},
            {"key": "account", "label": "账户设置"},
        ]

    sidebar = base_sidebar()

    if role in {RoleEnum.ADMIN, RoleEnum.SUPER_ADMIN}:
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
        if role is RoleEnum.SUPER_ADMIN:
            system_children.insert(0, {"key": "platform_config", "label": "平台级配置"})

        sidebar.append({"key": "system", "label": "系统配置", "children": system_children})

    topbar = {
        "current_user": {"username": "当前用户", "role": role},
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "actions": ["修改密码", "退出登录"],
    }

    return {"topbar": topbar, "sidebar": sidebar}


@router.post(
    "/users",
    response_model=UserRead,
    summary="创建用户（管理员及以上）",
    status_code=status.HTTP_201_CREATED,
)
async def create_user(
    payload: UserCreate,
    requester_role: RoleEnum = Query(..., description="当前操作人角色"),
    db: Session = Depends(get_db),
):
    if requester_role not in {RoleEnum.ADMIN, RoleEnum.SUPER_ADMIN}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限创建用户")

    if payload.role is RoleEnum.SUPER_ADMIN and requester_role is not RoleEnum.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅超级管理员可创建超级管理员")

    existing = db.scalars(select(User).where(User.username == payload.username)).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="用户名已存在")

    user = User(
        username=payload.username,
        display_name=payload.display_name,
        password_hash=hash_password(payload.password),
        role=payload.role,
        is_active=payload.is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/users", response_model=List[UserRead], summary="用户列表（管理员及以上）")
async def list_users(
    requester_role: RoleEnum = Query(..., description="当前操作人角色"),
    db: Session = Depends(get_db),
):
    if requester_role not in {RoleEnum.ADMIN, RoleEnum.SUPER_ADMIN}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限查看用户")

    users = db.scalars(select(User)).all()
    return users


@router.patch("/users/password", summary="修改账户密码", status_code=status.HTTP_204_NO_CONTENT)
async def update_password(payload: PasswordUpdate, db: Session = Depends(get_db)):
    user = db.scalars(select(User).where(User.username == payload.username)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    user.password_hash = hash_password(payload.new_password)
    db.add(user)
    db.commit()
    return None
