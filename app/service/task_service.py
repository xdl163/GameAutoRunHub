"""任务领域服务，遵循三层架构。"""
from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Iterable

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import (
    ChestTaskDetail,
    DeviceStatusEnum,
    MultiplierTaskDetail,
    RoleEnum,
    ScoreTaskDetail,
    Task,
    TaskStatusEnum,
    TaskTypeEnum,
    User,
)
from app.core import config
from app.repository import device_repository, task_group_repository, task_repository
from app.service import device_operation_log_service, task_group_service, task_log_service


class TaskPermission:
    """权限辅助类。"""

    @staticmethod
    def ensure_can_manage_task(requester: User, task: Task, accessible_group_ids: Iterable[int]):
        if requester.role in {RoleEnum.ADMIN, RoleEnum.SUPER_ADMIN}:
            return
        if task.group_id in accessible_group_ids:
            return
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权操作该任务")


def _ensure_group_access(db: Session, *, requester: User, group_id: int):
    group = task_group_repository.get_by_id(db, group_id)
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="分组不存在")
    if group.name == "已完成":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="已完成分组不可创建新任务")
    if group.created_by != requester.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权在该分组下创建任务")
    return group


def _generate_task_name(task_type: TaskTypeEnum) -> str:
    prefix_map = {
        TaskTypeEnum.SCORE: "积分",
        TaskTypeEnum.MULTIPLIER: "倍率",
        TaskTypeEnum.CHEST: "宝箱",
    }
    prefix = prefix_map.get(task_type, "任务")
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    suffix = secrets.token_hex(2)
    return f"{prefix}任务-{timestamp}-{suffix}"


def _update_device_binding(
    db: Session,
    *,
    performer: User,
    task: Task,
    device_id: int | None,
    action: str,
):
    prev_device = device_repository.get_by_id(db, task.device_id) if task.device_id else None
    if device_id is None:
        task.device_id = None
        if prev_device:
            prev_device.status = DeviceStatusEnum.IDLE
            device_repository.save(db, prev_device)
            device_operation_log_service.log_action(
                db,
                performer=performer,
                device=prev_device,
                action=action,
                detail=f"任务 {task.id} 解绑设备",
            )
        return task

    new_device = device_repository.get_by_id(db, device_id)
    if not new_device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="设备不存在")
    if new_device.created_by != performer.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权绑定该设备")
    if new_device.status != DeviceStatusEnum.IDLE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="设备当前不可用")
    if prev_device and prev_device.id == device_id:
        if prev_device.status != DeviceStatusEnum.RUNNING:
            prev_device.status = DeviceStatusEnum.RUNNING
            device_repository.save(db, prev_device)
            device_operation_log_service.log_action(
                db,
                performer=performer,
                device=prev_device,
                action=action,
                detail=f"任务 {task.id} 更新设备状态为运行",
            )
        return task
    new_device.status = DeviceStatusEnum.RUNNING
    device_repository.save(db, new_device)

    task.device_id = device_id
    if prev_device and prev_device.id != device_id:
        prev_device.status = DeviceStatusEnum.IDLE
        device_repository.save(db, prev_device)
        device_operation_log_service.log_action(
            db,
            performer=performer,
            device=prev_device,
            action="unbind_task",
            detail=f"任务 {task.id} 释放设备",
        )
    device_operation_log_service.log_action(
        db,
        performer=performer,
        device=new_device,
        action=action,
        detail=f"任务 {task.id} 绑定设备 {new_device.device_id}",
    )
    return task


def create_task(
    db: Session,
    *,
    requester: User,
    name: str | None,
    task_type: TaskTypeEnum,
    group_id: int,
    device_id: int | None,
    start_time: datetime | None,
    score_detail: dict | None = None,
    multiplier_detail: dict | None = None,
    chest_detail: dict | None = None,
) -> Task:
    group = _ensure_group_access(db, requester=requester, group_id=group_id)
    if device_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="创建任务时必须绑定设备")
    final_name = (name or "").strip() or _generate_task_name(task_type)
    device = device_repository.get_by_id(db, device_id)
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="设备不存在")
    if device.created_by != requester.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权绑定该设备")
    if device.status != DeviceStatusEnum.IDLE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="设备当前不可用")
    settings = config.get_settings()
    start_at = start_time or datetime.now(timezone.utc)
    task = task_repository.create_task(
        db,
        name=final_name,
        task_type=task_type,
        group_id=group.id,
        created_by=requester.id,
        device_id=device_id,
        start_time=start_at,
        status=TaskStatusEnum.RUNNING,
    )

    if task_type is TaskTypeEnum.SCORE:
        task.score_detail = ScoreTaskDetail(
            task_id=task.id,
            point_rate=score_detail.get("point_rate") if score_detail else settings.default_score_rate,
            target_points=score_detail.get("target_points") if score_detail else 360000,
        )
    if task_type is TaskTypeEnum.MULTIPLIER:
        initial_multiplier_value = None
        if multiplier_detail is not None:
            initial_multiplier_value = multiplier_detail.get("initial_multiplier")
        initial_multiplier_value = 1.0 if initial_multiplier_value is None else float(initial_multiplier_value)
        task.multiplier_detail = MultiplierTaskDetail(
            task_id=task.id,
            duration_hours=multiplier_detail.get("duration_hours") if multiplier_detail else 0,
            initial_multiplier=initial_multiplier_value,
            current_multiplier=multiplier_detail.get("current_multiplier") if multiplier_detail else settings.default_multiplier,
        )
    if task_type is TaskTypeEnum.CHEST:
        task.chest_detail = ChestTaskDetail(
            task_id=task.id,
            duration_hours=chest_detail.get("duration_hours") if chest_detail else 0,
        )

    _update_device_binding(db, performer=requester, task=task, device_id=device_id, action="bind_task")

    saved = task_repository.save(db, task)
    task_log_service.log_action(
        db,
        performer=requester,
        task_id=saved.id,
        action="create_task",
        detail=f"创建任务「{saved.name}」",
    )
    return saved


def list_tasks(
    db: Session,
    *,
    requester: User,
    group_id: int | None = None,
    task_type: TaskTypeEnum | None = None,
    status: TaskStatusEnum | None = None,
) -> list[Task]:
    accessible_group_ids = task_group_service.resolve_accessible_group_ids(db, requester=requester)
    if requester.role not in {RoleEnum.ADMIN, RoleEnum.SUPER_ADMIN}:
        if group_id and group_id not in accessible_group_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权查看该分组任务")

    target_groups = accessible_group_ids if group_id is None else [group_id]
    return task_repository.list_tasks(
        db,
        group_ids=target_groups,
        created_by=None,
        task_type=task_type,
        status=status,
    )


def _validate_transition(task: Task, action: str):
    allowed = {"start", "pause", "resume", "complete", "terminate"}
    if action not in allowed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="非法的状态流转动作")
    if action == "start" and task.status not in {TaskStatusEnum.PENDING, TaskStatusEnum.PAUSED}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="当前状态无法开始")
    if action == "pause" and task.status != TaskStatusEnum.RUNNING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="只有运行中任务可暂停")
    if action == "resume" and task.status != TaskStatusEnum.PAUSED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="只有暂停任务可恢复")
    if action == "complete" and task.status not in {TaskStatusEnum.RUNNING, TaskStatusEnum.PAUSED}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="当前状态无法完成")
    if action == "terminate" and task.status == TaskStatusEnum.TERMINATED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="任务已终止")


def update_status(db: Session, *, requester: User, task_id: int, action: str) -> Task:
    task = task_repository.get_by_id(db, task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
    accessible = task_group_service.resolve_accessible_group_ids(db, requester=requester)
    TaskPermission.ensure_can_manage_task(requester, task, accessible)

    _validate_transition(task, action)
    now = datetime.now(timezone.utc)

    group = task_group_repository.get_by_id(db, task.group_id)
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务分组不存在")

    if action in {"start", "resume"}:
        task.status = TaskStatusEnum.RUNNING
        task.start_time = task.start_time or now
        task.paused_at = None
    if action == "pause":
        task.status = TaskStatusEnum.PAUSED
        task.paused_at = now
    if action == "complete":
        task.status = TaskStatusEnum.COMPLETED
        task.end_time = now
    if action == "terminate":
        task.status = TaskStatusEnum.TERMINATED
        task.end_time = now
        _, completed_group = task_group_service.ensure_user_default_groups(db, owner=group.created_by)
        task.group_id = completed_group.id
        _update_device_binding(db, performer=requester, task=task, device_id=None, action="unbind_task")

    saved = task_repository.save(db, task)
    task_log_service.log_action(
        db,
        performer=requester,
        task_id=saved.id,
        action=f"{action}_task",
        detail=f"任务状态更新为 {saved.status.value}",
    )
    return saved


def patch_task(
    db: Session,
    *,
    requester: User,
    task_id: int,
    add_points: int | None = None,
    add_hours: int | None = None,
) -> Task:
    task = task_repository.get_by_id(db, task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
    accessible = task_group_service.resolve_accessible_group_ids(db, requester=requester)
    TaskPermission.ensure_can_manage_task(requester, task, accessible)

    if (add_points is None or add_points <= 0) and (add_hours is None or add_hours <= 0):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请提供有效的积分或时长")

    detail_msg = []
    if task.task_type is TaskTypeEnum.SCORE and add_points:
        task.score_detail.current_points = int(task.score_detail.current_points or 0) + add_points
        detail_msg.append(f"补充积分 {add_points}")
    if task.task_type in {TaskTypeEnum.MULTIPLIER, TaskTypeEnum.CHEST} and add_hours:
        if task.task_type is TaskTypeEnum.MULTIPLIER:
            task.multiplier_detail.duration_hours = int(task.multiplier_detail.duration_hours or 0) + add_hours
        else:
            task.chest_detail.duration_hours = int(task.chest_detail.duration_hours or 0) + add_hours
        detail_msg.append(f"补充时长 {add_hours} 小时")

    saved = task_repository.save(db, task)
    if detail_msg:
        task_log_service.log_action(
            db,
            performer=requester,
            task_id=saved.id,
            action="update_task_detail",
            detail="；".join(detail_msg),
        )
    return saved


def update_detail(
    db: Session,
    *,
    requester: User,
    task_id: int,
    score_target: int | None = None,
    score_rate: int | None = None,
    multiplier_hours: int | None = None,
    multiplier_initial: float | None = None,
    multiplier_increment: float | None = None,
    chest_hours: int | None = None,
) -> Task:
    task = task_repository.get_by_id(db, task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
    accessible = task_group_service.resolve_accessible_group_ids(db, requester=requester)
    TaskPermission.ensure_can_manage_task(requester, task, accessible)

    changes = []
    if task.task_type is TaskTypeEnum.SCORE and task.score_detail:
        if score_target is not None:
            task.score_detail.target_points = int(score_target)
            changes.append(f"目标积分调整为 {score_target}")
        if score_rate is not None:
            task.score_detail.point_rate = int(score_rate)
            changes.append(f"积分速率调整为 {score_rate}")
    if task.task_type is TaskTypeEnum.MULTIPLIER and task.multiplier_detail:
        if multiplier_hours is not None:
            task.multiplier_detail.duration_hours = int(multiplier_hours)
            changes.append(f"时长调整为 {multiplier_hours} 小时")
        if multiplier_initial is not None:
            task.multiplier_detail.initial_multiplier = float(multiplier_initial)
            changes.append(f"初始倍率调整为 {multiplier_initial}")
        if multiplier_increment is not None:
            task.multiplier_detail.current_multiplier = float(multiplier_increment)
            changes.append(f"当前倍率调整为 {multiplier_increment}")
    if task.task_type is TaskTypeEnum.CHEST and task.chest_detail:
        if chest_hours is not None:
            task.chest_detail.duration_hours = int(chest_hours)
            changes.append(f"时长调整为 {chest_hours} 小时")

    if not changes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="未提供有效的变更字段")

    saved = task_repository.save(db, task)
    task_log_service.log_action(
        db,
        performer=requester,
        task_id=saved.id,
        action="update_task_detail",
        detail="；".join(changes),
    )
    return saved


def move_group(db: Session, *, requester: User, task_id: int, target_group_id: int) -> Task:
    task = task_repository.get_by_id(db, task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
    accessible = task_group_service.resolve_accessible_group_ids(db, requester=requester)
    TaskPermission.ensure_can_manage_task(requester, task, accessible)

    group = task_group_repository.get_by_id(db, target_group_id)
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="目标分组不存在")
    source_group = task_group_repository.get_by_id(db, task.group_id)
    if not source_group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务分组不存在")

    if source_group.created_by != requester.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权移动该分组下的任务")
    if group.created_by != requester.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权将任务移动到目标分组")

    task.group_id = target_group_id
    saved = task_repository.save(db, task)
    task_log_service.log_action(
        db,
        performer=requester,
        task_id=saved.id,
        action="move_task_group",
        detail=f"移动到分组「{group.name}」",
    )
    return saved


def change_device(db: Session, *, requester: User, task_id: int, device_id: int | None) -> Task:
    task = task_repository.get_by_id(db, task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
    accessible = task_group_service.resolve_accessible_group_ids(db, requester=requester)
    TaskPermission.ensure_can_manage_task(requester, task, accessible)

    _update_device_binding(
        db,
        performer=requester,
        task=task,
        device_id=device_id,
        action="bind_task" if device_id else "unbind_task",
    )
    saved = task_repository.save(db, task)
    task_log_service.log_action(
        db,
        performer=requester,
        task_id=saved.id,
        action="bind_device" if device_id else "unbind_device",
        detail="绑定设备" if device_id else "解绑设备",
    )
    return saved


__all__ = [
    "change_device",
    "create_task",
    "list_tasks",
    "move_group",
    "patch_task",
    "update_detail",
    "update_status",
]
