"""灵光积分任务扩展信息模型。"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.core.database import Base


class ScoreTaskDetail(Base):
    __tablename__ = "score_task_details"

    id = Column(Integer, primary_key=True, index=True, comment="自增主键")
    task_id = Column(Integer, ForeignKey("tasks.id"), unique=True, nullable=False, comment="关联任务ID")
    start_time = Column(DateTime, nullable=False, comment="积分任务开始时间")
    point_rate = Column(Integer, nullable=False, default=7000, comment="积分速率（每小时积分）")
    target_points = Column(Integer, nullable=False, comment="目标积分")
    current_points = Column(Integer, default=0, nullable=False, comment="当前累计积分")
    estimated_end_time = Column(DateTime, comment="预计结束时间")
    remark = Column(String(255), comment="备注说明")

    task = relationship("Task", back_populates="score_detail")
