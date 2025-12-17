from fastapi import Depends, FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import router as api_router
from app.api.deps import get_current_user
from app.core.init_db import init_database

app = FastAPI(title="GameAutoRunHub")

app.mount("/static", StaticFiles(directory="static"), name="static")

# 初始化数据库并创建默认超级管理员
init_database()

app.include_router(api_router)


@app.get("/", summary="控制台入口", include_in_schema=False)
async def root():
    return FileResponse("static/index.html")


@app.get("/tasks", summary="任务管理", include_in_schema=False)
async def tasks_page(current=Depends(get_current_user)):
    return FileResponse("static/tasks.html")


@app.get("/devices", summary="设备池", include_in_schema=False)
async def devices_page(current=Depends(get_current_user)):
    return FileResponse("static/devices.html")


@app.get("/users", summary="用户管理", include_in_schema=False)
async def users_page(current=Depends(get_current_user)):
    return FileResponse("static/users.html")


@app.get("/logs", summary="日志中心", include_in_schema=False)
async def logs_page(current=Depends(get_current_user)):
    return FileResponse("static/logs.html")


@app.get("/logs/account", summary="账户操作日志", include_in_schema=False)
async def account_logs_page(current=Depends(get_current_user)):
    return FileResponse("static/logs.html")


@app.get("/logs/task", summary="任务操作日志", include_in_schema=False)
async def task_logs_page(current=Depends(get_current_user)):
    return FileResponse("static/task-logs.html")


@app.get("/logs/device", summary="设备池操作日志", include_in_schema=False)
async def device_logs_page(current=Depends(get_current_user)):
    return FileResponse("static/device-logs.html")


@app.get("/system", summary="系统配置", include_in_schema=False)
async def system_page(current=Depends(get_current_user)):
    return FileResponse("static/system.html")


@app.get("/system/global", summary="全局参数配置", include_in_schema=False)
async def system_global_page(current=Depends(get_current_user)):
    return FileResponse("static/system.html")


@app.get("/system/platform", summary="平台级配置", include_in_schema=False)
async def system_platform_page(current=Depends(get_current_user)):
    return FileResponse("static/system-platform.html")


@app.get("/account", summary="账户设置", include_in_schema=False)
async def account_page(current=Depends(get_current_user)):
    return FileResponse("static/account.html")


@app.get("/hello/{name}", summary="问候接口")
async def say_hello(name: str):
    return {"message": f"Hello {name}"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)
