"""挂机倍率任务扩展信息模型。"""
from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.core.database import Base


class MultiplierTaskDetail(Base):
    __tablename__ = "multiplier_task_details"

    id = Column(Integer, primary_key=True, index=True, comment="自增主键")
    task_id = Column(Integer, ForeignKey("tasks.id"), unique=True, nullable=False, comment="关联任务ID")
    start_time = Column(DateTime, nullable=False, comment="倍率任务开始时间")
    duration_hours = Column(Integer, nullable=False, comment="累计时长（小时）")
    end_time = Column(DateTime, comment="预计结束时间")
    current_multiplier = Column(Float, default=1.0, nullable=False, comment="当前倍率")
    increment_rule = Column(String(255), default="每秒+1.15", nullable=False, comment="倍率增长规则描述")

    task = relationship("Task", back_populates="multiplier_detail")
