"""API 路由聚合器。"""

from fastapi import APIRouter

from . import auth, devices, layout, logs, system, task_groups, tasks, users

router = APIRouter(prefix="/api")

router.include_router(auth.router)
router.include_router(layout.router)
router.include_router(system.router)
router.include_router(users.router)
router.include_router(devices.router)
router.include_router(task_groups.router)
router.include_router(tasks.router)
router.include_router(logs.router)

__all__ = ["router"]
