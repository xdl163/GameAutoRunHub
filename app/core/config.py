"""应用配置加载与管理模块。"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict

from pydantic import BaseModel, Field, ValidationError

# 配置文件位于项目根目录下的 config/settings.json
CONFIG_PATH = Path(__file__).resolve().parents[2] / "config" / "settings.json"


class Settings(BaseModel):
    """应用基础配置。"""

    database_url: str = Field(..., alias="DATABASE_URL")


def _load_raw_config() -> Dict[str, Any]:
    if not CONFIG_PATH.exists():
        raise FileNotFoundError(
            f"配置文件未找到：{CONFIG_PATH}. 请创建 settings.json 并提供 DATABASE_URL"
        )

    with CONFIG_PATH.open("r", encoding="utf-8") as fp:
        return json.load(fp)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """加载并缓存应用配置。"""

    data = _load_raw_config()
    try:
        return Settings(**data)
    except ValidationError as exc:
        raise ValueError(f"配置文件内容无效：{exc}") from exc


__all__ = ["get_settings", "Settings", "CONFIG_PATH"]
