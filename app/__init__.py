"""GameAutoRunHub 应用包初始化，聚合核心对象供外部调用。"""

from app.core import Base, SessionLocal, engine
from app.api import router as api_router

__all__ = [
    "Base",
    "SessionLocal",
    "engine",
    "api_router",
]
