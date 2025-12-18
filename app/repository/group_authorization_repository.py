"""分组授权数据访问层。"""
from __future__ import annotations

from typing import List, Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import GroupAuthorization


def list_group_ids_for_user(db: Session, *, user_id: int) -> List[int]:
    return [
        row[0]
        for row in db.execute(
            select(GroupAuthorization.group_id).where(GroupAuthorization.user_id == user_id)
        ).all()
    ]


def list_authorized_users(db: Session, *, group_id: int) -> List[GroupAuthorization]:
    return db.scalars(select(GroupAuthorization).where(GroupAuthorization.group_id == group_id)).all()


def add_authorization(db: Session, *, group_id: int, user_id: int) -> GroupAuthorization:
    auth = GroupAuthorization(group_id=group_id, user_id=user_id)
    db.add(auth)
    db.commit()
    db.refresh(auth)
    return auth


def remove_authorizations(db: Session, *, group_id: int, user_ids: Sequence[int]) -> None:
    if not user_ids:
        return
    auths = db.scalars(
        select(GroupAuthorization).where(
            GroupAuthorization.group_id == group_id,
            GroupAuthorization.user_id.in_(user_ids),
        )
    ).all()
    for auth in auths:
        db.delete(auth)
    db.commit()


def delete_by_group(db: Session, *, group_id: int) -> None:
    auths = db.scalars(select(GroupAuthorization).where(GroupAuthorization.group_id == group_id)).all()
    for auth in auths:
        db.delete(auth)
    db.commit()


def delete_by_user(db: Session, *, user_id: int) -> None:
    auths = db.scalars(select(GroupAuthorization).where(GroupAuthorization.user_id == user_id)).all()
    for auth in auths:
        db.delete(auth)
    db.commit()


__all__ = [
    "add_authorization",
    "delete_by_group",
    "delete_by_user",
    "list_authorized_users",
    "list_group_ids_for_user",
    "remove_authorizations",
]
