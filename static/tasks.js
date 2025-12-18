(function () {
  const { initConsoleShell, loadTaskState, saveTaskState, appendTaskLog } = window.ConsoleShared;

  let taskState = loadTaskState();
  let currentGroupId = "all";
  let currentSort = "updated_desc";
  let currentOwner = "all";
  let currentUser = null;

  const StatusLabels = {
    pending: { label: "未开始", color: "#6b7280" },
    running: { label: "运行", color: "#16a34a" },
    paused: { label: "暂停", color: "#d97706" },
    completed: { label: "完成", color: "#2563eb" },
    terminated: { label: "终止", color: "#b91c1c" },
  };

  const TypeLabels = {
    score: "灵光积分",
    multiplier: "挂机倍率",
    chest: "宝箱",
  };

  function fmtDate(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
  }

  function minutesToDisplay(minutes) {
    if (!minutes || minutes <= 0) return "0分钟";
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    if (h && m) return `${h}小时${m}分钟`;
    if (h) return `${h}小时`;
    return `${m}分钟`;
  }

  function ensureDefaultGroup() {
    const hasDefault = taskState.groups.some((g) => g.is_default);
    if (!hasDefault) {
      taskState.groups.unshift({
        id: "g-default",
        name: "未分组",
        description: "默认分组，删除分组时任务会回收至此",
        is_default: true,
        owner: currentUser?.username || "system",
      });
    }
  }

  function saveStateAndRender() {
    saveTaskState(taskState);
    renderGroups();
    renderGroupFilter();
    renderOwnerFilter();
    renderTasks();
    renderLogs();
  }

  function computeScoreMeta(task) {
    const detail = task.score || {};
    const target = Number(detail.target_points || 0);
    const current = Number(detail.current_points || 0);
    const rate = Number(detail.point_rate || 0) || 7000;
    const remainingPoints = Math.max(target - current, 0);
    const remainingHours = remainingPoints / rate;
    const remainingMinutes = Math.round(remainingHours * 60);
    const start = task.start_time ? new Date(task.start_time) : new Date();
    const end = new Date(start.getTime() + remainingHours * 3600 * 1000);
    return {
      target,
      current,
      rate,
      remainingMinutes,
      end,
    };
  }

  function computeMultiplierMeta(task) {
    const detail = task.multiplier || {};
    const duration = Number(detail.duration_hours || 0);
    const start = task.start_time ? new Date(task.start_time) : new Date();
    const end = new Date(start.getTime() + duration * 3600 * 1000);
    const now = new Date();
    const remainingMinutes = Math.max(Math.round((end.getTime() - now.getTime()) / 60000), 0);
    const elapsedSeconds = Math.max(Math.round((now.getTime() - start.getTime()) / 1000), 0);
    const currentMultiplier = (detail.current_multiplier || 1) + elapsedSeconds * 1.15;
    return { duration, end, remainingMinutes, currentMultiplier };
  }

  function computeChestMeta(task) {
    const detail = task.chest || {};
    const duration = Number(detail.duration_hours || 0);
    const start = task.start_time ? new Date(task.start_time) : new Date();
    const end = new Date(start.getTime() + duration * 3600 * 1000);
    const now = new Date();
    const remainingMinutes = Math.max(Math.round((end.getTime() - now.getTime()) / 60000), 0);
    return { duration, end, remainingMinutes };
  }

  function renderGroups() {
    ensureDefaultGroup();
    const list = document.querySelector("#group-list");
    const groups = taskState.groups || [];
    const allBtn = document.createElement("button");
    allBtn.className = `group-item ${currentGroupId === "all" ? "active" : ""}`;
    allBtn.innerHTML = `<div><strong>全部任务</strong><p class="muted">查看所有分组</p></div><span class="badge">${taskState.tasks.length}</span>`;
    allBtn.addEventListener("click", () => {
      currentGroupId = "all";
      renderGroupFilter();
      renderTasks();
    });
    list.innerHTML = "";
    list.appendChild(allBtn);

    groups.forEach((group) => {
      const count = taskState.tasks.filter((t) => t.group_id === group.id).length;
      const button = document.createElement("button");
      button.className = `group-item ${currentGroupId === group.id ? "active" : ""}`;
      button.innerHTML = `
        <div>
          <strong>${group.name}</strong>
          <p class="muted">${group.description || "无描述"}</p>
          <p class="muted mini">所属：${group.owner || "未指定"}</p>
        </div>
        <div class="group-actions">
          <span class="badge">${count}</span>
          ${group.is_default ? "" : '<button class="ghost mini danger" data-delete>删除</button>'}
        </div>
      `;
      button.addEventListener("click", (evt) => {
        if (evt.target?.dataset?.delete !== undefined) return;
        currentGroupId = group.id;
        renderGroupFilter();
        renderTasks();
      });
      if (!group.is_default) {
        button.querySelector("[data-delete]")?.addEventListener("click", (evt) => {
          evt.stopPropagation();
          if (!confirm(`删除分组「${group.name}」，组内任务将移至「未分组」`)) return;
          deleteGroup(group.id);
        });
      }
      list.appendChild(button);
    });
  }

  function renderGroupFilter() {
    const wrapper = document.querySelector("#group-filter");
    wrapper.innerHTML = "";
    const createPill = (id, label) => {
      const pill = document.createElement("button");
      pill.className = `pill ${currentGroupId === id ? "active" : ""}`;
      pill.textContent = label;
      pill.addEventListener("click", () => {
        currentGroupId = id;
        renderGroups();
        renderTasks();
      });
      return pill;
    };
    wrapper.appendChild(createPill("all", "全部任务"));
    taskState.groups.forEach((g) => {
      wrapper.appendChild(createPill(g.id, g.name));
    });
  }

  function renderOwnerFilter() {
    const field = document.querySelector("#owner-filter-field");
    const select = document.querySelector("#owner-filter");
    if (!field || !select) return;
    const isAdmin = ["admin", "super_admin"].includes(currentUser.role);
    field.style.display = isAdmin ? "flex" : "none";
    const owners = Array.from(new Set(taskState.groups.map((g) => g.owner).filter(Boolean)));
    owners.unshift("all");
    select.innerHTML = owners
      .map((owner) => `<option value="${owner}">${owner === "all" ? "全部员工" : owner}</option>`)
      .join("");
    select.value = currentOwner;
    select.addEventListener("change", () => {
      currentOwner = select.value;
      renderTasks();
      renderGroups();
    });
  }

  function statusChip(status) {
    const meta = StatusLabels[status] || { label: status, color: "#6b7280" };
    return `<span class="status-chip" style="background:${meta.color}1a;color:${meta.color}">
      <span class="dot" style="background:${meta.color}"></span>${meta.label}
    </span>`;
  }

  function typeChip(type) {
    return `<span class="pill muted">${TypeLabels[type] || type}</span>`;
  }

  function sortTasks(tasks) {
    const copied = [...tasks];
    switch (currentSort) {
      case "status":
        return copied.sort((a, b) => (a.status || "").localeCompare(b.status || ""));
      case "type":
        return copied.sort((a, b) => (a.task_type || "").localeCompare(b.task_type || ""));
      case "start_time":
        return copied.sort((a, b) => new Date(a.start_time || 0) - new Date(b.start_time || 0));
      case "updated_desc":
      default:
        return copied.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
    }
  }

  function filteredTasks() {
    let tasks = [...taskState.tasks];
    if (currentGroupId !== "all") {
      tasks = tasks.filter((t) => t.group_id === currentGroupId);
    }
    if (currentOwner !== "all") {
      tasks = tasks.filter((t) => t.owner === currentOwner);
    }
    return sortTasks(tasks);
  }

  function deviceLine(task) {
    return task.device_id ? `<span class="badge subtle">设备：${task.device_id}</span>` : `<span class="badge warning">待绑定设备</span>`;
  }

  function renderTaskFooter(task) {
    return `
      <div class="task-actions">
        <button class="ghost mini" data-action="start-pause">${task.status === "running" ? "暂停" : "开始"}</button>
        <button class="ghost mini" data-action="patch">${task.task_type === "score" ? "补暂停/积分" : "补暂停"}</button>
        <button class="ghost mini" data-action="edit">修改</button>
        <button class="ghost mini" data-action="move">移动分组</button>
        <button class="ghost mini" data-action="swap-device">更换设备</button>
        <button class="ghost mini" data-action="unbind-device">解绑设备</button>
        <button class="ghost mini danger" data-action="terminate">终止</button>
      </div>
    `;
  }

  function renderTaskBody(task) {
    if (task.task_type === "score") {
      const meta = computeScoreMeta(task);
      return `
        <div class="task-meta">
          <div><span class="muted mini">当前积分</span><strong>${meta.current}</strong></div>
          <div><span class="muted mini">目标积分</span><strong>${meta.target}</strong></div>
          <div><span class="muted mini">积分速率</span><strong>${meta.rate}/小时</strong></div>
          <div><span class="muted mini">剩余时间</span><strong>${minutesToDisplay(meta.remainingMinutes)}</strong></div>
          <div><span class="muted mini">预计结束</span><strong>${fmtDate(meta.end)}</strong></div>
        </div>
      `;
    }
    if (task.task_type === "multiplier") {
      const meta = computeMultiplierMeta(task);
      return `
        <div class="task-meta">
          <div><span class="muted mini">时长</span><strong>${meta.duration}小时</strong></div>
          <div><span class="muted mini">剩余时间</span><strong>${minutesToDisplay(meta.remainingMinutes)}</strong></div>
          <div><span class="muted mini">截至时间</span><strong>${fmtDate(meta.end)}</strong></div>
          <div><span class="muted mini">当前倍率</span><strong>${meta.currentMultiplier.toFixed(2)}</strong></div>
        </div>
      `;
    }
    if (task.task_type === "chest") {
      const meta = computeChestMeta(task);
      return `
        <div class="task-meta">
          <div><span class="muted mini">时长</span><strong>${meta.duration}小时</strong></div>
          <div><span class="muted mini">剩余时间</span><strong>${minutesToDisplay(meta.remainingMinutes)}</strong></div>
          <div><span class="muted mini">截至时间</span><strong>${fmtDate(meta.end)}</strong></div>
        </div>
      `;
    }
    return "";
  }

  function renderTasks() {
    const grid = document.querySelector("#task-grid");
    const tasks = filteredTasks();
    grid.innerHTML = "";
    if (!tasks.length) {
      const empty = document.createElement("div");
      empty.className = "placeholder";
      empty.textContent = "当前筛选下无任务";
      grid.appendChild(empty);
      return;
    }
    tasks.forEach((task) => {
      const card = document.createElement("div");
      card.className = "task-card";
      card.innerHTML = `
        <div class="task-card-header">
          <div>
            <div class="title-line">
              <strong>${task.name}</strong>
              ${typeChip(task.task_type)}
              ${statusChip(task.status)}
            </div>
            <p class="muted mini">任务ID：${task.id} · 分组：${getGroupName(task.group_id)}</p>
            <p class="muted mini">负责人：${task.owner || "未指定"} · 更新时间：${fmtDate(task.updated_at)}</p>
          </div>
          <div class="task-device">${deviceLine(task)}</div>
        </div>
        ${renderTaskBody(task)}
        ${renderTaskFooter(task)}
      `;

      card.querySelectorAll("[data-action]").forEach((btn) => {
        btn.addEventListener("click", (evt) => {
          evt.stopPropagation();
          handleAction(task, btn.dataset.action);
        });
      });

      grid.appendChild(card);
    });
  }

  function getGroupName(id) {
    return taskState.groups.find((g) => g.id === id)?.name || "未知分组";
  }

  function logAction(task, action, detail, scope = "task") {
    const entry = {
      id: Date.now(),
      task_id: task?.id || null,
      action,
      detail,
      performer: currentUser?.username || "anonymous",
      created_at: new Date().toISOString(),
      scope,
    };
    appendTaskLog(entry);
    taskState.logs.push(entry);
  }

  function handleAction(task, action) {
    const now = new Date().toISOString();
    if (action === "start-pause") {
      if (task.status === "running") {
        task.status = "paused";
        logAction(task, "暂停任务", `暂停任务「${task.name}」`);
      } else {
        task.status = "running";
        task.start_time = task.start_time || now;
        logAction(task, "开始任务", `开始/恢复任务「${task.name}」`);
      }
    }

    if (action === "patch") {
      if (task.task_type === "score") {
        const addPoints = Number(prompt("补暂停：输入积分，加分将换算剩余时间", "10000") || 0);
        if (Number.isFinite(addPoints) && addPoints > 0) {
          task.score = task.score || {};
          task.score.current_points = Number(task.score.current_points || 0) + addPoints;
          logAction(task, "补暂停", `补充积分 ${addPoints}`);
        }
      } else {
        const addHours = Number(prompt("补暂停：输入补充时长（小时）", "1") || 0);
        if (Number.isFinite(addHours) && addHours > 0) {
          if (task.task_type === "multiplier") {
            task.multiplier = task.multiplier || {};
            task.multiplier.duration_hours = Number(task.multiplier.duration_hours || 0) + addHours;
          }
          if (task.task_type === "chest") {
            task.chest = task.chest || {};
            task.chest.duration_hours = Number(task.chest.duration_hours || 0) + addHours;
          }
          logAction(task, "补暂停", `补充时长 ${addHours} 小时`);
        }
      }
    }

    if (action === "edit") {
      if (task.task_type === "score") {
        const newTarget = Number(prompt("修改目标积分（不影响进度）", task.score?.target_points || 360000) || 0);
        if (newTarget > 0) {
          task.score = task.score || {};
          task.score.target_points = newTarget;
          logAction(task, "修改", `更新目标积分至 ${newTarget}`);
        }
      }
      if (task.task_type === "multiplier") {
        const addHours = Number(prompt("追加时长（小时）", "12") || 0);
        if (addHours > 0) {
          task.multiplier = task.multiplier || {};
          task.multiplier.duration_hours = Number(task.multiplier.duration_hours || 0) + addHours;
          logAction(task, "修改", `追加 ${addHours} 小时`);
        }
      }
      if (task.task_type === "chest") {
        const addHours = Number(prompt("追加时长（小时）", "12") || 0);
        if (addHours > 0) {
          task.chest = task.chest || {};
          task.chest.duration_hours = Number(task.chest.duration_hours || 0) + addHours;
          logAction(task, "修改", `追加 ${addHours} 小时`);
        }
      }
    }

    if (action === "move") {
      const target = prompt("输入目标分组名称或ID", getGroupName(task.group_id));
      if (!target) return;
      const group = taskState.groups.find((g) => g.id === target || g.name === target);
      if (!group) {
        alert("未找到目标分组");
      } else {
        task.group_id = group.id;
        logAction(task, "移动分组", `移动至分组「${group.name}」`);
      }
    }

    if (action === "swap-device") {
      const newDevice = prompt("更换设备：输入新的设备ID", task.device_id || "");
      if (newDevice) {
        task.device_id = newDevice;
        logAction(task, "更换设备", `任务绑定设备切换为 ${newDevice}`, "device");
      }
    }

    if (action === "unbind-device") {
      if (confirm("解绑设备将记录设备池操作日志，确认解绑？")) {
        logAction(task, "解绑设备", `任务解绑设备 ${task.device_id || "未绑定"}`, "device");
        task.device_id = null;
      }
    }

    if (action === "terminate") {
      if (confirm("终止任务将释放设备，确定终止？")) {
        task.status = "terminated";
        logAction(task, "终止任务", `终止任务「${task.name}」并释放设备 ${task.device_id || "未绑定"}`, "device");
        task.device_id = null;
      }
    }

    task.updated_at = now;
    saveStateAndRender();
  }

  function deleteGroup(groupId) {
    ensureDefaultGroup();
    const defaultGroup = taskState.groups.find((g) => g.is_default) || taskState.groups[0];
    taskState.tasks = taskState.tasks.map((task) => (task.group_id === groupId ? { ...task, group_id: defaultGroup.id } : task));
    taskState.groups = taskState.groups.filter((g) => g.id !== groupId);
    saveStateAndRender();
  }

  function renderLogs() {
    const container = document.querySelector("#task-log-list");
    const logs = [...taskState.logs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 12);
    container.innerHTML = "";
    if (!logs.length) {
      container.innerHTML = `<p class="muted mini">暂无日志</p>`;
      return;
    }
    logs.forEach((log) => {
      const row = document.createElement("div");
      row.className = "log-row";
      row.innerHTML = `
        <div>
          <strong>${log.action}</strong>
          <p class="muted mini">${fmtDate(log.created_at)} · 任务ID：${log.task_id || "-"} · 执行人：${log.performer}</p>
          <p class="muted">${log.detail || "-"}</p>
        </div>
        <span class="pill ${log.scope === "device" ? "warning" : "muted"}">${log.scope === "device" ? "设备池" : "任务"}</span>
      `;
      container.appendChild(row);
    });
  }

  function openModal(id) {
    document.querySelector(id)?.classList.add("active");
  }

  function closeModal(id) {
    document.querySelector(id)?.classList.remove("active");
  }

  function bindModalClose() {
    document.querySelectorAll("[data-close]").forEach((btn) => {
      const target = btn.dataset.close;
      btn.addEventListener("click", () => closeModal(target));
    });
  }

  function resetTaskForm() {
    document.querySelector("#task-name").value = "";
    document.querySelector("#task-device").value = "";
    document.querySelector("#task-score-current").value = 0;
    document.querySelector("#task-score-rate").value = 7000;
    document.querySelector("#task-score-target").value = 360000;
    document.querySelector("#task-multiplier-duration").value = 12;
    document.querySelector("#task-multiplier-current").value = 1.0;
    document.querySelector("#task-chest-duration").value = 12;
    document.querySelector("#task-start").value = new Date().toISOString().slice(0, 16);
  }

  function updateTaskTypeSections() {
    const type = document.querySelector("#task-type").value;
    document.querySelectorAll(".type-section").forEach((section) => {
      section.style.display = section.dataset.type === type ? "block" : "none";
    });
  }

  function populateGroupSelects() {
    const select = document.querySelector("#task-group");
    select.innerHTML = taskState.groups
      .map((g) => `<option value="${g.id}">${g.name}</option>`)
      .join("");
  }

  function createGroup() {
    const name = document.querySelector("#group-name").value.trim();
    const desc = document.querySelector("#group-desc").value.trim();
    const owner = document.querySelector("#group-owner").value.trim() || currentUser.username;
    if (!name) {
      alert("请输入分组名称");
      return;
    }
    const newGroup = {
      id: `g-${Date.now()}`,
      name,
      description: desc,
      owner,
      is_default: false,
    };
    taskState.groups.push(newGroup);
    closeModal("#group-modal");
    saveStateAndRender();
  }

  function createTask() {
    const name = document.querySelector("#task-name").value.trim();
    const type = document.querySelector("#task-type").value;
    const groupId = document.querySelector("#task-group").value;
    const device = document.querySelector("#task-device").value.trim();
    const owner = document.querySelector("#task-owner").value.trim() || currentUser.username;
    const start = document.querySelector("#task-start").value;
    if (!name) return alert("请输入任务名称");
    const newTask = {
      id: Date.now(),
      name,
      task_type: type,
      status: "pending",
      group_id: groupId,
      device_id: device || null,
      owner,
      start_time: start || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (type === "score") {
      newTask.score = {
        target_points: Number(document.querySelector("#task-score-target").value || 360000),
        current_points: Number(document.querySelector("#task-score-current").value || 0),
        point_rate: Number(document.querySelector("#task-score-rate").value || 7000),
      };
    }
    if (type === "multiplier") {
      newTask.multiplier = {
        duration_hours: Number(document.querySelector("#task-multiplier-duration").value || 0),
        current_multiplier: Number(document.querySelector("#task-multiplier-current").value || 1.0),
      };
    }
    if (type === "chest") {
      newTask.chest = {
        duration_hours: Number(document.querySelector("#task-chest-duration").value || 0),
      };
    }
    taskState.tasks.push(newTask);
    logAction(newTask, "创建任务", `创建${TypeLabels[type]}任务「${name}」`);
    closeModal("#task-modal");
    saveStateAndRender();
  }

  function toggleOwnerFields() {
    const groupOwnerField = document.querySelector("#group-owner-field");
    const taskOwnerField = document.querySelector("#task-owner-field");
    const isAdmin = ["admin", "super_admin"].includes(currentUser.role);
    [groupOwnerField, taskOwnerField].forEach((field) => {
      if (field) field.style.display = isAdmin ? "flex" : "none";
    });
  }

  function bindEvents() {
    document.querySelector("#create-group-btn")?.addEventListener("click", () => {
      document.querySelector("#group-name").value = "";
      document.querySelector("#group-desc").value = "";
      document.querySelector("#group-owner").value = currentUser.username;
      openModal("#group-modal");
    });
    document.querySelector("#create-task-btn")?.addEventListener("click", () => {
      populateGroupSelects();
      resetTaskForm();
      updateTaskTypeSections();
      document.querySelector("#task-owner").value = currentUser.username;
      openModal("#task-modal");
    });
    document.querySelector("#submit-group")?.addEventListener("click", createGroup);
    document.querySelector("#submit-task")?.addEventListener("click", createTask);
    document.querySelector("#task-type")?.addEventListener("change", updateTaskTypeSections);
    document.querySelector("#task-sort")?.addEventListener("change", (evt) => {
      currentSort = evt.target.value;
      renderTasks();
    });
    document.querySelector("#group-refresh")?.addEventListener("click", () => {
      taskState = loadTaskState();
      renderGroups();
      renderTasks();
    });
    document.querySelector("#log-refresh")?.addEventListener("click", () => {
      taskState = loadTaskState();
      renderLogs();
    });
    bindModalClose();
  }

  document.addEventListener("DOMContentLoaded", () => {
    currentUser = initConsoleShell("tasks");
    if (!currentUser) return;

    populateGroupSelects();
    toggleOwnerFields();
    renderOwnerFilter();
    renderGroups();
    renderGroupFilter();
    renderTasks();
    renderLogs();
    updateTaskTypeSections();
    bindEvents();
  });
})();
