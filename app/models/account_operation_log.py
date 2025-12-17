"""账户操作日志模型定义。"""
from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.orm import relationship

from app.core.database import Base


class AccountOperationLog(Base):
    __tablename__ = "account_operation_logs"

    id = Column(Integer, primary_key=True, index=True, comment="自增主键")
    target_user_id = Column(Integer, nullable=False, comment="被操作账户ID")
    performed_by = Column(Integer, nullable=False, comment="操作人用户ID")
    action = Column(String(100), nullable=False, comment="操作类型")
    detail = Column(Text, comment="操作详情或备注")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, comment="操作时间")

    target_user = relationship(
        "User",
        primaryjoin="User.id==AccountOperationLog.target_user_id",
        viewonly=True,
    )
    performer = relationship(
        "User",
        primaryjoin="User.id==AccountOperationLog.performed_by",
        viewonly=True,
    )
