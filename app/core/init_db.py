"""数据库初始化逻辑。"""
from __future__ import annotations

from sqlalchemy import select

from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
from app.models.enums import RoleEnum
from app.models.user import User

DEFAULT_ADMIN_USERNAME = "admin"
DEFAULT_ADMIN_PASSWORD = "xu12345678gh"
DEFAULT_ADMIN_DISPLAY_NAME = "超级管理员"


def init_database() -> None:
    """初始化数据库并创建默认超级管理员。"""

    Base.metadata.create_all(bind=engine)

    with SessionLocal() as session:
        existing_admin = session.scalars(
            select(User).where(User.username == DEFAULT_ADMIN_USERNAME)
        ).first()

        if existing_admin:
            return

        admin_user = User(
            username=DEFAULT_ADMIN_USERNAME,
            display_name=DEFAULT_ADMIN_DISPLAY_NAME,
            password_hash=hash_password(DEFAULT_ADMIN_PASSWORD),
            role=RoleEnum.SUPER_ADMIN,
            is_active=True,
        )
        session.add(admin_user)
        session.commit()
