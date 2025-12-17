"""分组授权模型定义。"""
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import relationship

from app.core.database import Base


class GroupAuthorization(Base):
    __tablename__ = "group_authorizations"
    __table_args__ = (UniqueConstraint("group_id", "user_id", name="uq_group_user"),)

    id = Column(Integer, primary_key=True, index=True, comment="自增主键")
    group_id = Column(Integer, ForeignKey("task_groups.id"), nullable=False, comment="分组ID")
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, comment="授权用户ID")
    can_manage_tasks = Column(Boolean, default=False, nullable=False, comment="是否可管理分组内任务")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, comment="授权时间")

    group = relationship("TaskGroup")
    user = relationship("User")
