"""配置文件的数据访问层。"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

CONFIG_PATH = Path(__file__).resolve().parents[2] / "config" / "settings.json"


def load_settings() -> Dict[str, Any]:
    if not CONFIG_PATH.exists():
        raise FileNotFoundError(f"配置文件不存在：{CONFIG_PATH}")
    with CONFIG_PATH.open("r", encoding="utf-8") as fp:
        return json.load(fp)


def save_settings(data: Dict[str, Any]) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CONFIG_PATH.open("w", encoding="utf-8") as fp:
        json.dump(data, fp, ensure_ascii=False, indent=2)


__all__ = ["load_settings", "save_settings", "CONFIG_PATH"]
