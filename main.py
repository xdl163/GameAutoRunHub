from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import router as api_router
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
async def tasks_page():
    return FileResponse("static/tasks.html")


@app.get("/devices", summary="设备池", include_in_schema=False)
async def devices_page():
    return FileResponse("static/devices.html")


@app.get("/users", summary="用户管理", include_in_schema=False)
async def users_page():
    return FileResponse("static/users.html")


@app.get("/logs", summary="日志中心", include_in_schema=False)
async def logs_page():
    return FileResponse("static/logs.html")


@app.get("/system", summary="系统配置", include_in_schema=False)
async def system_page():
    return FileResponse("static/system.html")


@app.get("/account", summary="账户设置", include_in_schema=False)
async def account_page():
    return FileResponse("static/account.html")


@app.get("/hello/{name}", summary="问候接口")
async def say_hello(name: str):
    return {"message": f"Hello {name}"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)
