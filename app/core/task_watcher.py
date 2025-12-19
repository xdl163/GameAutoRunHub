"""后台任务自动完成监控线程。"""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.core.database import SessionLocal
from app.models import TaskStatusEnum, TaskTypeEnum
from app.repository import task_repository
from app.service import task_log_service

logger = logging.getLogger(__name__)

CHECK_INTERVAL_SECONDS = 2
START_TIME_OFFSET = timedelta(hours=8)


def _start_time_with_offset(task) -> Optional[datetime]:
    start = getattr(task, "start_time", None)
    if not start:
        return None
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    return start + START_TIME_OFFSET


def _finish_time_for_task(task) -> Optional[datetime]:
    start = _start_time_with_offset(task)
    if not start:
        return None
    paused_seconds = max(int(getattr(task, "paused_seconds", 0) or 0), 0)

    if task.task_type is TaskTypeEnum.SCORE and getattr(task, "score_detail", None):
        rate_per_hour = task.score_detail.point_rate or 0
        rate_per_second = rate_per_hour / 3600 if rate_per_hour else 0
        if rate_per_second <= 0:
            return None
        remaining_points = max((task.score_detail.target_points or 0) - (task.score_detail.current_points or 0), 0)
        duration_seconds = remaining_points / rate_per_second
        return start + timedelta(seconds=paused_seconds + duration_seconds)

    if task.task_type is TaskTypeEnum.MULTIPLIER and getattr(task, "multiplier_detail", None):
        duration_seconds = max(int(task.multiplier_detail.duration_hours or 0), 0) * 3600
        return start + timedelta(seconds=paused_seconds + duration_seconds)

    if task.task_type is TaskTypeEnum.CHEST and getattr(task, "chest_detail", None):
        duration_seconds = max(int(task.chest_detail.duration_hours or 0), 0) * 3600
        return start + timedelta(seconds=paused_seconds + duration_seconds)

    return None


def _remaining_seconds(task, now: datetime) -> float:
    finish = _finish_time_for_task(task)
    if not finish:
        return float("inf")
    finish_utc = finish.astimezone(timezone.utc)
    return (finish_utc - now).total_seconds()


class TaskAutoCompletionWorker:
    """定期检查运行中任务并自动完成。"""

    def __init__(self):
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, name="task-auto-complete", daemon=True)
        self._thread.start()
        logger.info("Task auto-completion worker started")

    def stop(self):
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5)
        logger.info("Task auto-completion worker stopped")

    def _run(self):
        while not self._stop_event.is_set():
            try:
                self._tick()
            except Exception:  # noqa: BLE001
                logger.exception("task auto-completion tick failed")
            self._stop_event.wait(CHECK_INTERVAL_SECONDS)

    def _tick(self):
        now = datetime.now(timezone.utc)
        db = SessionLocal()
        try:
            tasks = task_repository.list_tasks(db, status=TaskStatusEnum.RUNNING, include_all=True)
            for task in tasks:
                remaining = _remaining_seconds(task, now)
                if remaining <= 0:
                    task.status = TaskStatusEnum.COMPLETED
                    task.end_time = now
                    task.paused_at = None
                    task_repository.save(db, task)
                    try:
                        task_log_service.log_action(
                            db,
                            performer=None,
                            task_id=task.id,
                            action="auto_complete_task",
                            detail="任务剩余时间耗尽，系统自动标记完成",
                        )
                    except Exception:  # noqa: BLE001
                        logger.exception("failed to log auto completion for task %s", task.id)
        finally:
            db.close()


worker = TaskAutoCompletionWorker()


def start_task_watcher():
    worker.start()


def stop_task_watcher():
    worker.stop()


__all__ = ["start_task_watcher", "stop_task_watcher", "worker"]
