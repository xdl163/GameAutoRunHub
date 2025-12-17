"""API 层：负责暴露路由，连接业务与外部请求。"""

from .routes import router

__all__ = ["router"]
