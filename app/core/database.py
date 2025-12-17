"""数据库基础配置与Session创建（示例）。"""
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# 使用SQLite示例，实际项目可替换为真实数据库连接串。
DATABASE_URL = "sqlite:///./game_auto_run_hub.db"

engine = create_engine(DATABASE_URL, echo=False, future=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# ORM模型基类
Base = declarative_base()
