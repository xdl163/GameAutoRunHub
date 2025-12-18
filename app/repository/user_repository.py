"""User 数据访问层。"""
from __future__ import annotations

from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User


def get_by_username(db: Session, username: str) -> Optional[User]:
    return db.scalars(select(User).where(User.username == username)).first()


def get_by_id(db: Session, user_id: int) -> Optional[User]:
    return db.get(User, user_id)


def list_users(db: Session) -> List[User]:
    return db.scalars(select(User)).all()


def list_active_users(db: Session) -> List[User]:
    return db.scalars(select(User).where(User.is_active.is_(True))).all()


def create_user(
    db: Session,
    *,
    username: str,
    display_name: str,
    password_hash: str,
    role,
    is_active: bool = True,
) -> User:
    user = User(
        username=username,
        display_name=display_name,
        password_hash=password_hash,
        role=role,
        is_active=is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def save(db: Session, user: User) -> User:
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def delete(db: Session, user: User) -> None:
    db.delete(user)
    db.commit()
