"""用户领域服务层。"""
from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core import security
from app.models.enums import RoleEnum
from app.models.user import User
from app.models.enums import DeviceStatusEnum
from app.repository import (
    device_operation_log_repository,
    device_repository,
    group_authorization_repository,
    task_group_repository,
    task_repository,
    user_repository,
)
from app.service import account_log_service
from app.service import task_group_service


class AuthResult(security.AuthenticatedUser):
    pass


def authenticate(db: Session, *, username: str, password: str) -> AuthResult:
    user = user_repository.get_by_username(db, username)
    if not user or not security.verify_password(password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账户已被禁用")

    token = security.generate_token(user.id)
    account_log_service.log_action(
        db,
        performer=user,
        target=user,
        action="login",
        detail="用户登录系统",
    )
    return AuthResult(token=token, user=user)


def _delete_user_resources(db: Session, target: User) -> None:
    # 删除任务及其详情，并释放设备
    tasks = task_repository.list_tasks(db, created_by=target.id, include_all=False)
    for task in tasks:
        if task.device_id:
            device = device_repository.get_by_id(db, task.device_id)
            if device:
                device.status = DeviceStatusEnum.IDLE
                db.add(device)
        if getattr(task, "score_detail", None):
            db.delete(task.score_detail)
        if getattr(task, "multiplier_detail", None):
            db.delete(task.multiplier_detail)
        if getattr(task, "chest_detail", None):
            db.delete(task.chest_detail)
        db.delete(task)
    db.commit()

    # 删除分组授权记录（作为管理者或授权成员）
    group_authorization_repository.delete_by_user(db, user_id=target.id)

    # 删除该用户创建的分组，并将残留任务移动到各自创建人的默认分组
    groups = task_group_repository.list_by_owner(db, owner_id=target.id)
    for group in groups:
        remaining_tasks = task_repository.list_tasks(db, group_ids=[group.id], include_all=False)
        for remain in remaining_tasks:
            default_group, _ = task_group_service.ensure_user_default_groups(db, owner=remain.created_by)
            remain.group_id = default_group.id
            db.add(remain)
        group_authorization_repository.delete_by_group(db, group_id=group.id)
        db.delete(group)
    db.commit()

    # 删除该用户创建的设备
    devices, _ = device_repository.list_devices(db, created_by=target.id)
    for device in devices:
        for task in list(device.tasks or []):
            task.device_id = None
            db.add(task)
        db.delete(device)
    db.commit()


def logout(db: Session, *, user: User, token: str) -> None:
    account_log_service.log_action(db, performer=user, target=user, action="logout", detail="退出登录")
    security.invalidate_token(token)


def list_users(db: Session, *, requester: User):
    if requester.role not in {RoleEnum.ADMIN, RoleEnum.SUPER_ADMIN}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限查看用户")
    return user_repository.list_users(db)


def list_user_options(db: Session, *, requester: User):
    if not requester:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="未认证")
    return user_repository.list_active_users(db)


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

    created = user_repository.create_user(
        db,
        username=username,
        display_name=display_name,
        password_hash=security.hash_password(password),
        role=role,
        is_active=is_active,
    )
    task_group_service.ensure_user_default_groups(db, owner=created)
    account_log_service.log_action(
        db,
        performer=requester,
        target=created,
        action="create_user",
        detail=f"创建用户 {created.username}",
    )
    return created


def change_role(db: Session, *, requester: User, target_id: int, role: RoleEnum):
    if requester.role is not RoleEnum.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅超级管理员可修改角色")

    target = user_repository.get_by_id(db, target_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    target.role = role
    saved = user_repository.save(db, target)
    account_log_service.log_action(
        db,
        performer=requester,
        target=saved,
        action="change_role",
        detail=f"将角色调整为 {role.value}",
    )
    return saved


def change_status(db: Session, *, requester: User, target_id: int, is_active: bool):
    target = user_repository.get_by_id(db, target_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    if requester.role is not RoleEnum.SUPER_ADMIN and target.role is not RoleEnum.USER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能调整普通用户状态")

    target.is_active = is_active
    saved = user_repository.save(db, target)
    account_log_service.log_action(
        db,
        performer=requester,
        target=saved,
        action="change_status",
        detail="启用" if is_active else "禁用",
    )
    return saved


def delete_user(db: Session, *, requester: User, target_id: int):
    target = user_repository.get_by_id(db, target_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    if requester.role is not RoleEnum.SUPER_ADMIN and target.role is not RoleEnum.USER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能删除普通用户")

    account_log_service.log_action(
        db,
        performer=requester,
        target=target,
        action="delete_user",
        detail=f"删除用户 {target.username}",
    )
    _delete_user_resources(db, target)
    # Older schemas may still have a user FK on device_operation_logs; drop it so
    # historical logs do not block user deletions.
    device_operation_log_repository.drop_user_fk_constraints(db)
    user_repository.delete(db, target)


def update_password(
    db: Session, *, requester: User, new_password: str, old_password: str | None = None
):
    if old_password and not security.verify_password(old_password, requester.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="旧密码不正确")

    requester.password_hash = security.hash_password(new_password)
    saved = user_repository.save(db, requester)
    account_log_service.log_action(
        db,
        performer=requester,
        target=saved,
        action="update_password",
        detail="修改个人密码",
    )
    return saved


def reset_password(db: Session, *, requester: User, target_id: int):
    target = user_repository.get_by_id(db, target_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    if requester.role is not RoleEnum.SUPER_ADMIN and target.role is not RoleEnum.USER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能重置普通用户密码")

    new_password = security.generate_random_password()
    target.password_hash = security.hash_password(new_password)
    saved = user_repository.save(db, target)
    account_log_service.log_action(
        db,
        performer=requester,
        target=saved,
        action="reset_password",
        detail="重置账户密码",
    )
    return new_password, saved


__all__ = [
    "authenticate",
    "logout",
    "list_users",
    "create_user",
    "change_role",
    "change_status",
    "delete_user",
    "update_password",
    "reset_password",
    "list_user_options",
]
