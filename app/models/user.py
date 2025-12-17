"""账户模型定义。"""
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Enum as SQLEnum, Integer, String

from app.core.database import Base
from app.models.enums import RoleEnum


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, comment="自增主键")
    username = Column(String(50), unique=True, nullable=False, comment="登录用户名")
    display_name = Column(String(100), nullable=False, comment="用户显示名称")
    password_hash = Column(String(255), nullable=False, comment="密码哈希值")
    role = Column(SQLEnum(RoleEnum), nullable=False, comment="角色（超级管理员/管理员/普通用户）")
    is_active = Column(Boolean, default=True, nullable=False, comment="是否启用")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, comment="创建时间")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False, comment="更新时间")
