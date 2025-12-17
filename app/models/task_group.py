"""任务分组模型定义。"""
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.core.database import Base


class TaskGroup(Base):
    __tablename__ = "task_groups"

    id = Column(Integer, primary_key=True, index=True, comment="自增主键")
    name = Column(String(100), unique=True, nullable=False, comment="任务分组名称")
    description = Column(String(255), comment="任务分组描述")
    is_default = Column(Boolean, default=False, nullable=False, comment="是否为默认分组")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False, comment="创建人用户ID")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, comment="创建时间")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False, comment="更新时间")

    owner = relationship("User")
