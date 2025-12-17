"""设备模型定义。"""
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum as SQLEnum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.enums import DevicePlatformEnum, DeviceStatusEnum


class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True, comment="自增主键")
    device_id = Column(String(100), unique=True, nullable=False, comment="平台内唯一设备ID")
    config = Column(Text, comment="设备配置（JSON或文本）")
    platform = Column(SQLEnum(DevicePlatformEnum), nullable=False, comment="设备平台（Android/iOS/模拟器）")
    remark = Column(String(255), comment="备注信息")
    status = Column(
        SQLEnum(DeviceStatusEnum), default=DeviceStatusEnum.IDLE, nullable=False, comment="设备状态"
    )
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False, comment="创建者用户ID")
    task_id = Column(Integer, ForeignKey("tasks.id"), comment="当前绑定任务ID")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, comment="创建时间")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False, comment="更新时间")

    creator = relationship("User")
    task = relationship("Task", back_populates="device")
