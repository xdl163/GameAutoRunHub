"""任务通用模型定义。"""
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum as SQLEnum, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.enums import TaskStatusEnum, TaskTypeEnum


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True, comment="自增主键")
    name = Column(String(100), nullable=False, comment="任务名称")
    task_type = Column(SQLEnum(TaskTypeEnum), nullable=False, comment="任务类型：积分/倍率/宝箱")
    status = Column(SQLEnum(TaskStatusEnum), default=TaskStatusEnum.PENDING, nullable=False, comment="任务状态")
    group_id = Column(Integer, ForeignKey("task_groups.id"), nullable=False, comment="所属任务分组ID")
    device_id = Column(Integer, ForeignKey("devices.id"), comment="绑定设备ID")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False, comment="创建人用户ID")
    start_time = Column(DateTime, comment="任务开始时间")

    paused_seconds = Column(Integer, nullable=False, default=0, comment="累计暂停时长（秒）")
    paused_at = Column(DateTime, nullable=True, comment="进入暂停状态的时间点（用于计算本次暂停时长）")

    end_time = Column(DateTime, comment="任务结束时间或预计时间")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, comment="创建时间")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False, comment="更新时间")

    device = relationship("Device", back_populates="task", foreign_keys=[device_id])
    group = relationship("TaskGroup")
    creator = relationship("User")
    score_detail = relationship("ScoreTaskDetail", uselist=False, back_populates="task")
    multiplier_detail = relationship("MultiplierTaskDetail", uselist=False, back_populates="task")
    chest_detail = relationship("ChestTaskDetail", uselist=False, back_populates="task")
