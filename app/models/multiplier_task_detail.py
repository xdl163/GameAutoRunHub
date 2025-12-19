"""挂机倍率任务扩展信息模型。"""

from sqlalchemy import Column, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.core.database import Base


class MultiplierTaskDetail(Base):
    __tablename__ = "multiplier_task_details"

    id = Column(Integer, primary_key=True, index=True, comment="自增主键")
    task_id = Column(Integer, ForeignKey("tasks.id"), unique=True, nullable=False, comment="关联任务ID")
    duration_hours = Column(Integer, nullable=False, comment="累计时长（秒）")
    initial_multiplier = Column(Float, default=1.0, nullable=False, comment="初始倍率")
    current_multiplier = Column(Float, default=1.0, nullable=False, comment="当前倍率")

    task = relationship("Task", back_populates="multiplier_detail")
