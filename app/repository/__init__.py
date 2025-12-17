"""仓储层：负责数据访问与持久化，隔离数据库细节。"""

from . import config_repository, user_repository

__all__ = ["config_repository", "user_repository"]
