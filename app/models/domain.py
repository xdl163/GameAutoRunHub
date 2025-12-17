"""核心领域模型定义，覆盖账户、设备、任务及审计日志。"""
from datetime import datetime
from enum import Enum

from sqlalchemy import Boolean, Column, DateTime, Enum as SQLEnum, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from app.core.database import Base


class RoleEnum(str, Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    USER = "user"


class DevicePlatformEnum(str, Enum):
    ANDROID = "android"
    IOS = "ios"
    EMULATOR = "emulator"


class DeviceStatusEnum(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    SHUTDOWN = "shutdown"
    ERROR = "error"


class TaskTypeEnum(str, Enum):
    SCORE = "score"
    MULTIPLIER = "multiplier"
    CHEST = "chest"


class TaskStatusEnum(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    TERMINATED = "terminated"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, comment="自增主键")
    username = Column(String(50), unique=True, nullable=False, comment="登录用户名")
    display_name = Column(String(100), nullable=False, comment="用户显示名称")
    password_hash = Column(String(255), nullable=False, comment="密码哈希值")
    role = Column(SQLEnum(RoleEnum), nullable=False, comment="角色（超级管理员/管理员/普通用户）")
    is_active = Column(Boolean, default=True, nullable=False, comment="是否启用")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, comment="创建时间")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False, comment="更新时间")


class TaskGroup(Base):
    __tablename__ = "task_groups"

    id = Column(Integer, primary_key=True, index=True, comment="自增主键")
    name = Column(String(100), unique=True, nullable=False, comment="任务分组名称")
    description = Column(String(255), comment="任务分组描述")
    is_default = Column(Boolean, default=False, nullable=False, comment="是否为默认分组")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False, comment="创建人用户ID")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, comment="创建时间")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False, comment="更新时间")

    owner = relationship("User")


class GroupAuthorization(Base):
    __tablename__ = "group_authorizations"
    __table_args__ = (UniqueConstraint("group_id", "user_id", name="uq_group_user"),)

    id = Column(Integer, primary_key=True, index=True, comment="自增主键")
    group_id = Column(Integer, ForeignKey("task_groups.id"), nullable=False, comment="分组ID")
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, comment="授权用户ID")
    can_manage_tasks = Column(Boolean, default=False, nullable=False, comment="是否可管理分组内任务")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, comment="授权时间")

    group = relationship("TaskGroup")
    user = relationship("User")


class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True, comment="自增主键")
    device_id = Column(String(100), unique=True, nullable=False, comment="平台内唯一设备ID")
    config = Column(Text, comment="设备配置（JSON或文本）")
    platform = Column(SQLEnum(DevicePlatformEnum), nullable=False, comment="设备平台（Android/iOS/模拟器）")
    remark = Column(String(255), comment="备注信息")
    status = Column(SQLEnum(DeviceStatusEnum), default=DeviceStatusEnum.IDLE, nullable=False, comment="设备状态")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False, comment="创建者用户ID")
    task_id = Column(Integer, ForeignKey("tasks.id"), comment="当前绑定任务ID")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, comment="创建时间")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False, comment="更新时间")

    creator = relationship("User")
    task = relationship("Task", back_populates="device")


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
    end_time = Column(DateTime, comment="任务结束时间或预计时间")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, comment="创建时间")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False, comment="更新时间")

    device = relationship("Device", back_populates="task")
    group = relationship("TaskGroup")
    creator = relationship("User")
    score_detail = relationship("ScoreTaskDetail", uselist=False, back_populates="task")
    multiplier_detail = relationship("MultiplierTaskDetail", uselist=False, back_populates="task")
    chest_detail = relationship("ChestTaskDetail", uselist=False, back_populates="task")


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


class ChestTaskDetail(Base):
    __tablename__ = "chest_task_details"

    id = Column(Integer, primary_key=True, index=True, comment="自增主键")
    task_id = Column(Integer, ForeignKey("tasks.id"), unique=True, nullable=False, comment="关联任务ID")
    start_time = Column(DateTime, nullable=False, comment="宝箱任务开始时间")
    duration_hours = Column(Integer, nullable=False, comment="持续时长（小时）")
    end_time = Column(DateTime, comment="预计结束时间")

    task = relationship("Task", back_populates="chest_detail")


class TaskOperationLog(Base):
    __tablename__ = "task_operation_logs"

    id = Column(Integer, primary_key=True, index=True, comment="自增主键")
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False, comment="被操作任务ID")
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, comment="操作人用户ID")
    action = Column(String(100), nullable=False, comment="操作类型")
    detail = Column(Text, comment="操作详情或备注")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, comment="操作时间")

    task = relationship("Task")
    user = relationship("User")


class DeviceOperationLog(Base):
    __tablename__ = "device_operation_logs"

    id = Column(Integer, primary_key=True, index=True, comment="自增主键")
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=False, comment="被操作设备ID")
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, comment="操作人用户ID")
    action = Column(String(100), nullable=False, comment="操作类型")
    detail = Column(Text, comment="操作详情或备注")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, comment="操作时间")

    device = relationship("Device")
    user = relationship("User")


class AccountOperationLog(Base):
    __tablename__ = "account_operation_logs"

    id = Column(Integer, primary_key=True, index=True, comment="自增主键")
    target_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, comment="被操作账户ID")
    performed_by = Column(Integer, ForeignKey("users.id"), nullable=False, comment="操作人用户ID")
    action = Column(String(100), nullable=False, comment="操作类型")
    detail = Column(Text, comment="操作详情或备注")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, comment="操作时间")

    target_user = relationship("User", foreign_keys=[target_user_id])
    performer = relationship("User", foreign_keys=[performed_by])
