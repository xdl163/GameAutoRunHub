(function () {
  const { initConsoleShell, loadTaskState, saveTaskState, appendTaskLog, apiFetch } = window.ConsoleShared;

  let taskState = loadTaskState();
  let currentGroupId = "all";
  let currentSort = "status";
  let currentOwner = "all";
  let currentDeviceKeyword = "";
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
  const START_TIME_OFFSET_MS = 8 * 3600 * 1000;
  const taskPagination = {
    page: 1,
    pageSize: 30,
    total: 0,
  };
  const serverSortKeys = new Set([
    "status",
    "type",
    "start_time",
    "start_time_asc",
    "start_time_desc",
    "remaining_asc",
    "remaining_desc",
  ]);

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

  function renderTaskPagination() {
    const info = document.querySelector("#task-pagination-info");
    const prev = document.querySelector("#task-prev-page");
    const next = document.querySelector("#task-next-page");
    const totalPages = Math.max(1, Math.ceil(taskPagination.total / taskPagination.pageSize));

    if (info) {
      info.textContent = `第 ${taskPagination.page} / ${totalPages} 页，共 ${taskPagination.total} 条`;
    }
    if (prev) prev.disabled = taskPagination.page <= 1;
    if (next) next.disabled = taskPagination.page >= totalPages;
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

  function parseDate(value) {
    const d = value ? new Date(value) : null;
    return d && !Number.isNaN(d.getTime()) ? d : null;
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
    const groupId = apiTask.group_id ?? apiTask.groupId;
    const deviceId = apiTask.device_identifier || apiTask.device_id || apiTask.deviceId;
    const base = {
      id: apiTask.id,
      name: apiTask.name,
      task_type: apiTask.task_type,
      status: apiTask.status,
      group_id: groupId != null ? String(groupId) : apiTask.group_id,
      device_id: deviceId,
      owner: currentUser?.username || apiTask.created_by,
      start_time: apiTask.start_time,
      end_time: apiTask.end_time,
      updated_at: apiTask.updated_at,
      paused_seconds: Number(apiTask.paused_seconds ?? apiTask.pausedSeconds ?? 0),
      paused_at: apiTask.paused_at ?? apiTask.pausedAt ?? null,
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

  function upsertTask(normalizedTask) {
    if (!normalizedTask) return;
    const idx = taskState.tasks.findIndex((t) => t.id === normalizedTask.id);
    if (idx >= 0) {
      taskState.tasks[idx] = normalizedTask;
    } else {
      taskState.tasks.push(normalizedTask);
    }
    saveStateAndRender();
    return normalizedTask;
  }

  async function requestAndUpdateTask(url, { method = "PATCH", body = null } = {}) {
    const resp = await apiFetch(url, {
      method,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.detail || `请求失败 ${resp.status}`);
    }
    const data = await resp.json();
    const updated = upsertTask(normalizeApiTask(data));
    await refreshAllData();
    return updated;
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

  function startTimeWithOffset(task, now = new Date()) {
    const start = parseDate(task?.start_time || task?.startTime);
    if (!start) return now;
    return new Date(start.getTime() + START_TIME_OFFSET_MS);
  }

  function anchorTime(task, now = new Date()) {
    if (!task) return now;
    if (["completed", "terminated"].includes(task.status)) {
      return parseDate(task.end_time) || parseDate(task.updated_at) || now;
    }
    return now;
  }

  function formatLocalDateTimeInput(date = new Date()) {
    const offsetMs = date.getTimezoneOffset() * 60000;
    const local = new Date(date.getTime() - offsetMs);
    return local.toISOString().slice(0, 16);
  }

  function calculatePausedSeconds(task, now = new Date()) {

    const basePaused = Number(task.paused_seconds);
    // if (task.status !== "running " or ) return Math.max(basePaused, 0);
    const pausedAtRaw = task?.paused_at;
    const pausedAt = pausedAtRaw ? parseDate(pausedAtRaw) : null;
    const extra = pausedAt
        ? Math.max(Math.floor((now.getTime() - pausedAt.getTime()) / 1000), 0)
        : 0;
    return Math.max(basePaused + extra, 0);
  }

  function elapsedActiveSeconds(task, now = new Date()) {
    if (!task) return 0;
    if (task.status === "pending") return 0;
    const anchor = anchorTime(task, now);
    const start = startTimeWithOffset(task, anchor);
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
    console.table(task)
    const detail = task.score || {};

    const target = Number(detail.target_points || 0);        // 目标积分
    const dbCurrent = Number(detail.current_points || 0);    // 数据库 current_points（你要求剩余时间用它）
    const ratePerHour = Number(detail.point_rate || 0) || 7000;
    const ratePerSecond = ratePerHour / 3600;

    // 统一以 anchor 作为“当前时间”（进行中=now，已完成/终止=结束时间点）
    const anchor = anchorTime(task, now);

    // 开始时间（包含你项目里的 +8h offset 逻辑）
    const start = startTimeWithOffset(task, anchor);

    // 暂停累计秒数（包含 paused_at 到 anchor 的增量）
    const pausedSeconds = calculatePausedSeconds(task, anchor);
    // console.log("[pausedSeconds]", {
    //   taskId: task.id,
    //   status: task.status,
    //   pausedSeconds,
    // });

    // 有效运行秒数 = (anchor - start) - pausedSeconds
    const elapsedSeconds = Math.max(Math.floor((anchor.getTime() - start.getTime()) / 1000), 0);
    const effectiveSeconds = Math.max(elapsedSeconds - pausedSeconds, 0);

    // 1) 当前积分（你要求：速率 * (当前时间 - 开始时间 - 暂停时长)，单位秒）
    // 注意：这里得到的是“运行带来的增量”，通常要 + 基础积分
    const gained = ratePerSecond > 0 ? ratePerSecond * effectiveSeconds : 0;
    const runtimeCurrent = dbCurrent + gained; // 如果 dbCurrent 是“开始时积分/上次落库积分”，这样叠加才合理

    const current = target > 0 ? Math.min(runtimeCurrent, target) : runtimeCurrent;

    // 2) 剩余时间（你要求：用数据库 current_points 字段算）
    // 剩余秒数 = (目标 - 数据库当前积分) / 每秒速率
    // 这里严格按你要求使用 dbCurrent，而不是上面实时算出来的 current
    let remainingSeconds = 0;
    if (ratePerSecond > 0 && target > 0) {
      const remainPoints = Math.max(target - current, 0);
      remainingSeconds = Math.max(Math.ceil(remainPoints / ratePerSecond), 0);
    }


    // 3) 预计结束时间 = 当前时间 + 剩余时间
    const end = new Date(anchor.getTime() + remainingSeconds * 1000);

    // 已完成/终止：锁定结束
    if (["completed", "terminated"].includes(task.status)) {
      return { target, current, rate: ratePerHour, remainingSeconds: 0, end: anchor };
    }

    return { target, current, rate: ratePerHour, remainingSeconds, end };
  }


  function computeMultiplierMeta(task, now = new Date()) {
    const detail = task.multiplier || {};

    const durationSeconds = Number(detail.duration_hours || 0);
    const durationHours = Math.round((durationSeconds / 3600) * 100) / 100;

    // 2) anchor：进行中=now，完成/终止=结束时刻（你已有 anchorTime 逻辑）
    const anchor = anchorTime(task, now);

    // 3) 开始时间（含你项目里的 +8h offset）
    const start = startTimeWithOffset(task, anchor);

    // 4) 暂停累计秒数（paused_seconds + paused_at 增量，仅当 paused_at 有值且可解析时）
    const pausedSeconds = calculatePausedSeconds(task, anchor);

    // 5) 经过秒数（从开始到当前）
    const elapsedSeconds = Math.max(Math.floor((anchor.getTime() - start.getTime()) / 1000), 0);

    // 6) 有效运行秒数 = 经过 - 暂停
    const effectiveSeconds = Math.max(elapsedSeconds - pausedSeconds, 0);

    // --- 按你给的公式 ---
    // 剩余时间 = 开始时间 + 暂停时长 + 时长 - 当前时间
    // 变形到秒：remainingSeconds = durationSeconds + pausedSeconds - elapsedSeconds
    const remainingSeconds = Math.max(durationSeconds + pausedSeconds - elapsedSeconds, 0);

    // 预计结束时间：当前时间 + 剩余时间（保持你现有展示逻辑）
    const end = new Date(anchor.getTime() + remainingSeconds * 1000);

    // 初始倍率（保持原逻辑）
    const hasInitialMultiplier =
        detail.initial_multiplier !== undefined &&
        detail.initial_multiplier !== null &&
        Number.isFinite(Number(detail.initial_multiplier));
    const initialMultiplier = hasInitialMultiplier ? Number(detail.initial_multiplier) : 1;

    // 倍率增长（你要求：*(倍率增长)，这里按“每秒增长值”理解）
    const growthPerSecond = Number(detail.current_multiplier ?? 0);

    // 当前倍率 = （当前时间 - 开始时间 - 暂停时长） * 倍率增长
    // 如果你希望“从 initialMultiplier 起算”，改成：initialMultiplier + effectiveSeconds * growthPerSecond
    const currentMultiplier = initialMultiplier + effectiveSeconds * growthPerSecond;

    if (["completed", "terminated"].includes(task.status)) {
      return {
        duration: durationHours,
        end: anchor,
        remainingSeconds: 0,
        currentMultiplier,
        initialMultiplier,
        growthPerSecond,
      };
    }

    return {
      duration: durationHours,
      end,
      remainingSeconds,
      currentMultiplier,
      initialMultiplier,
      growthPerSecond,
    };
  }

  function computeChestMeta(task, now = new Date()) {
    const detail = task.chest || {};

    const durationSeconds = Number(detail.duration_hours || 0);
    const durationHours = Math.round((durationSeconds / 3600) * 100) / 100;

    // 2) anchor：进行中=now，完成/终止=结束时刻
    const anchor = anchorTime(task, now);

    // 3) 开始时间：后台时间 +8小时（你项目里已有 startTimeWithOffset）
    const start = startTimeWithOffset(task, anchor);

    // 4) 暂停累计秒数（paused_seconds + paused_at 增量）
    const pausedSeconds = calculatePausedSeconds(task, anchor);

    // 5) 经过秒数 = 当前时间 - 开始时间
    const elapsedSeconds = Math.max(Math.floor((anchor.getTime() - start.getTime()) / 1000), 0);

    // 6) 按你给的公式：剩余时间 = 开始时间 + 暂停时长 + 时长 - 当前时间
    // 变形到秒：remainingSeconds = durationSeconds + pausedSeconds - elapsedSeconds
    const remainingSeconds = Math.max(durationSeconds + pausedSeconds - elapsedSeconds, 0);

    // 7) 预计结束时间 = 当前时间 + 剩余时间
    const end = new Date(anchor.getTime() + remainingSeconds * 1000);

    if (["completed", "terminated"].includes(task.status)) {
      return { duration: durationHours, end: anchor, remainingSeconds: 0 };
    }
    return { duration: durationHours, end, remainingSeconds };
  }


  function computeRemainingSeconds(task, now = new Date()) {
    if (!task) return Number.POSITIVE_INFINITY;
    if (["completed", "terminated"].includes(task.status)) return 0;
    if (task.task_type === "score") return computeScoreMeta(task, now).remainingSeconds;
    if (task.task_type === "multiplier") return computeMultiplierMeta(task, now).remainingSeconds;
    if (task.task_type === "chest") return computeChestMeta(task, now).remainingSeconds;
    return Number.POSITIVE_INFINITY;
  }

  function renderGroups() {
    ensureDefaultGroups();
    const list = document.querySelector("#group-list");
    if (!list) return;

    let groups = taskState.groups || [];
    const isAdmin = ["admin", "super_admin"].includes(currentUser.role);

    // 管理员按“查看范围”过滤分组
    if (isAdmin && currentOwner !== "all") {
      groups = groups.filter((g) => (g.owner_username || g.owner) === currentOwner);
    }

    // ===== 全部任务按钮 =====
    const allBtn = document.createElement("button");
    const allActive = currentGroupId === "all";
    allBtn.className = `group-item ${allActive ? "active" : ""}`;
    const totalCount = Number.isFinite(Number(taskPagination.total)) ? Number(taskPagination.total) : taskState.tasks.length;

    allBtn.innerHTML = `
    <div class="group-content">
      <div class="group-row1">
        <strong class="group-title">全部任务</strong>
        <span class="badge group-count">${totalCount}</span>
      </div>
      ${
        allActive
            ? `<div class="group-row3"><p class="muted group-desc">查看所有分组</p></div>`
            : ``
    }
    </div>
  `;

    allBtn.addEventListener("click", () => {
      currentGroupId = "all";
      taskPagination.page = 1;
      loadTasksFromServer("all", { page: taskPagination.page });
    });

    list.innerHTML = "";
    list.appendChild(allBtn);

    // ===== 分组按钮列表 =====
    groups.forEach((group) => {
      const count = Number.isFinite(Number(group.task_count))
          ? Number(group.task_count)
          : taskState.tasks.filter((t) => t.group_id === group.id).length;

      const button = document.createElement("button");
      const active = currentGroupId === group.id;
      button.className = `group-item ${active ? "active" : ""}`;

      const allowDelete = isOwnedGroup(group) && !group.is_default;

      // 第二行：仅选中显示（管理/删除：按权限可选）
      const actionsHtml = active
          ? `
        <div class="group-row2">
          <div class="group-actions">
            ${isOwnedGroup(group) ? '<button class="ghost mini" data-manage>管理</button>' : ""}
            ${allowDelete ? '<button class="ghost mini danger" data-delete>删除</button>' : ""}
          </div>
        </div>
      `
          : "";

      // 第三行：仅选中显示描述
      const descText = group.description || "无描述";
      const descHtml = active
          ? `<div class="group-row3"><p class="muted group-desc">${descText}</p></div>`
          : "";

      // 第四行：所属（不显示“所属”字样）
      const ownerHtml = `<div class="group-row4"><p class="muted mini group-owner">${formatOwnerDisplay(group)}</p></div>`;

      // 第一行：组名 + 数量（数量始终靠右）
      button.innerHTML = `
      <div class="group-content">
        <div class="group-row1">
          <strong class="group-title">${group.name}</strong>
          <span class="badge group-count">${count}</span>
        </div>
        ${actionsHtml}
        ${descHtml}
        ${ownerHtml}
      </div>
    `;

      // 点击分组切换（点击管理/删除不触发切换）
      button.addEventListener("click", (evt) => {
        if (evt.target?.closest?.("[data-delete],[data-manage]")) return;
        currentGroupId = group.id;
        renderGroups();
        taskPagination.page = 1;
        loadTasksFromServer(group.id, { page: taskPagination.page });
      });

      // 绑定“管理”
      if (isOwnedGroup(group)) {
        button.querySelector("[data-manage]")?.addEventListener("click", (evt) => {
          evt.stopPropagation();
          openGroupManageModal(group).catch((err) => console.warn("打开分组管理失败", err));
        });
      }

      // 绑定“删除”
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
          task_count: Number(g.task_count ?? 0),
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
        renderTypeFilter();
        taskPagination.page = 1;
        loadTasksFromServer(currentGroupId, { page: taskPagination.page });
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
        renderStatusFilter();
        taskPagination.page = 1;
        loadTasksFromServer(currentGroupId, { page: taskPagination.page });
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
    const withTerminationGuard = (compareFn) => (a, b) => {
      if (a.status === "terminated" && b.status !== "terminated") return 1;
      if (a.status !== "terminated" && b.status === "terminated") return -1;
      return compareFn(a, b);
    };
    const now = new Date();
    switch (currentSort) {
      case "status":
        return copied.sort(withTerminationGuard((a, b) => (a.status || "").localeCompare(b.status || "")));
      case "type":
        return copied.sort(withTerminationGuard((a, b) => (a.task_type || "").localeCompare(b.task_type || "")));
      case "start_time":
      case "start_time_asc":
        return copied.sort(
          withTerminationGuard((a, b) => new Date(a.start_time || 0) - new Date(b.start_time || 0)),
        );
      case "start_time_desc":
        return copied.sort(
          withTerminationGuard((a, b) => new Date(b.start_time || 0) - new Date(a.start_time || 0)),
        );
      case "remaining_asc":
        return copied.sort(
          withTerminationGuard((a, b) => computeRemainingSeconds(a, now) - computeRemainingSeconds(b, now)),
        );
      case "remaining_desc":
        return copied.sort(
          withTerminationGuard((a, b) => computeRemainingSeconds(b, now) - computeRemainingSeconds(a, now)),
        );
      default:
        return copied.sort(
          withTerminationGuard((a, b) => computeRemainingSeconds(a, now) - computeRemainingSeconds(b, now)),
        );
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
    // if (currentOwner !== "all") {
    //   tasks = tasks.filter((t) => t.owner === currentOwner);
    // }
    if (currentDeviceKeyword) {
      const kw = currentDeviceKeyword.toLowerCase();
      tasks = tasks.filter((t) => String(t.device_id || "").toLowerCase().includes(kw));
    }

    if (serverSortKeys.has(currentSort)) return tasks;
    return sortTasks(tasks);
  }

  async function loadTasksFromServer(groupId = currentGroupId, { page = taskPagination.page } = {}) {
    try {
      const params = new URLSearchParams();
      const effectiveGroupId = groupId ?? currentGroupId;
      if (effectiveGroupId && effectiveGroupId !== "all") {
        const groupIdNum = Number(effectiveGroupId);
        params.append("group_id", Number.isFinite(groupIdNum) ? groupIdNum : effectiveGroupId);
      }
      if (currentStatus !== "all") params.append("status", currentStatus);
      if (currentType !== "all") params.append("task_type", currentType);
      const deviceKw = (currentDeviceKeyword || "").trim();
      if (deviceKw) params.append("device_identifier", deviceKw);
      if (currentSort) params.append("sort_by", currentSort);
      params.append("page", page);
      params.append("page_size", taskPagination.pageSize);

      const resp = await apiFetch(`/api/tasks${params.toString() ? `?${params.toString()}` : ""}`);
      if (!resp.ok) throw new Error(`加载任务失败 ${resp.status}`);
      const data = await resp.json();
      const list = Array.isArray(data) ? data : data?.items || [];
      taskPagination.total = Number(data?.total ?? list?.length ?? 0);
      taskPagination.page = Number(data?.page ?? page ?? 1);
      taskPagination.pageSize = Number(data?.page_size ?? taskPagination.pageSize);
      taskState.tasks = (list || []).map((task) => normalizeApiTask(task)).filter(Boolean);
      saveTaskState(taskState);
      renderTasks();
      renderGroups();
    } catch (err) {
      console.warn("从服务端加载任务失败", err);
      alert(err.message || "加载任务失败，请稍后重试");
    }
  }

  async function refreshAllData() {
    await Promise.all([reloadGroupsFromServer(), loadTasksFromServer(currentGroupId, { page: taskPagination.page })]);
  }
// ====== 1) 新增：不显示秒的时间与时长格式化 ======
  function fmtDateNoSeconds(value) {
    if (!value) return "-";
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    const datePart = d.toLocaleDateString();
    const timePart = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); // 不要秒
    return `${datePart} ${timePart}`;
  }

  /**
   * 不显示秒：按“分钟”进位（避免显示 0 分但其实还有几十秒）
   * 例：59秒 -> 1分； 61秒 -> 2分； 1小时1分 -> 1小时1分
   */
  function secondsToDisplayNoSeconds(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return "0分";
    const totalMin = Math.max(Math.ceil(seconds / 60), 0);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h && m) return `${h}小时${m}分`;
    if (h && !m) return `${h}小时`;
    return `${m}分`;
  }

// 可选：防止名称注入/破坏DOM（建议加）
  function escapeHtml(str) {
    return String(str ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
  }

  // ====== 2) 替换：设备号展示（第一行要求：设备号 类型 状态） ======
  function deviceLine(task) {
    // 终止任务你之前不显示设备，这里按你新规范仍可显示（如需继续隐藏，可加判断）
    if (task?.device_id) return `<span class="badge subtle">${escapeHtml(task.device_id)}</span>`;
    return `<span class="badge warning">未绑定</span>`;
  }

  function getGroupById(id) {
    return taskState.groups.find((g) => g.id === id);
  }

  function canEditTask(task) {
    const group = getGroupById(task.group_id);
    return isOwnedGroup(group);
  }

  function renderTaskFooter(task) {
    const editable = canEditTask(task);
    return `
      <div class="task-actions">
        <button class="ghost mini" data-action="start-pause">${task.status === "running" ? "暂停" : "开始"}</button>
        <button class="ghost mini" data-action="patch">${task.task_type === "score" ? "补暂停" : "补暂停"}</button>
        ${editable ? '<button class="ghost mini" data-action="edit">修改</button>' : ""}
        <button class="ghost mini danger" data-action="terminate">终止</button>
      </div>
    `;
  }

// ====== 3) 替换：任务卡片“第二行指标行” ======
  function renderTaskBody(task) {
    const now = new Date();

    // 灵光积分：当前积分 + 预计结束（不要秒）
    if (task.task_type === "score") {
      const meta = computeScoreMeta(task, now);
      return `
      <div class="task-line3 task-kv-row">
        <div class="task-kv">
<!--          <span class="muted mini">当前积分</span>-->
          <strong data-field="current-points" data-task-id="${task.id}">${formatInteger(meta.current)}</strong>
        </div>
        <div class="task-kv">
<!--          <span class="muted mini">预计结束</span>-->
          <strong data-field="end-time" data-task-id="${task.id}">${fmtDateNoSeconds(meta.end)}</strong>
        </div>
      </div>
    `;
    }

    // 宝箱：剩余时间（不要秒） + 预计结束（不要秒）
    if (task.task_type === "chest") {
      const meta = computeChestMeta(task, now);
      return `
      <div class="task-line3 task-kv-row">
        <div class="task-kv">
<!--          <span class="muted mini">剩余时间</span>-->
          <strong data-field="remaining-time" data-task-id="${task.id}">${secondsToDisplayNoSeconds(meta.remainingSeconds)}</strong>
        </div>
        <div class="task-kv">
<!--          <span class="muted mini">预计结束</span>-->
          <strong data-field="end-time" data-task-id="${task.id}">${fmtDateNoSeconds(meta.end)}</strong>
        </div>
      </div>
    `;
    }

    // 挂机倍率：实时倍率 + 预计结束（不要秒）
    if (task.task_type === "multiplier") {
      const meta = computeMultiplierMeta(task, now);
      const cur = Number(meta.currentMultiplier || 0);

      return `
    <div class="task-line3 task-kv-row">
      <div class="task-kv">
        <strong data-field="current-multiplier" data-task-id="${task.id}">${cur.toFixed(2)}</strong>
      </div>
      <div class="task-kv">
        <strong data-field="end-time" data-task-id="${task.id}">${fmtDateNoSeconds(meta.end)}</strong>
      </div>
    </div>
  `;
    }


    return "";
  }

  function updateRealtimeFields() {
    const now = new Date();
    const tasks = filteredTasks().filter((task) => {
      if (!task) return false;
      if (["completed", "terminated"].includes(task.status)) return false;
      return task.status === "running";
    });

    tasks.forEach((task) => {
      const setText = (field, value) => {
        const el = document.querySelector(`[data-field="${field}"][data-task-id="${task.id}"]`);
        if (el) el.textContent = value;
      };

      if (task.task_type === "score") {
        const meta = computeScoreMeta(task, now);
        setText("current-points", formatInteger(meta.current));
        setText("end-time", fmtDateNoSeconds(meta.end));
      }

      if (task.task_type === "multiplier") {
        const meta = computeMultiplierMeta(task, now);
        setText("current-multiplier", Number(meta.currentMultiplier || 0).toFixed(2));
        setText("end-time", fmtDateNoSeconds(meta.end));
      }


      if (task.task_type === "chest") {
        const meta = computeChestMeta(task, now);
        setText("remaining-time", secondsToDisplayNoSeconds(meta.remainingSeconds));
        setText("end-time", fmtDateNoSeconds(meta.end));
      }
    });
  }

  function startRealtimeTicker() {
    if (realtimeTimer) clearInterval(realtimeTimer);
    realtimeTimer = setInterval(updateRealtimeFields, 1000);
  }

// ====== 4) 替换：renderTasks()（严格三行：第一行 badges；第二行名称；第三行按钮） ======
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
      const name = task?.name ? String(task.name) : "未命名任务";

      const card = document.createElement("div");
      card.className = "task-card";

      card.innerHTML = `
      <!-- 第一行：设备号 类型 状态 -->
      <div class="task-line1">
        <div class="task-badges">
          ${deviceLine(task)}
          ${typeChip(task.task_type)}
          ${statusChip(task.status)}
        </div>
      </div>

      <!-- 第二行：名称（小字，显示不下省略） -->
      <div class="task-line2 task-name muted mini" title="${escapeHtml(name)}">
        ${escapeHtml(name)}
      </div>

      <!-- 第二行（指标行）：按任务类型渲染 -->
      ${renderTaskBody(task)}

      <!-- 第三行：按钮 -->
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
    renderTaskPagination();
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
    populateEditGroupSelect(task);
    updateTypeSections("#edit-modal", task.task_type);
    if (task.task_type === "score") {
      document.querySelector("#edit-score-target").value = task.score?.target_points || 0;
      document.querySelector("#edit-score-rate").value = task.score?.point_rate || 7000;
    }
    if (task.task_type === "multiplier") {
      const durationSeconds = Number(task.multiplier?.duration_hours || 0);
      const durationHours = Math.round((durationSeconds / 3600) * 100) / 100; // 保留2位小数
      document.querySelector("#edit-multiplier-hours").value = durationHours;

      document.querySelector("#edit-multiplier-initial").value = task.multiplier?.initial_multiplier ?? 1.0;
      document.querySelector("#edit-multiplier-current").value = task.multiplier?.current_multiplier || 1.0;
    }

    if (task.task_type === "chest") {
      const durationSeconds = Number(task.chest?.duration_hours || 0);
      const durationHours = Math.round((durationSeconds / 3600) * 100) / 100; // 保留2位小数
      document.querySelector("#edit-chest-hours").value = durationHours;
    }

    openModal("#edit-modal");
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
    requestAndUpdateTask(`/api/tasks/${task.id}/patch`, {
      body: { add_points: addPoints || null, add_hours: addHours || null },
    }).catch((err) => {
      console.warn("补暂停/补时失败", err);
      alert(err.message || "补暂停/补时失败，请稍后重试");
    });
  }

  async function applyEdit(task, payload) {
    const requests = [];
    if (!payload.skipDeviceUpdate && payload.device !== undefined) {
      requests.push(
        requestAndUpdateTask(`/api/tasks/${task.id}/device`, {
          body: { device_id: payload.devicePk ?? payload.device },
        }),
      );
    }

    const detailPayload = {};
    if (task.task_type === "score" && payload.score) {
      detailPayload.score_target = payload.score.target_points;
      detailPayload.score_rate = payload.score.point_rate;
    }
    if (task.task_type === "multiplier" && payload.multiplier) {
      detailPayload.multiplier_hours = payload.multiplier.duration_hours;
      detailPayload.multiplier_initial = payload.multiplier.initial_multiplier;
      detailPayload.multiplier_increment = payload.multiplier.current_multiplier;
    }
    if (task.task_type === "chest" && payload.chest) {
      detailPayload.chest_hours = payload.chest.duration_hours;
    }
    const hasDetailPayload = Object.values(detailPayload).some((v) => v !== undefined && v !== null);
    if (hasDetailPayload) {
      requests.push(requestAndUpdateTask(`/api/tasks/${task.id}/detail`, { body: detailPayload }));
    }

    if (payload.target_group_id && String(payload.target_group_id) !== String(task.group_id)) {
      requests.push(
        requestAndUpdateTask(`/api/tasks/${task.id}/group`, { body: { target_group_id: Number(payload.target_group_id) } }),
      );
    }

    if (!requests.length) return;

    try {
      await Promise.all(requests);
    } catch (err) {
      console.warn("修改任务失败", err);
      alert(err.message || "修改任务失败，请稍后重试");
    }
  }

  function applyMove(task, targetGroupId) {
    const target = taskState.groups.find((g) => g.id === targetGroupId);
    if (!target) return;
    if (!isOwnedGroup(target)) {
      alert("只能将任务移动到自己的分组");
      return;
    }
    requestAndUpdateTask(`/api/tasks/${task.id}/group`, {
      body: { target_group_id: Number(targetGroupId) },
    }).catch((err) => {
      console.warn("移动分组失败", err);
      alert(err.message || "移动分组失败，请稍后重试");
    });
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

    if (action === "start-pause") {
      const nextAction =
        task.status === "running" ? "pause" : task.status === "paused" ? "resume" : "start";
      requestAndUpdateTask(`/api/tasks/${task.id}/status`, { body: { action: nextAction } }).catch((err) => {
        console.warn("更新任务状态失败", err);
        alert(err.message || "更新任务状态失败，请稍后重试");
      });
      return;
    }

    if (action === "terminate") {
      if (!confirm("终止任务将释放设备，确定终止？")) return;
      requestAndUpdateTask(`/api/tasks/${task.id}/status`, { body: { action: "terminate" } }).catch((err) => {
        console.warn("终止任务失败", err);
        alert(err.message || "终止任务失败，请稍后重试");
      });
    }
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
    document.querySelector("#task-start").value = formatLocalDateTimeInput(new Date());
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

  function populateEditGroupSelect(task) {
    const select = document.querySelector("#edit-group");
    if (!select) return;
    const options = ownedGroups().filter((g) => !isCompletedGroup(g));
    select.innerHTML = options.map((g) => `<option value="${g.id}">${g.name}</option>`).join("");
    select.value = task.group_id;
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
    const start = document.querySelector("#task-start").value || formatLocalDateTimeInput(new Date());
    const payload = {
      name: name || null,
      task_type: type,
      group_id: Number(groupId),
      device_id: validatedDevice.device_pk,
      start_time: new Date(start).toISOString(),
    };
    if (type === "score") {
      payload.score_point_rate = Number(document.querySelector("#task-score-rate").value || 7000);
      payload.score_target = Number(document.querySelector("#task-score-target").value || 360000);
      payload.score_current = Number(document.querySelector("#task-score-current").value || 0);

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
      const displayName = newTask?.name || name || "未命名任务";
      logAction(newTask, "创建任务", `创建${TypeLabels[type]}任务「${displayName}」`);
      closeModal("#task-modal");
      saveStateAndRender();
      await refreshAllData();
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
        taskDefaults.initialMultiplier = Number(data.default_multiplier);
      }
    } catch (err) {
      console.warn("获取任务默认配置失败，使用本地默认值", err);
    }
  }

  function bindEvents() {
    const deviceInput = document.querySelector("#device-filter");
    if (deviceInput) {
      let timer = null;
      deviceInput.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          currentDeviceKeyword = (deviceInput.value || "").trim();
          taskPagination.page = 1;
          loadTasksFromServer(currentGroupId, { page: taskPagination.page });
        }, 150); // 轻量防抖
      });
    }

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
      const deviceInputValue = document.querySelector("#edit-device").value;
      const trimmedDevice = (deviceInputValue || "").trim();
      const unchangedDevice = trimmedDevice && String(trimmedDevice) === String(task.device_id || "");
      let validatedDevice = { value: null, record: null, device_pk: null, skipUpdate: false };
      if (unchangedDevice) {
        validatedDevice = { value: task.device_id, record: null, device_pk: null, skipUpdate: true };
      } else {
        validatedDevice = await validateDeviceInput(deviceInputValue, {
          currentDeviceId: task.device_id,
        });
        if (validatedDevice.error) return;
      }
      const payload = {
        device: validatedDevice.value,
        devicePk: validatedDevice.device_pk,
        deviceRecord: validatedDevice.record,
        skipDeviceUpdate: Boolean(validatedDevice.skipUpdate),
        target_group_id: document.querySelector("#edit-group")?.value || null,
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
      taskPagination.page = 1;
      loadTasksFromServer(currentGroupId, { page: taskPagination.page });
    });
    const prevBtn = document.querySelector("#task-prev-page");
    const nextBtn = document.querySelector("#task-next-page");
    if (prevBtn) {
      prevBtn.addEventListener("click", () => {
        if (taskPagination.page <= 1) return;
        taskPagination.page -= 1;
        loadTasksFromServer(currentGroupId, { page: taskPagination.page });
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        const totalPages = Math.max(1, Math.ceil(taskPagination.total / taskPagination.pageSize));
        if (taskPagination.page >= totalPages) return;
        taskPagination.page += 1;
        loadTasksFromServer(currentGroupId, { page: taskPagination.page });
      });
    }
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
    await loadTasksFromServer("all");
    populateGroupSelects();
    renderOwnerFilter();
    renderStatusFilter();
    renderGroups();
    renderTypeFilter();
    renderTasks();

    const deviceInput = document.querySelector("#device-filter");
    if (deviceInput) deviceInput.value = currentDeviceKeyword;
    const sortSelect = document.querySelector("#task-sort");
    if (sortSelect) sortSelect.value = currentSort;

    startRealtimeTicker();
    setCreateTypeButtons(createTaskType);
    updateTypeSections("#task-modal", createTaskType);
    setInterval(refreshAllData, 5000);
    bindEvents();
  });
})();
