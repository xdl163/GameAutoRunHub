"""设备操作日志模型定义。"""
from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text

from app.core.database import Base


class DeviceOperationLog(Base):
    __tablename__ = "device_operation_logs"

    id = Column(Integer, primary_key=True, index=True, comment="自增主键")
    # 不设置外键，避免设备删除后影响历史日志
    device_id = Column(Integer, nullable=False, comment="被操作设备ID")
    user_id = Column(Integer, nullable=False, comment="操作人用户ID")
    action = Column(String(100), nullable=False, comment="操作类型")
    detail = Column(Text, comment="操作详情或备注")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, comment="操作时间")

