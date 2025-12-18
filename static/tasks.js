(function () {
  const { initConsoleShell, loadTaskState, saveTaskState, appendTaskLog, apiFetch } = window.ConsoleShared;

  let taskState = loadTaskState();
  let currentGroupId = "all";
  let currentSort = "updated_desc";
  let currentOwner = "all";
  let currentStatus = "all";
  let currentType = "all";
  let currentUser = null;
  let selectedTaskId = null;
  let selectedGroupId = null;
  let manageAccessSelection = [];
  let userOptions = [];
  let userLoadPromise = null;
  const deviceOptionsCache = new Map();
  const deviceLoadPromises = new Map();
  let realtimeTimer = null;

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

  const StatusFilters = [
    { id: "all", label: "全部状态" },
    { id: "pending", label: StatusLabels.pending.label },
    { id: "running", label: StatusLabels.running.label },
    { id: "paused", label: StatusLabels.paused.label },
    { id: "completed", label: StatusLabels.completed.label },
    { id: "terminated", label: StatusLabels.terminated.label },
  ];

  const TypeFilters = [
    { id: "all", label: "全部类型" },
    { id: "score", label: "灵光积分" },
    { id: "multiplier", label: "挂机倍率" },
    { id: "chest", label: "宝箱" },
  ];

  let createTaskType = "score";
  const taskDefaults = {
    scoreRate: 7000,
    multiplier: 1.0,
    initialMultiplier: 1.0,
  };
  const COMPLETED_GROUP_KEYWORDS = ["g-completed", "已完成"];
  let groupLoadPromise = null;

  async function loadUserOptions() {
    try {
      const resp = await window.ConsoleShared.apiFetch("/api/users/options");
      if (!resp.ok) throw new Error(`加载用户列表失败 ${resp.status}`);
      userOptions = await resp.json();
    } catch (err) {
      console.warn("加载用户列表失败，使用本地候选项降级", err);
      userOptions = collectUserCandidates().map((name, idx) => ({
        id: idx + 1,
        username: name,
        display_name: "",
      }));
    }
  }

  async function ensureUserOptionsLoaded() {
    if (userOptions.length) return userOptions;
    if (!userLoadPromise) {
      userLoadPromise = loadUserOptions().finally(() => {
        userLoadPromise = null;
      });
    }
    await userLoadPromise;
    return userOptions;
  }

  async function loadDeviceOptions(keyword = "") {
    const key = `${keyword.trim().toLowerCase()}|idle`;
    let list = [];
    try {
      const query = keyword ? `?q=${encodeURIComponent(keyword)}&idle_only=true` : "?idle_only=true";
      const resp = await apiFetch(`/api/devices/options${query}`);
      if (!resp.ok) throw new Error(`加载设备失败 ${resp.status}`);
      list = await resp.json();
    } catch (err) {
      console.warn("加载设备列表失败，使用本地任务中的设备ID降级", err);
      const fallbackIds = Array.from(new Set(taskState.tasks.map((t) => t.device_id).filter(Boolean)));
      list = fallbackIds.map((id, idx) => ({ id: idx + 1, device_id: id, status: "idle" }));
    }
    deviceOptionsCache.set(key, list);
    return list;
  }

  async function ensureDeviceOptions(keyword = "") {
    const key = keyword.trim().toLowerCase();
    if (deviceOptionsCache.has(key)) return deviceOptionsCache.get(key);

    if (!deviceLoadPromises.has(key)) {
      deviceLoadPromises.set(
        key,
        loadDeviceOptions(key).finally(() => {
          deviceLoadPromises.delete(key);
        }),
      );
    }
    const list = await deviceLoadPromises.get(key);
    return list || [];
  }

  function fmtDate(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
  }

  function secondsToDisplay(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return "0秒";
    const total = Math.max(Math.floor(seconds), 0);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const parts = [];
    if (h) parts.push(`${h}小时`);
    if (m || h) parts.push(`${m}分`);
    parts.push(`${s}秒`);
    return parts.join("");
  }

  function formatInteger(value, fallback = 0) {
    if (!Number.isFinite(value)) return fallback;
    return Math.round(value).toLocaleString();
  }

  function normalizeApiTask(apiTask) {
    if (!apiTask) return null;
    const base = {
      id: apiTask.id,
      name: apiTask.name,
      task_type: apiTask.task_type,
      status: apiTask.status,
      group_id: String(apiTask.group_id),
      device_id: apiTask.device_id,
      owner: currentUser?.username || apiTask.created_by,
      start_time: apiTask.start_time,
      end_time: apiTask.end_time,
      updated_at: apiTask.updated_at,
      paused_seconds: 0,
      paused_at: null,
    };
    if (apiTask.task_type === "score") {
      base.score = {
        point_rate: apiTask.point_rate,
        target_points: apiTask.target_points,
        current_points: apiTask.current_points,
      };
    }
    if (apiTask.task_type === "multiplier") {
      base.multiplier = {
        duration_hours: apiTask.duration_hours,
        initial_multiplier: apiTask.initial_multiplier,
        current_multiplier: apiTask.current_multiplier,
      };
    }
    if (apiTask.task_type === "chest") {
      base.chest = {
        duration_hours: apiTask.duration_hours,
      };
    }
    return base;
  }

  function isOwnedGroup(group) {
    if (!group) return false;
    return (group.owner_username || group.owner) === currentUser?.username;
  }

  function ownedGroups() {
    return (taskState.groups || []).filter((g) => isOwnedGroup(g));
  }

  function toDateOrNow(value, now = new Date()) {
    const d = value ? new Date(value) : null;
    return d && !Number.isNaN(d.getTime()) ? d : now;
  }

  function calculatePausedSeconds(task, now = new Date()) {
    const basePaused = Number(task.paused_seconds || 0);
    if (task.status !== "paused") return Math.max(basePaused, 0);
    const pausedAt = task.paused_at ? new Date(task.paused_at) : null;
    if (!pausedAt || Number.isNaN(pausedAt.getTime())) return Math.max(basePaused, 0);
    const extra = Math.max(Math.floor((now.getTime() - pausedAt.getTime()) / 1000), 0);
    return Math.max(basePaused + extra, 0);
  }

  function calculationAnchor(task, now = new Date()) {
    if (["completed", "terminated"].includes(task.status)) {
      if (task.end_time) return toDateOrNow(task.end_time, now);
      if (task.updated_at) return toDateOrNow(task.updated_at, now);
    }
    return now;
  }

  function elapsedActiveSeconds(task, now = new Date()) {
    if (task.status === "pending") return 0;
    const start = toDateOrNow(task.start_time, now);
    const anchor = calculationAnchor(task, now);
    const elapsed = Math.max(Math.floor((anchor.getTime() - start.getTime()) / 1000), 0);
    const paused = calculatePausedSeconds(task, anchor);
    return Math.max(elapsed - paused, 0);
  }

  function ensureDefaultGroups() {
    // 仅在本地无分组时创建当前用户的默认分组，避免为其他用户重复注入
    if (taskState.groups?.length) return;
    const defaults = [
      { id: "g-default", name: "未分组", description: "默认分组，删除分组时任务会回收至此" },
      { id: "g-completed", name: "已完成", description: "终止/完成任务归档区" },
    ];
    defaults.forEach((item) => {
      const exists = taskState.groups.some((g) => g.id === item.id);
      if (!exists) {
        taskState.groups.unshift({
          ...item,
          is_default: true,
          owner: currentUser?.username || "system",
          owner_username: currentUser?.username || "system",
          owner_display_name: currentUser?.display_name || currentUser?.username || "system",
          accessors: [],
        });
      }
    });
  }

  function saveStateAndRender() {
    saveTaskState(taskState);
    renderGroups();
    renderOwnerFilter();
    renderStatusFilter();
    renderTypeFilter();
    renderTasks();
  }

  function computeScoreMeta(task, now = new Date()) {
    const detail = task.score || {};
    const target = Number(detail.target_points || 0);
    const baseCurrent = Number(detail.current_points || 0);
    const rate = Number(detail.point_rate || 0) || 7000;
    const ratePerSecond = rate / 3600;
    const activeSeconds = elapsedActiveSeconds(task, now);
    const gained = ratePerSecond > 0 ? ratePerSecond * activeSeconds : 0;
    const current = Math.min(target || Infinity, baseCurrent + gained);
    const remainingPoints = Math.max(target - current, 0);
    const remainingSeconds = ratePerSecond > 0 ? Math.ceil(remainingPoints / ratePerSecond) : 0;
    const end = new Date(now.getTime() + remainingSeconds * 1000);
    return {
      target,
      current,
      rate,
      remainingSeconds,
      end,
    };
  }

  function computeMultiplierMeta(task, now = new Date()) {
    const detail = task.multiplier || {};
    const duration = Number(detail.duration_hours || 0);
    const durationSeconds = duration * 3600;
    const activeSeconds = elapsedActiveSeconds(task, now);
    const remainingSeconds = Math.max(durationSeconds - activeSeconds, 0);
    const end = new Date(now.getTime() + remainingSeconds * 1000);
    const initialMultiplier = Number(detail.initial_multiplier ?? detail.current_multiplier ?? 1);
    const growthPerSecond = Number(detail.current_multiplier ?? 0);
    const currentMultiplier = initialMultiplier + activeSeconds * growthPerSecond;
    return { duration, end, remainingSeconds, currentMultiplier, initialMultiplier, growthPerSecond };
  }

  function computeChestMeta(task, now = new Date()) {
    const detail = task.chest || {};
    const duration = Number(detail.duration_hours || 0);
    const durationSeconds = duration * 3600;
    const activeSeconds = elapsedActiveSeconds(task, now);
    const remainingSeconds = Math.max(durationSeconds - activeSeconds, 0);
    const end = new Date(now.getTime() + remainingSeconds * 1000);
    return { duration, end, remainingSeconds };
  }

  function renderGroups() {
    ensureDefaultGroups();
    const list = document.querySelector("#group-list");
    if (!list) return;
    const groups = taskState.groups || [];
    const allBtn = document.createElement("button");
    allBtn.className = `group-item ${currentGroupId === "all" ? "active" : ""}`;
    allBtn.innerHTML = `<div><strong>全部任务</strong><p class="muted">查看所有分组</p></div><span class="badge">${taskState.tasks.length}</span>`;
    allBtn.addEventListener("click", () => {
      currentGroupId = "all";
      renderTasks();
    });
    list.innerHTML = "";
    list.appendChild(allBtn);

    groups.forEach((group) => {
      const count = taskState.tasks.filter((t) => t.group_id === group.id).length;
      const button = document.createElement("button");
      button.className = `group-item ${currentGroupId === group.id ? "active" : ""}`;
      const allowDelete = isOwnedGroup(group) && !group.is_default;
      button.innerHTML = `
        <div>
          <strong>${group.name}</strong>
          <p class="muted">${group.description || "无描述"}</p>
          <p class="muted mini">所属：${formatOwnerDisplay(group)}</p>
        </div>
        <div class="group-actions">
          <span class="badge">${count}</span>
          <button class="ghost mini" data-manage>管理</button>
          ${allowDelete ? '<button class="ghost mini danger" data-delete>删除</button>' : ""}
        </div>
      `;
      button.addEventListener("click", (evt) => {
        if (evt.target?.dataset?.delete !== undefined || evt.target?.dataset?.manage !== undefined) return;
        currentGroupId = group.id;
        renderGroups();
        renderTasks();
      });
      button.querySelector("[data-manage]")?.addEventListener("click", (evt) => {
        evt.stopPropagation();
        openGroupManageModal(group).catch((err) => console.warn("打开分组管理失败", err));
      });
      if (allowDelete) {
        button.querySelector("[data-delete]")?.addEventListener("click", (evt) => {
          evt.stopPropagation();
          if (!confirm(`删除分组「${group.name}」，组内任务将移至「未分组」`)) return;
          deleteGroup(group).catch((err) => console.warn("删除分组失败", err));
        });
      }
      list.appendChild(button);
    });
  }

  async function reloadGroupsFromServer() {
    if (groupLoadPromise) return groupLoadPromise;
    groupLoadPromise = (async () => {
      try {
        const resp = await apiFetch("/api/task-groups");
        if (!resp.ok) throw new Error(`加载分组失败 ${resp.status}`);
        const data = await resp.json();
        const mapped = (data || []).map((g) => ({
          id: String(g.id),
          name: g.name,
          description: g.description || "",
          is_default: Boolean(g.is_default),
          owner: g.owner_username || g.owner || g.created_by || "",
          owner_username: g.owner_username || g.owner || g.created_by || "",
          owner_display_name: g.owner_display_name || g.owner || "",
        }));
        taskState.groups = mapped;
        saveTaskState(taskState);
        renderGroups();
        renderTasks();
      } catch (err) {
        console.warn("从服务端加载分组失败，使用本地数据", err);
        renderGroups();
      } finally {
        groupLoadPromise = null;
      }
    })();
    return groupLoadPromise;
  }

  function renderTypeFilter() {
    const wrapper = document.querySelector("#type-filter");
    if (!wrapper) return;
    wrapper.innerHTML = "";
    TypeFilters.forEach((type) => {
      const pill = document.createElement("button");
      pill.className = `pill ${currentType === type.id ? "active" : ""}`;
      pill.textContent = type.label;
      pill.addEventListener("click", () => {
        currentType = type.id;
        renderTasks();
      });
      wrapper.appendChild(pill);
    });
  }

  function renderStatusFilter() {
    const wrapper = document.querySelector("#status-filter");
    if (!wrapper) return;
    wrapper.innerHTML = "";
    StatusFilters.forEach((item) => {
      const pill = document.createElement("button");
      pill.className = `pill ${currentStatus === item.id ? "active" : ""}`;
      pill.textContent = item.label;
      pill.addEventListener("click", () => {
        currentStatus = item.id;
        renderTasks();
      });
      wrapper.appendChild(pill);
    });
  }

  function renderOwnerFilter() {
    const field = document.querySelector("#owner-filter-field");
    const select = document.querySelector("#owner-filter");
    if (!field || !select) return;
    const isAdmin = ["admin", "super_admin"].includes(currentUser.role);
    field.style.display = isAdmin ? "flex" : "none";
    const owners = Array.from(new Set(taskState.groups.map((g) => g.owner_username || g.owner).filter(Boolean)));
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

  function formatOwnerDisplay(group) {
    return group.owner_display_name || group.owner_username || group.owner || "未指定";
  }

  function typeChip(type) {
    return `<span class="pill muted">${TypeLabels[type] || type}</span>`;
  }

  function sortTasks(tasks) {
    const copied = [...tasks];
    copied.sort((a, b) => {
      if (a.status === "terminated" && b.status !== "terminated") return 1;
      if (a.status !== "terminated" && b.status === "terminated") return -1;
      return 0;
    });
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
    if (currentStatus !== "all") {
      tasks = tasks.filter((t) => t.status === currentStatus);
    }
    if (currentType !== "all") {
      tasks = tasks.filter((t) => t.task_type === currentType);
    }
    if (currentOwner !== "all") {
      tasks = tasks.filter((t) => t.owner === currentOwner);
    }
    return sortTasks(tasks);
  }

  function deviceLine(task) {
    if (task.status === "terminated") return "";
    return task.device_id ? `<span class="badge subtle">设备：${task.device_id}</span>` : `<span class="badge warning">待绑定设备</span>`;
  }

  function renderTaskFooter(task) {
    return `
      <div class="task-actions">
        <button class="ghost mini" data-action="start-pause">${task.status === "running" ? "暂停" : "开始"}</button>
        <button class="ghost mini" data-action="patch">${task.task_type === "score" ? "补暂停/积分" : "补暂停"}</button>
        <button class="ghost mini" data-action="edit">修改</button>
        <button class="ghost mini" data-action="move">移动分组</button>
        <button class="ghost mini danger" data-action="terminate">终止</button>
      </div>
    `;
  }

  function renderTaskBody(task) {
    const now = new Date();
    if (task.task_type === "score") {
      const meta = computeScoreMeta(task, now);
      return `
        <div class="task-meta">
          <div><span class="muted mini">当前积分</span><strong data-field="current-points" data-task-id="${task.id}">${formatInteger(meta.current)}</strong></div>
          <div><span class="muted mini">目标积分</span><strong>${formatInteger(meta.target)}</strong></div>
          <div><span class="muted mini">积分速率</span><strong>${meta.rate}/小时</strong></div>
          <div><span class="muted mini">剩余时间</span><strong data-field="remaining-time" data-task-id="${task.id}">${secondsToDisplay(meta.remainingSeconds)}</strong></div>
          <div><span class="muted mini">预计结束</span><strong data-field="end-time" data-task-id="${task.id}">${fmtDate(meta.end)}</strong></div>
        </div>
      `;
    }
    if (task.task_type === "multiplier") {
      const meta = computeMultiplierMeta(task, now);
      return `
        <div class="task-meta">
          <div><span class="muted mini">时长</span><strong>${meta.duration}小时</strong></div>
          <div><span class="muted mini">剩余时间</span><strong data-field="remaining-time" data-task-id="${task.id}">${secondsToDisplay(meta.remainingSeconds)}</strong></div>
          <div><span class="muted mini">截至时间</span><strong data-field="end-time" data-task-id="${task.id}">${fmtDate(meta.end)}</strong></div>
          <div><span class="muted mini">初始倍率</span><strong>${meta.initialMultiplier.toFixed(2)}</strong></div>
          <div><span class="muted mini">倍率增长</span><strong>${meta.growthPerSecond.toFixed(2)}/秒</strong></div>
          <div><span class="muted mini">当前倍率</span><strong data-field="current-multiplier" data-task-id="${task.id}">${meta.currentMultiplier.toFixed(2)}</strong></div>
        </div>
      `;
    }
    if (task.task_type === "chest") {
      const meta = computeChestMeta(task, now);
      return `
        <div class="task-meta">
          <div><span class="muted mini">时长</span><strong>${meta.duration}小时</strong></div>
          <div><span class="muted mini">剩余时间</span><strong data-field="remaining-time" data-task-id="${task.id}">${secondsToDisplay(meta.remainingSeconds)}</strong></div>
          <div><span class="muted mini">截至时间</span><strong data-field="end-time" data-task-id="${task.id}">${fmtDate(meta.end)}</strong></div>
        </div>
      `;
    }
    return "";
  }

  function updateRealtimeFields() {
    const now = new Date();
    const tasks = filteredTasks();
    tasks.forEach((task) => {
      const setText = (field, value) => {
        const el = document.querySelector(`[data-field="${field}"][data-task-id="${task.id}"]`);
        if (el) el.textContent = value;
      };
      if (task.task_type === "score") {
        const meta = computeScoreMeta(task, now);
        setText("current-points", formatInteger(meta.current));
        setText("remaining-time", secondsToDisplay(meta.remainingSeconds));
        setText("end-time", fmtDate(meta.end));
      }
      if (task.task_type === "multiplier") {
        const meta = computeMultiplierMeta(task, now);
        setText("remaining-time", secondsToDisplay(meta.remainingSeconds));
        setText("end-time", fmtDate(meta.end));
        setText("current-multiplier", meta.currentMultiplier.toFixed(2));
      }
      if (task.task_type === "chest") {
        const meta = computeChestMeta(task, now);
        setText("remaining-time", secondsToDisplay(meta.remainingSeconds));
        setText("end-time", fmtDate(meta.end));
      }
    });
  }

  function startRealtimeTicker() {
    if (realtimeTimer) clearInterval(realtimeTimer);
    realtimeTimer = setInterval(updateRealtimeFields, 1000);
  }

  function renderTasks() {
    const grid = document.querySelector("#task-grid");
    if (!grid) return;
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
            <p class="muted mini">任务ID：${task.id}</p>
          </div>
          <div class="task-device">${deviceLine(task)}</div>
        </div>
        ${renderTaskBody(task)}
        ${renderTaskFooter(task)}
      `;

      card.querySelectorAll("[data-action]").forEach((btn) => {
        btn.addEventListener("click", async (evt) => {
          evt.stopPropagation();
          await handleAction(task, btn.dataset.action);
        });
      });

      grid.appendChild(card);
    });
    updateRealtimeFields();
  }

  function getGroupName(id) {
    return taskState.groups.find((g) => g.id === id)?.name || "未知分组";
  }

  function bindDeviceSuggest(inputSelector, listSelector) {
    const input = document.querySelector(inputSelector);
    const list = document.querySelector(listSelector);
    if (!input || !list) return;
    const render = async () => {
      const keyword = input.value.trim();
      const options = await ensureDeviceOptions(keyword);
      const filtered = options.filter((item) =>
        (item.device_id || "").toLowerCase().includes(keyword.toLowerCase()),
      );
      const display = filtered.length ? filtered : options;
      if (!display.length) {
        list.classList.remove("active");
        list.innerHTML = "";
        return;
      }
      list.innerHTML = display
        .slice(0, 8)
        .map((item) => `<div class="suggestion-item" data-id="${item.device_id}">${item.device_id}</div>`)
        .join("");
      list.classList.add("active");
    };
    input.addEventListener("input", render);
    input.addEventListener("focus", render);
    input.addEventListener("blur", () => setTimeout(() => list.classList.remove("active"), 150));
    list.addEventListener("click", (evt) => {
      const id = evt.target?.dataset?.id;
      if (id) {
        input.value = id;
        list.classList.remove("active");
      }
    });
  }

  function getKnownDevices() {
    const seen = new Map();
    deviceOptionsCache.forEach((list) => {
      (list || []).forEach((item) => {
        if (item?.device_id === undefined || item?.device_id === null) return;
        const key = String(item.device_id).toLowerCase();
        if (!seen.has(key)) {
          seen.set(key, item);
        }
      });
    });
    return Array.from(seen.values());
  }

  async function validateDeviceInput(rawValue, { allowEmpty = true, currentDeviceId = null } = {}) {
    const trimmed = (rawValue || "").trim();
    if (!trimmed) {
      if (!allowEmpty) {
        alert("请先输入设备ID");
        return { error: true };
      }
      return { value: null, record: null };
    }
    await ensureDeviceOptions(trimmed);
    const match = getKnownDevices().find(
      (item) => String(item.device_id).toLowerCase() === trimmed.toLowerCase(),
    );
    if (!match) {
      alert("设备不存在，请从下拉建议中选择已有设备");
      return { error: true };
    }
    if (match.status && match.status !== "idle" && String(currentDeviceId || "").toLowerCase() !== trimmed.toLowerCase()) {
      alert("设备当前不可用，请选择空闲设备");
      return { error: true };
    }
    return { value: match.device_id, record: match, device_pk: match.id };
  }

  async function resolveDeviceRecord(deviceId) {
    const trimmed = (deviceId || "").trim();
    if (!trimmed) return null;
    await ensureDeviceOptions(trimmed);
    return (
      getKnownDevices().find(
        (item) => String(item.device_id).toLowerCase() === trimmed.toLowerCase(),
      ) || null
    );
  }

  async function updateDeviceStatus(deviceRecord, status) {
    if (!deviceRecord?.id) return;
    const resp = await apiFetch(`/api/devices/${deviceRecord.id}`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.detail || "更新设备状态失败");
    }
  }

  async function syncDeviceBinding(nextDeviceRecord, prevDeviceId) {
    // 设备状态由后端在绑定/解绑时统一维护，这里避免再次触发需要管理权限的设备状态更新
    return { nextDeviceRecord, prevDeviceId };
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

  function setSelectedTask(task) {
    selectedTaskId = task?.id ?? null;
    return selectedTaskId;
  }

  function getSelectedTask() {
    return taskState.tasks.find((t) => t.id === selectedTaskId);
  }

  function setSelectedGroup(group) {
    selectedGroupId = group?.id ?? null;
    return selectedGroupId;
  }

  function getSelectedGroup() {
    return taskState.groups.find((g) => g.id === selectedGroupId);
  }

  function openPatchModal(task) {
    setSelectedTask(task);
    document.querySelector("#patch-task-name").textContent = `当前任务：${task.name}`;
    document.querySelector("#patch-points").value = "";
    document.querySelector("#patch-hours").value = "";
    document.querySelector("#patch-points-field").style.display = task.task_type === "score" ? "block" : "none";
    openModal("#patch-modal");
  }

  function openEditModal(task) {
    setSelectedTask(task);
    document.querySelector("#edit-task-name").textContent = `当前任务：${task.name}`;
    document.querySelector("#edit-device").value = task.device_id || "";
    updateTypeSections("#edit-modal", task.task_type);
    if (task.task_type === "score") {
      document.querySelector("#edit-score-target").value = task.score?.target_points || 0;
      document.querySelector("#edit-score-rate").value = task.score?.point_rate || 7000;
    }
    if (task.task_type === "multiplier") {
      document.querySelector("#edit-multiplier-hours").value = task.multiplier?.duration_hours || 0;
      document.querySelector("#edit-multiplier-initial").value = task.multiplier?.initial_multiplier ?? 1.0;
      document.querySelector("#edit-multiplier-current").value = task.multiplier?.current_multiplier || 1.0;
    }
    if (task.task_type === "chest") {
      document.querySelector("#edit-chest-hours").value = task.chest?.duration_hours || 0;
    }
    openModal("#edit-modal");
  }

  function openMoveModal(task) {
    setSelectedTask(task);
    const select = document.querySelector("#move-group-select");
    document.querySelector("#move-task-name").textContent = `当前任务：${task.name}`;
    if (select) {
      select.innerHTML = ownedGroups()
        .map((g) => `<option value="${g.id}" ${g.id === task.group_id ? "selected" : ""}>${g.name}</option>`)
        .join("");
    }
    openModal("#move-modal");
  }

  async function openGroupManageModal(group) {
    setSelectedGroup(group);
    document.querySelector("#manage-group-name").value = group.name || "";
    document.querySelector("#manage-group-desc").value = group.description || "";
    manageAccessSelection = (group.accessors || [])
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id));
    await ensureUserOptionsLoaded();
    manageAccessSelection = manageAccessSelection.filter((id) => filteredUserOptions().some((u) => Number(u.id) === id));
    renderAccessSummary();
    openModal("#group-manage-modal");
  }

  function applyPatch(task, addPoints, addHours) {
    if (!(addPoints > 0) && !(addHours > 0)) return;
    const detailMsg = [];
    if (task.task_type === "score" && addPoints > 0) {
      task.score = task.score || {};
      task.score.current_points = Number(task.score.current_points || 0) + addPoints;
      detailMsg.push(`补充积分 ${addPoints}`);
    }
    if (addHours > 0) {
      if (task.task_type === "multiplier") {
        task.multiplier = task.multiplier || {};
        task.multiplier.duration_hours = Number(task.multiplier.duration_hours || 0) + addHours;
      }
      if (task.task_type === "chest") {
        task.chest = task.chest || {};
        task.chest.duration_hours = Number(task.chest.duration_hours || 0) + addHours;
      }
      detailMsg.push(`补充时长 ${addHours} 小时`);
    }
    if (detailMsg.length) {
      logAction(task, "补暂停", detailMsg.join("；"));
    }
    task.updated_at = new Date().toISOString();
    saveStateAndRender();
  }

  async function applyEdit(task, payload) {
    const changes = [];
    const prevDevice = task.device_id;
    if (payload.device !== undefined) {
      task.device_id = payload.device || null;
      if (payload.device !== prevDevice) {
        changes.push(payload.device ? `绑定设备 ${payload.device}` : "解绑设备");
        logAction(task, payload.device ? "更换设备" : "解绑设备", changes.at(-1), "device");
        await syncDeviceBinding(payload.deviceRecord, prevDevice);
      }
    }
    if (task.task_type === "score" && payload.score) {
      if (payload.score.target_points !== undefined) {
        task.score.target_points = payload.score.target_points;
        changes.push(`目标积分调整为 ${payload.score.target_points}`);
      }
      if (payload.score.point_rate !== undefined) {
        task.score.point_rate = payload.score.point_rate;
        changes.push(`积分速率调整为 ${payload.score.point_rate}`);
      }
    }
    if (task.task_type === "multiplier" && payload.multiplier) {
      if (payload.multiplier.duration_hours !== undefined) {
        task.multiplier.duration_hours = payload.multiplier.duration_hours;
        changes.push(`时长调整为 ${payload.multiplier.duration_hours} 小时`);
      }
      if (payload.multiplier.initial_multiplier !== undefined) {
        task.multiplier.initial_multiplier = payload.multiplier.initial_multiplier;
        changes.push(`初始倍率调整为 ${payload.multiplier.initial_multiplier}`);
      }
      if (payload.multiplier.current_multiplier !== undefined) {
        task.multiplier.current_multiplier = payload.multiplier.current_multiplier;
        changes.push(`当前倍率调整为 ${payload.multiplier.current_multiplier}`);
      }
    }
    if (task.task_type === "chest" && payload.chest) {
      if (payload.chest.duration_hours !== undefined) {
        task.chest.duration_hours = payload.chest.duration_hours;
        changes.push(`时长调整为 ${payload.chest.duration_hours} 小时`);
      }
    }
    if (changes.length) {
      logAction(task, "修改", changes.join("；"));
    }
    task.updated_at = new Date().toISOString();
    saveStateAndRender();
  }

  function applyMove(task, targetGroupId) {
    const target = taskState.groups.find((g) => g.id === targetGroupId);
    if (!target) return;
    if (!isOwnedGroup(target)) {
      alert("只能将任务移动到自己的分组");
      return;
    }
    task.group_id = targetGroupId;
    logAction(task, "移动分组", `移动至分组「${target.name}」`);
    task.updated_at = new Date().toISOString();
    saveStateAndRender();
  }

  function collectUserCandidates() {
    const names = new Set();
    if (currentUser?.username) names.add(currentUser.username);
    taskState.groups.forEach((g) => {
      if (g.owner) names.add(g.owner);
      (g.accessors || []).forEach((n) => names.add(n));
    });
    taskState.tasks.forEach((t) => {
      if (t.owner) names.add(t.owner);
    });
    return Array.from(names).sort();
  }

  function fallbackUserOptions() {
    return collectUserCandidates().map((name, idx) => ({
      id: idx + 1,
      username: name,
      display_name: "",
    }));
  }

  function filteredUserOptions() {
    const base = userOptions.length ? userOptions : fallbackUserOptions();
    return base.filter((user) => user.username !== currentUser?.username);
  }

  function formatUserLabel(user) {
    return user.display_name ? `${user.display_name}（${user.username}）` : user.username;
  }

  function renderAccessSummary() {
    const container = document.querySelector("#manage-access-current");
    if (!container) return;
    const options = filteredUserOptions();
    const selectedUsers = options.filter((u) => manageAccessSelection.includes(Number(u.id)));
    if (!selectedUsers.length) {
      container.innerHTML = `<p class="muted mini">当前仅自己可访问</p>`;
      return;
    }
    container.innerHTML = selectedUsers
      .map((user) => `<span class="pill muted">${formatUserLabel(user)}</span>`)
      .join("");
  }

  function renderAccessModalList(keyword = "") {
    const list = document.querySelector("#access-modal-list");
    if (!list) return;
    const keywordLower = keyword.trim().toLowerCase();
    const options = filteredUserOptions().filter((user) => {
      if (!keywordLower) return true;
      return (
        user.username.toLowerCase().includes(keywordLower) ||
        (user.display_name || "").toLowerCase().includes(keywordLower)
      );
    });

    if (!options.length) {
      list.innerHTML = `<p class="muted mini">暂无可选成员</p>`;
      return;
    }

    list.innerHTML = options
      .slice(0, 50)
      .map(
        (user) => `
        <button type="button" class="pill selectable ${manageAccessSelection.includes(Number(user.id)) ? "active" : ""}" data-id="${user.id}">
          ${formatUserLabel(user)}
        </button>`
      )
      .join("");

    list.querySelectorAll("[data-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.dataset.id);
        if (!Number.isFinite(id)) return;
        if (manageAccessSelection.includes(id)) {
          manageAccessSelection = manageAccessSelection.filter((n) => n !== id);
        } else {
          manageAccessSelection.push(id);
        }
        renderAccessModalList(keyword);
      });
    });
  }

  async function handleAction(task, action) {
    const now = new Date().toISOString();
    if (action === "start-pause") {
      if (task.status === "running") {
        task.status = "paused";
        task.paused_at = now;
        logAction(task, "暂停任务", `暂停任务「${task.name}」`);
      } else {
        if (task.status === "paused" && task.paused_at) {
          const pausedAt = new Date(task.paused_at);
          if (!Number.isNaN(pausedAt.getTime())) {
            const pausedSeconds = Math.max(Math.floor((new Date(now).getTime() - pausedAt.getTime()) / 1000), 0);
            task.paused_seconds = Number(task.paused_seconds || 0) + pausedSeconds;
          }
        }
        task.paused_at = null;
        task.status = "running";
        task.start_time = task.start_time || now;
        logAction(task, "开始任务", `开始/恢复任务「${task.name}」`);
      }
    }

    if (action === "patch") {
      openPatchModal(task);
      return;
    }

    if (action === "edit") {
      openEditModal(task);
      return;
    }

    if (action === "move") {
      openMoveModal(task);
      return;
    }

    if (action === "terminate") {
      if (confirm("终止任务将释放设备，确定终止？")) {
        const prevDevice = task.device_id;
        task.status = "terminated";
        task.group_id = taskState.groups.find((g) => g.id === "g-completed") ? "g-completed" : task.group_id;
        logAction(task, "终止任务", `终止任务「${task.name}」并释放设备 ${task.device_id || "未绑定"}`, "device");
        task.device_id = null;
        task.paused_at = null;
        await syncDeviceBinding(null, prevDevice);
      }
    }

    task.updated_at = now;
    saveStateAndRender();
  }

  async function deleteGroup(group) {
    if (!group || !isOwnedGroup(group)) {
      alert("只能删除自己创建的分组");
      return;
    }
    const groupPk = Number(group.id);
    if (!Number.isFinite(groupPk)) {
      alert("分组标识无效，无法删除");
      return;
    }
    try {
      const resp = await apiFetch(`/api/task-groups/${groupPk}`, { method: "DELETE" });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.detail || `删除分组失败 ${resp.status}`);
      }
      ensureDefaultGroups();
      const defaultGroup = taskState.groups.find((g) => g.id === "g-default" && g.is_default) || taskState.groups[0];
      taskState.tasks = taskState.tasks.map((task) =>
        task.group_id === group.id ? { ...task, group_id: defaultGroup.id } : task,
      );
      taskState.groups = taskState.groups.filter((g) => g.id !== group.id);
      saveStateAndRender();
      await reloadGroupsFromServer();
    } catch (err) {
      console.warn("删除分组失败", err);
      alert(err.message || "删除分组失败，请稍后重试");
    }
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
    createTaskType = "score";
    document.querySelector("#task-name").value = "";
    document.querySelector("#task-device").value = "";
    document.querySelector("#task-score-current").value = 0;
    document.querySelector("#task-score-rate").value = taskDefaults.scoreRate;
    document.querySelector("#task-score-target").value = 360000;
    document.querySelector("#task-multiplier-duration").value = 12;
    document.querySelector("#task-multiplier-current").value = taskDefaults.multiplier;
    document.querySelector("#task-multiplier-initial").value = taskDefaults.initialMultiplier;
    document.querySelector("#task-chest-duration").value = 12;
    document.querySelector("#task-start").value = new Date().toISOString().slice(0, 16);
    updateTypeSections("#task-modal", createTaskType);
    setCreateTypeButtons(createTaskType);
  }

  function updateTypeSections(containerSelector, type) {
    document.querySelectorAll(`${containerSelector} .type-section`).forEach((section) => {
      section.style.display = section.dataset.type === type ? "block" : "none";
    });
  }

  function populateGroupSelects() {
    const select = document.querySelector("#task-group");
    if (!select) return;
    const options = ownedGroups().filter((g) => !isCompletedGroup(g));
    select.innerHTML = options.map((g) => `<option value="${g.id}">${g.name}</option>`).join("");
  }

  function setCreateTypeButtons(type) {
    document.querySelectorAll("#task-type-buttons .pill").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.type === type);
    });
  }

  async function createGroup() {
    const name = document.querySelector("#group-name").value.trim();
    const desc = document.querySelector("#group-desc").value.trim();
    if (!name) {
      alert("请输入分组名称");
      return;
    }
    try {
      const resp = await apiFetch("/api/task-groups", {
        method: "POST",
        body: JSON.stringify({ name, description: desc }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.detail || `创建分组失败 ${resp.status}`);
      }
      const data = await resp.json();
      const newGroup = {
        id: String(data.id ?? `g-${Date.now()}`),
        name: data.name || name,
        description: data.description ?? desc,
        owner: currentUser.username,
        owner_username: currentUser.username,
        is_default: Boolean(data.is_default),
      };
      taskState.groups.push(newGroup);
      closeModal("#group-modal");
      saveTaskState(taskState);
      await reloadGroupsFromServer();
    } catch (err) {
      console.warn("创建分组失败", err);
      alert(err.message || "创建分组失败，请稍后重试");
    }
  }

  async function createTask() {
    const name = document.querySelector("#task-name").value.trim();
    const type = createTaskType;
    const groupId = document.querySelector("#task-group").value;
    const deviceInput = document.querySelector("#task-device").value;
    const validatedDevice = await validateDeviceInput(deviceInput, { allowEmpty: false });
    if (validatedDevice.error) return;
    const targetGroup = taskState.groups.find((g) => g.id === groupId);
    if (isCompletedGroup(targetGroup)) {
      alert("已完成分组不可选择，请选择其他分组");
      return;
    }
    if (!isOwnedGroup(targetGroup)) {
      alert("只能在自己的分组下创建任务");
      return;
    }
    const start = document.querySelector("#task-start").value || new Date().toISOString().slice(0, 16);
    if (!name) return alert("请输入任务名称");
    const payload = {
      name,
      task_type: type,
      group_id: Number(groupId),
      device_id: validatedDevice.device_pk,
      start_time: new Date(start).toISOString(),
    };
    if (type === "score") {
      payload.score_point_rate = Number(document.querySelector("#task-score-rate").value || 7000);
      payload.score_target = Number(document.querySelector("#task-score-target").value || 360000);
    }
    if (type === "multiplier") {
      payload.multiplier_hours = Number(document.querySelector("#task-multiplier-duration").value || 0);
      payload.multiplier_initial = Number(document.querySelector("#task-multiplier-initial").value || 1.0);
      payload.multiplier_current = Number(document.querySelector("#task-multiplier-current").value || 1.0);
    }
    if (type === "chest") {
      payload.chest_hours = Number(document.querySelector("#task-chest-duration").value || 0);
    }

    try {
      const resp = await apiFetch("/api/tasks", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.detail || `创建任务失败 ${resp.status}`);
      }
      const created = await resp.json();
      const newTask = normalizeApiTask(created);
      taskState.tasks.push(newTask);
      logAction(newTask, "创建任务", `创建${TypeLabels[type]}任务「${name}」`);
      closeModal("#task-modal");
      saveStateAndRender();
    } catch (err) {
      console.warn("创建任务失败", err);
      alert(err.message || "创建任务失败，请稍后重试");
    }
  }

  function isCompletedGroup(group) {
    if (!group) return false;
    return COMPLETED_GROUP_KEYWORDS.includes(group.id) || COMPLETED_GROUP_KEYWORDS.includes(group.name);
  }

  function bindQuickAddButtons() {
    document.querySelectorAll("[data-target-input][data-increment]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = document.querySelector(`#${btn.dataset.targetInput}`);
        if (!target) return;
        const increment = Number(btn.dataset.increment || 0);
        const current = Number(target.value || 0);
        target.value = current + increment;
      });
    });
  }

  async function fetchTaskDefaults() {
    try {
      const resp = await apiFetch("/api/tasks/defaults");
      if (!resp.ok) throw new Error(`failed ${resp.status}`);
      const data = await resp.json();
      if (Number.isFinite(data.default_score_rate)) {
        taskDefaults.scoreRate = Number(data.default_score_rate);
      }
      if (Number.isFinite(data.default_multiplier)) {
        taskDefaults.multiplier = Number(data.default_multiplier);
      }
    } catch (err) {
      console.warn("获取任务默认配置失败，使用本地默认值", err);
    }
  }

  function bindEvents() {
    document.querySelector("#create-group-btn")?.addEventListener("click", () => {
      document.querySelector("#group-name").value = "";
      document.querySelector("#group-desc").value = "";
      openModal("#group-modal");
    });
    document.querySelector("#create-task-btn")?.addEventListener("click", () => {
      populateGroupSelects();
      resetTaskForm();
      openModal("#task-modal");
    });
    document.querySelector("#submit-group")?.addEventListener("click", createGroup);
    document.querySelector("#submit-task")?.addEventListener("click", createTask);
    document.querySelectorAll("#task-type-buttons .pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        createTaskType = btn.dataset.type;
        setCreateTypeButtons(createTaskType);
        updateTypeSections("#task-modal", createTaskType);
      });
    });
    document.querySelector("#submit-patch")?.addEventListener("click", () => {
      const task = getSelectedTask();
      if (!task) return;
      const addPoints = Number(document.querySelector("#patch-points").value || 0);
      const addHours = Number(document.querySelector("#patch-hours").value || 0);
      applyPatch(task, addPoints, addHours);
      closeModal("#patch-modal");
    });
    document.querySelector("#submit-edit")?.addEventListener("click", async () => {
      const task = getSelectedTask();
      if (!task) return;
      const validatedDevice = await validateDeviceInput(document.querySelector("#edit-device").value, {
        currentDeviceId: task.device_id,
      });
      if (validatedDevice.error) return;
      const payload = {
        device: validatedDevice.value,
        deviceRecord: validatedDevice.record,
        score: null,
        multiplier: null,
        chest: null,
      };
      if (task.task_type === "score") {
        payload.score = {
          target_points: Number(document.querySelector("#edit-score-target").value || 0),
          point_rate: Number(document.querySelector("#edit-score-rate").value || 0),
        };
      }
      if (task.task_type === "multiplier") {
        payload.multiplier = {
          duration_hours: Number(document.querySelector("#edit-multiplier-hours").value || 0),
          initial_multiplier: Number(document.querySelector("#edit-multiplier-initial").value || 1.0),
          current_multiplier: Number(document.querySelector("#edit-multiplier-current").value || 0),
        };
      }
      if (task.task_type === "chest") {
        payload.chest = { duration_hours: Number(document.querySelector("#edit-chest-hours").value || 0) };
      }
      await applyEdit(task, payload);
      closeModal("#edit-modal");
    });
    document.querySelector("#submit-move")?.addEventListener("click", () => {
      const task = getSelectedTask();
      if (!task) return;
      const target = document.querySelector("#move-group-select")?.value;
      if (target) {
        applyMove(task, target);
      }
      closeModal("#move-modal");
    });
    document.querySelector("#submit-group-manage")?.addEventListener("click", async () => {
      const group = getSelectedGroup();
      if (!group) return;
      group.name = document.querySelector("#manage-group-name").value.trim() || group.name;
      group.description = document.querySelector("#manage-group-desc").value.trim();
      group.accessors = [...new Set(manageAccessSelection)];
      group.updated_at = new Date().toISOString();
      try {
        const resp = await apiFetch(`/api/task-groups/${group.id}/managers`, {
          method: "POST",
          body: JSON.stringify({ manager_ids: group.accessors }),
        });
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          throw new Error(data.detail || `更新共享失败 ${resp.status}`);
        }
        await reloadGroupsFromServer();
        renderAccessSummary();
        closeModal("#group-manage-modal");
      } catch (err) {
        console.warn("更新分组共享失败", err);
        alert(err.message || "更新共享失败，请稍后重试");
      }
    });
    document.querySelector("#task-sort")?.addEventListener("change", (evt) => {
      currentSort = evt.target.value;
      renderTasks();
    });
    document.querySelector("#group-refresh")?.addEventListener("click", () => {
      reloadGroupsFromServer();
    });
    document.querySelector("#open-access-modal")?.addEventListener("click", async () => {
      await ensureUserOptionsLoaded();
      renderAccessModalList();
      openModal("#access-modal");
    });
    document.querySelector("#access-modal-search")?.addEventListener("input", (evt) => {
      renderAccessModalList(evt.target.value || "");
    });
    document.querySelector("#submit-access-modal")?.addEventListener("click", () => {
      renderAccessSummary();
      closeModal("#access-modal");
    });
    bindModalClose();
    bindDeviceSuggest("#task-device", "#task-device-suggest");
    bindDeviceSuggest("#edit-device", "#edit-device-suggest");
    bindQuickAddButtons();
  }

  document.addEventListener("DOMContentLoaded", async () => {
    currentUser = initConsoleShell("tasks");
    if (!currentUser) return;

    await fetchTaskDefaults();
    await ensureUserOptionsLoaded();
    await ensureDeviceOptions("");
    await reloadGroupsFromServer();
    populateGroupSelects();
    renderOwnerFilter();
    renderStatusFilter();
    renderGroups();
    renderTypeFilter();
    renderTasks();
    startRealtimeTicker();
    setCreateTypeButtons(createTaskType);
    updateTypeSections("#task-modal", createTaskType);
    bindEvents();
  });
})();
