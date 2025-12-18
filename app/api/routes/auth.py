"""认证与通用接口。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel

from app.api.deps import get_current_user, get_db
from app.service import user_service

from .users import UserRead

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    user: UserRead


@router.post("/login", response_model=LoginResponse, summary="登录获取令牌")
async def login(payload: LoginRequest, response: Response, db=Depends(get_db)):
    result = user_service.authenticate(db, username=payload.username, password=payload.password)
    response.set_cookie(
        "access_token",
        result.token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=60 * 60 * 12,
    )
    return LoginResponse(token=result.token, user=result.user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, summary="注销并回收令牌")
async def logout(response: Response, current=Depends(get_current_user), db=Depends(get_db)):
    user_service.logout(db, user=current["user"], token=current["token"])
    response.delete_cookie("access_token")
    return None


@router.get("/health", summary="健康检查", dependencies=[Depends(get_current_user)])
async def health_check():
    return {"status": "ok"}
