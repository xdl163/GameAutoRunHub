from fastapi import FastAPI

from app.api.routes import router as api_router

app = FastAPI(title="GameAutoRunHub")
app.include_router(api_router)


@app.get("/", summary="根路由")
async def root():
    return {"message": "Hello World"}


@app.get("/hello/{name}", summary="问候接口")
async def say_hello(name: str):
    return {"message": f"Hello {name}"}
