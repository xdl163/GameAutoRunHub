"""灵光积分任务扩展信息模型。"""

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.core.database import Base


class ScoreTaskDetail(Base):
    __tablename__ = "score_task_details"

    id = Column(Integer, primary_key=True, index=True, comment="自增主键")
    task_id = Column(Integer, ForeignKey("tasks.id"), unique=True, nullable=False, comment="关联任务ID")
    point_rate = Column(Integer, nullable=False, default=7000, comment="积分速率（每小时积分）")
    target_points = Column(Integer, nullable=False, comment="目标积分")
    current_points = Column(Integer, nullable=False, default=0, comment="当前积分")

    task = relationship("Task", back_populates="score_detail")
