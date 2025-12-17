"""宝箱任务扩展信息模型。"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer
from sqlalchemy.orm import relationship

from app.core.database import Base


class ChestTaskDetail(Base):
    __tablename__ = "chest_task_details"

    id = Column(Integer, primary_key=True, index=True, comment="自增主键")
    task_id = Column(Integer, ForeignKey("tasks.id"), unique=True, nullable=False, comment="关联任务ID")
    start_time = Column(DateTime, nullable=False, comment="宝箱任务开始时间")
    duration_hours = Column(Integer, nullable=False, comment="持续时长（小时）")
    end_time = Column(DateTime, comment="预计结束时间")

    task = relationship("Task", back_populates="chest_detail")
