"""模型枚举定义，统一管理角色、设备与任务的状态。"""
from enum import Enum


class RoleEnum(str, Enum):
    """角色枚举"""

    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    USER = "user"


class DevicePlatformEnum(str, Enum):
    """设备平台枚举"""

    ANDROID = "android"
    IOS = "ios"
    EMULATOR = "emulator"


class DeviceStatusEnum(str, Enum):
    """设备状态枚举"""

    IDLE = "idle"
    RUNNING = "running"
    SHUTDOWN = "shutdown"
    ERROR = "error"


class TaskTypeEnum(str, Enum):
    """任务类型枚举"""

    SCORE = "score"
    MULTIPLIER = "multiplier"
    CHEST = "chest"


class TaskStatusEnum(str, Enum):
    """任务状态枚举"""

    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    TERMINATED = "terminated"
