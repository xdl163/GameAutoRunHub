"""布局相关接口。"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.models.enums import RoleEnum
from app.models.user import User

router = APIRouter()


@router.get(
    "/layout/menus",
    summary="根据角色返回可见菜单",
    dependencies=[Depends(get_current_user)],
)
async def get_menus(current=Depends(get_current_user)) -> Dict[str, List[Dict]]:
    user: User = current["user"]

    def base_sidebar() -> List[Dict]:
        return [
            {"key": "tasks", "label": "任务管理"},
            {"key": "devices", "label": "设备池"},
            {"key": "account", "label": "账户设置"},
        ]

    sidebar = base_sidebar()

    if user.role in {RoleEnum.ADMIN, RoleEnum.SUPER_ADMIN}:
        sidebar.insert(2, {"key": "users", "label": "用户管理"})
        sidebar.insert(
            3,
            {
                "key": "logs",
                "label": "日志中心",
                "children": [
                    {"key": "task_logs", "label": "任务操作日志"},
                    {"key": "device_logs", "label": "设备池操作日志"},
                    {"key": "account_logs", "label": "账户操作日志"},
                ],
            },
        )

        system_children = [{"key": "global_config", "label": "全局参数配置"}]
        if user.role is RoleEnum.SUPER_ADMIN:
            system_children.insert(0, {"key": "platform_config", "label": "平台级配置"})

        sidebar.append({"key": "system", "label": "系统配置", "children": system_children})

    topbar = {
        "current_user": {"username": user.username, "role": user.role},
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "actions": ["修改密码", "退出登录"],
    }

    return {"topbar": topbar, "sidebar": sidebar}
