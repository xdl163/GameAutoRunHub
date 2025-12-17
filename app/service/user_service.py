"""用户领域服务层。"""
from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core import security
from app.models.enums import RoleEnum
from app.models.user import User
from app.repository import user_repository


class AuthResult(security.AuthenticatedUser):
    pass


def authenticate(db: Session, *, username: str, password: str) -> AuthResult:
    user = user_repository.get_by_username(db, username)
    if not user or not security.verify_password(password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账户已被禁用")

    token = security.generate_token(user.id)
    return AuthResult(token=token, user=user)


def logout(token: str) -> None:
    security.invalidate_token(token)


def list_users(db: Session, *, requester: User):
    if requester.role not in {RoleEnum.ADMIN, RoleEnum.SUPER_ADMIN}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限查看用户")
    return user_repository.list_users(db)


def create_user(
    db: Session,
    *,
    requester: User,
    username: str,
    display_name: str,
    password: str,
    role: RoleEnum,
    is_active: bool = True,
):
    if requester.role not in {RoleEnum.ADMIN, RoleEnum.SUPER_ADMIN}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限创建用户")
    if role is RoleEnum.SUPER_ADMIN and requester.role is not RoleEnum.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅超级管理员可创建超级管理员")

    existing = user_repository.get_by_username(db, username)
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="用户名已存在")

    return user_repository.create_user(
        db,
        username=username,
        display_name=display_name,
        password_hash=security.hash_password(password),
        role=role,
        is_active=is_active,
    )


def change_role(db: Session, *, requester: User, target_id: int, role: RoleEnum):
    if requester.role is not RoleEnum.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅超级管理员可修改角色")

    target = user_repository.get_by_id(db, target_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    target.role = role
    return user_repository.save(db, target)


def change_status(db: Session, *, requester: User, target_id: int, is_active: bool):
    target = user_repository.get_by_id(db, target_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    if requester.role is not RoleEnum.SUPER_ADMIN and target.role is not RoleEnum.USER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能调整普通用户状态")

    target.is_active = is_active
    return user_repository.save(db, target)


def delete_user(db: Session, *, requester: User, target_id: int):
    target = user_repository.get_by_id(db, target_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    if requester.role is not RoleEnum.SUPER_ADMIN and target.role is not RoleEnum.USER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能删除普通用户")

    user_repository.delete(db, target)


def update_password(
    db: Session, *, requester: User, new_password: str, old_password: str | None = None
):
    if old_password and not security.verify_password(old_password, requester.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="旧密码不正确")

    requester.password_hash = security.hash_password(new_password)
    user_repository.save(db, requester)


__all__ = [
    "authenticate",
    "logout",
    "list_users",
    "create_user",
    "change_role",
    "change_status",
    "delete_user",
    "update_password",
]
