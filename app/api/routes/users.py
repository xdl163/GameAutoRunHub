"""用户相关接口。"""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.deps import get_current_user, get_db
from app.models.enums import RoleEnum
from app.models.user import User
from app.service import user_service

router = APIRouter()


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


class ResetPasswordResponse(BaseModel):
    new_password: str
    user: UserRead


class UserOption(BaseModel):
    id: int
    username: str
    display_name: str | None

    class Config:
        from_attributes = True


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


@router.get(
    "/users/options",
    response_model=List[UserOption],
    summary="用户选项（用于分组授权选择）",
    dependencies=[Depends(get_current_user)],
)
async def list_user_options(current=Depends(get_current_user), db=Depends(get_db)):
    user: User = current["user"]
    return user_service.list_user_options(db, requester=user)


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
