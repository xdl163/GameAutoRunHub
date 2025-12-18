"""任务分组操作日志模型定义。"""
from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text

from app.core.database import Base


class GroupOperationLog(Base):
    __tablename__ = "group_operation_logs"

    id = Column(Integer, primary_key=True, index=True, comment="自增主键")
    group_id = Column(Integer, nullable=False, comment="被操作分组ID")
    user_id = Column(Integer, nullable=False, comment="操作人用户ID")
    action = Column(String(100), nullable=False, comment="操作类型")
    detail = Column(Text, comment="操作详情或备注")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, comment="操作时间")

