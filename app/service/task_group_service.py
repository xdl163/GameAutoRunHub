"""任务分组领域服务。"""
from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.models import RoleEnum, TaskGroup, User, Task
from app.repository import (
    group_authorization_repository,
    task_group_repository,
    task_repository,
    user_repository,
)

DEFAULT_GROUP_NAME = "未分组"
COMPLETED_GROUP_NAME = "已完成"


def ensure_user_default_groups(db: Session, *, owner: User | int) -> tuple[TaskGroup, TaskGroup]:
    owner_id = owner.id if isinstance(owner, User) else int(owner)
    defaults = task_group_repository.list_defaults_for_owner(db, owner_id=owner_id)
    default_group = next((g for g in defaults if g.name == DEFAULT_GROUP_NAME), None)
    completed_group = next((g for g in defaults if g.name == COMPLETED_GROUP_NAME), None)

    if not default_group:
        default_group = task_group_repository.create_group(
            db,
            name=DEFAULT_GROUP_NAME,
            description="系统默认分组，删除分组后的任务会回收至此",
            is_default=True,
            created_by=owner_id,
        )
    if not completed_group:
        completed_group = task_group_repository.create_group(
            db,
            name=COMPLETED_GROUP_NAME,
            description="终止/完成任务归档区",
            is_default=True,
            created_by=owner_id,
        )
    return default_group, completed_group


def _attach_owner_meta(db: Session, groups: list[TaskGroup]) -> list[TaskGroup]:
    if not groups:
        return groups
    owner_ids = {g.created_by for g in groups if g.created_by}
    owners = (
        {user.id: user for user in db.scalars(select(User).where(User.id.in_(owner_ids))).all()}
        if owner_ids
        else {}
    )
    for g in groups:
        owner = owners.get(g.created_by)
        if owner:
            g.owner_username = owner.username
            g.owner_display_name = owner.display_name
    return groups


def _attach_task_counts(db: Session, groups: list[TaskGroup]) -> list[TaskGroup]:
    if not groups:
        return groups
    group_ids = [g.id for g in groups]
    counts = (
        db.execute(select(Task.group_id, func.count()).where(Task.group_id.in_(group_ids)).group_by(Task.group_id))
        .all()
    )
    count_map = {gid: cnt for gid, cnt in counts}
    for g in groups:
        g.task_count = int(count_map.get(g.id, 0))
    return groups


def list_groups(db: Session, *, requester: User) -> list[TaskGroup]:
    default_group, completed_group = ensure_user_default_groups(db, owner=requester)
    if requester.role in {RoleEnum.ADMIN, RoleEnum.SUPER_ADMIN}:
        groups = task_group_repository.list_all(db)
        return _attach_task_counts(db, _attach_owner_meta(db, groups))
    authorized_ids = group_authorization_repository.list_group_ids_for_user(db, user_id=requester.id)
    groups = task_group_repository.list_owned_or_authorized(
        db, owner_id=requester.id, authorized_group_ids=authorized_ids
    )
    # 确保默认分组一定可见
    ensured_ids = {g.id for g in groups}
    if default_group.id not in ensured_ids:
        groups.insert(0, default_group)
    if completed_group.id not in ensured_ids:
        groups.insert(1, completed_group)
    return _attach_task_counts(db, _attach_owner_meta(db, groups))


def create_group(
    db: Session,
    *,
    requester: User,
    name: str,
    description: str | None = None,
    owner_id: int | None = None,
) -> TaskGroup:
    ensure_user_default_groups(db, owner=requester)

    target_owner_id = requester.id
    if owner_id not in {None, requester.id}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能创建自己的分组")

    owner = user_repository.get_by_id(db, target_owner_id)
    if not owner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="指定的分组拥有者不存在")

    created = task_group_repository.create_group(
        db,
        name=name,
        description=description,
        is_default=False,
        created_by=owner.id,
    )
    _attach_owner_meta(db, [created])
    return created


def add_managers(
    db: Session,
    *,
    requester: User,
    group_id: int,
    manager_ids: list[int],
) -> list[int]:
    group = task_group_repository.get_by_id(db, group_id)
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="分组不存在")
    if group.created_by != requester.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权变更分组管理员")

    valid_ids: list[int] = []
    for user_id in manager_ids:
        user = user_repository.get_by_id(db, user_id)
        if user:
            valid_ids.append(user.id)

    replaced = group_authorization_repository.replace_authorizations(db, group_id=group_id, user_ids=valid_ids)
    return replaced


def delete_group(db: Session, *, requester: User, group_id: int) -> TaskGroup:
    group = task_group_repository.get_by_id(db, group_id)
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="分组不存在")
    if group.is_default:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="默认分组不可删除")
    if group.created_by != requester.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权删除分组")

    default_group, _ = ensure_user_default_groups(db, owner=group.created_by)
    task_group_repository.move_tasks_to_group(db, source_group_id=group.id, target_group_id=default_group.id)
    group_authorization_repository.delete_by_group(db, group_id=group.id)
    task_group_repository.delete(db, group)
    return group


def resolve_accessible_group_ids(db: Session, *, requester: User) -> list[int]:
    if requester.role in {RoleEnum.ADMIN, RoleEnum.SUPER_ADMIN}:
        return [g.id for g in task_group_repository.list_all(db)]
    ensure_user_default_groups(db, owner=requester)
    authorized_ids = group_authorization_repository.list_group_ids_for_user(db, user_id=requester.id)
    owned_groups = task_group_repository.list_owned_or_authorized(
        db, owner_id=requester.id, authorized_group_ids=authorized_ids
    )
    return [g.id for g in owned_groups]


__all__ = [
    "add_managers",
    "create_group",
    "ensure_user_default_groups",
    "delete_group",
    "list_groups",
    "resolve_accessible_group_ids",
    "DEFAULT_GROUP_NAME",
    "COMPLETED_GROUP_NAME",
]
