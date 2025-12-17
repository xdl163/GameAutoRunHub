"""API 路由层（控制器），用于组织业务接口。"""
from fastapi import APIRouter

router = APIRouter(prefix="/api")


@router.get("/health", summary="健康检查")
async def health_check():
    """健康检查示例接口。"""
    return {"status": "ok"}
