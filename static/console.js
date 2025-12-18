const RoleLabels = {
  user: "普通用户",
  admin: "管理员",
  super_admin: "超级管理员",
};

const PermissionMenus = {
  base: [
    { key: "tasks", label: "任务管理", href: "/tasks" },
    { key: "devices", label: "设备池", href: "/devices" },
    { key: "account", label: "账户设置", href: "/account" },
  ],
  admin: [
    { key: "users", label: "用户管理", href: "/users" },
    {
      key: "logs",
      label: "日志中心",
      children: [
        { key: "task_logs", label: "任务操作日志", href: "/logs/task" },
        { key: "device_logs", label: "设备池操作日志", href: "/logs/device" },
        { key: "account_logs", label: "账户操作日志", href: "/logs/account" },
      ],
      href: "/logs/account",
    },
    {
      key: "system",
      label: "系统配置",
      href: "/system/global",
      children: [{ key: "global_config", label: "全局参数配置", href: "/system/global" }],
    },
  ],
  super_admin: [
    {
      key: "system",
      label: "系统配置",
      href: "/system/platform",
      children: [
        { key: "platform_config", label: "平台级配置", href: "/system/platform" },
        { key: "global_config", label: "全局参数配置", href: "/system/global" },
      ],
    },
  ],
};

const STORAGE_KEYS = {
  session: "garh_session",
  tasks: "garh_tasks",
  taskGroups: "garh_task_groups",
  taskLogs: "garh_task_logs",
};

const DEFAULT_TASK_GROUPS = [
  { id: "g-default", name: "未分组", description: "默认分组，删除分组后任务归档于此", is_default: true, owner: "ops01" },
  { id: "g-score", name: "灵光积分组", description: "负责积分类任务", is_default: false, owner: "ops01" },
  { id: "g-multiplier", name: "挂机倍率组", description: "倍率调度", is_default: false, owner: "qa02" },
  { id: "g-chest", name: "宝箱收集组", description: "宝箱收集专项", is_default: false, owner: "ops01" },
];

const DEFAULT_TASKS = [
  {
    id: 101,
    name: "晨跑灵光积分",
    task_type: "score",
    status: "running",
    group_id: "g-score",
    device_id: "DEV-1001",
    owner: "ops01",
    updated_at: "2024-10-02T09:30:00Z",
    start_time: "2024-10-02T07:00:00Z",
    score: { target_points: 360000, current_points: 120000, point_rate: 7000 },
  },
  {
    id: 102,
    name: "凌晨倍率维护",
    task_type: "multiplier",
    status: "paused",
    group_id: "g-multiplier",
    device_id: "DEV-2208",
    owner: "qa02",
    updated_at: "2024-10-02T05:40:00Z",
    start_time: "2024-10-02T03:00:00Z",
    paused_seconds: 3600,
    multiplier: { duration_hours: 12, current_multiplier: 4.6 },
  },
  {
    id: 103,
    name: "凌晨宝箱刷新",
    task_type: "chest",
    status: "pending",
    group_id: "g-chest",
    device_id: "DEV-3010",
    owner: "ops01",
    updated_at: "2024-10-01T23:00:00Z",
    start_time: "2024-10-02T00:00:00Z",
    chest: { duration_hours: 18 },
  },
  {
    id: 104,
    name: "跨组支援-灵光",
    task_type: "score",
    status: "completed",
    group_id: "g-default",
    device_id: "DEV-2009",
    owner: "qa02",
    updated_at: "2024-09-30T10:00:00Z",
    start_time: "2024-09-30T05:00:00Z",
    score: { target_points: 360000, current_points: 360000, point_rate: 7200 },
  },
];

const DEFAULT_TASK_LOGS = [
  {
    id: 1,
    task_id: 101,
    scope: "task",
    action: "创建任务",
    detail: "ops01 创建了晨跑灵光积分并绑定 DEV-1001",
    performer: "ops01",
    created_at: "2024-10-02T07:00:00Z",
  },
  {
    id: 2,
    task_id: 102,
    scope: "task",
    action: "暂停任务",
    detail: "qa02 暂停了凌晨倍率维护",
    performer: "qa02",
    created_at: "2024-10-02T05:40:00Z",
  },
  {
    id: 3,
    task_id: 104,
    scope: "device",
    action: "解绑设备",
    detail: "任务 104 释放设备 DEV-2009",
    performer: "qa02",
    created_at: "2024-09-30T10:00:00Z",
  },
];

function ensureSeedData() {
  if (!localStorage.getItem(STORAGE_KEYS.taskGroups)) {
    localStorage.setItem(STORAGE_KEYS.taskGroups, JSON.stringify(DEFAULT_TASK_GROUPS));
  }
  if (!localStorage.getItem(STORAGE_KEYS.tasks)) {
    localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(DEFAULT_TASKS));
  }
  if (!localStorage.getItem(STORAGE_KEYS.taskLogs)) {
    localStorage.setItem(STORAGE_KEYS.taskLogs, JSON.stringify(DEFAULT_TASK_LOGS));
  }
}

function loadTaskState() {
  ensureSeedData();
  const tasks = JSON.parse(localStorage.getItem(STORAGE_KEYS.tasks) || "[]");
  const groups = JSON.parse(localStorage.getItem(STORAGE_KEYS.taskGroups) || "[]");
  const logs = JSON.parse(localStorage.getItem(STORAGE_KEYS.taskLogs) || "[]");
  return { tasks, groups, logs };
}

function saveTaskState(next) {
  const { tasks, groups, logs } = next;
  localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(tasks));
  localStorage.setItem(STORAGE_KEYS.taskGroups, JSON.stringify(groups));
  localStorage.setItem(STORAGE_KEYS.taskLogs, JSON.stringify(logs));
}

function appendTaskLog(entry) {
  const current = JSON.parse(localStorage.getItem(STORAGE_KEYS.taskLogs) || "[]");
  current.push(entry);
  localStorage.setItem(STORAGE_KEYS.taskLogs, JSON.stringify(current));
}

function loadTasks() {
  const { tasks } = loadTaskState();
  return tasks;
}

function setSession(session) {
  localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
}

function getSession() {
  const raw = localStorage.getItem(STORAGE_KEYS.session);
  return raw ? JSON.parse(raw) : null;
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEYS.session);
}

function getCurrentUser() {
  const session = getSession();
  return session ? session.user : null;
}

function requireAuth() {
  const session = getSession();
  if (!session || !session.token) {
    window.location.href = "/";
    return null;
  }
  return session.user;
}

async function apiFetch(url, options = {}) {
  const session = getSession();
  const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
  if (session?.token) {
    headers["Authorization"] = `Bearer ${session.token}`;
  }
  const resp = await fetch(url, { ...options, headers });
  if (resp.status === 401) {
    clearSession();
    window.location.href = "/";
    return Promise.reject(new Error("未认证"));
  }
  return resp;
}

function buildMenu(role, activeKey) {
  const menuEl = document.querySelector("#menu");
  if (!menuEl) return;
  menuEl.innerHTML = "";

  const items = [...PermissionMenus.base];
  if (role === "admin") {
    items.push(...PermissionMenus.admin);
  }
  if (role === "super_admin") {
    const merged = [...PermissionMenus.admin];
    const sysFromSuper = PermissionMenus.super_admin.find((i) => i.key === "system");
    if (sysFromSuper) {
      const existingIdx = merged.findIndex((m) => m.key === "system");
      if (existingIdx >= 0) {
        merged[existingIdx] = sysFromSuper;
      } else {
        merged.push(sysFromSuper);
      }
    }
    items.push(...merged);
  }

  const allowed = items.filter((item) => {
    if (item.key === "users" && !["admin", "super_admin"].includes(role)) return false;
    if (item.key === "logs" && !["admin", "super_admin"].includes(role)) return false;
    return true;
  });

  allowed.forEach((item) => {
    const link = document.createElement("a");
    link.className = "menu-item";
    link.href = item.href;
    link.textContent = item.label;

    if (item.key === activeKey || item.children?.some((c) => c.key === activeKey)) {
      link.classList.add("active");
    }

    if (item.children) {
      link.classList.add("parent");

      const wrapper = document.createElement("div");
      wrapper.appendChild(link);

      const childrenList = document.createElement("div");
      childrenList.className = "menu-children";
      item.children.forEach((child) => {
        const childLink = document.createElement("a");
        childLink.className = "menu-item child";
        childLink.textContent = child.label;
        childLink.href = child.href || item.href;
        if (child.key === activeKey) {
          childLink.classList.add("active");
        }
        childrenList.appendChild(childLink);
      });

      wrapper.appendChild(childrenList);
      menuEl.appendChild(wrapper);
      return;
    }

    menuEl.appendChild(link);
  });
}

function renderTopbar(user) {
  const userInfo = document.querySelector("#user-info");
  const clock = document.querySelector("#clock");
  if (userInfo) {
    userInfo.textContent = `${user.username}（${RoleLabels[user.role]}）`;
  }
  if (clock) {
    clock.textContent = new Date().toLocaleString();
    setInterval(() => (clock.textContent = new Date().toLocaleString()), 1000);
  }
}

function bindTopbarActions() {
  const logoutBtn = document.querySelector("#logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await apiFetch("/api/logout", { method: "POST" });
      } catch (err) {
        console.warn(err);
      } finally {
        clearSession();
        window.location.href = "/";
      }
    });
  }

  const changePwdBtn = document.querySelector("#change-password-btn");
  if (changePwdBtn) {
    changePwdBtn.addEventListener("click", () => {
      window.location.href = "/account";
    });
  }
}

function initConsoleShell(activeKey) {
  ensureSeedData();
  const user = requireAuth();
  if (!user) return null;

  buildMenu(user.role, activeKey);
  renderTopbar(user);
  bindTopbarActions();
  return user;
}

function requireRole(user, roles = []) {
  if (!user) return false;
  if (!roles.length) return true;
  if (!roles.includes(user.role)) {
    alert("当前角色无访问权限");
    window.location.href = "/tasks";
    return false;
  }
  return true;
}

window.ConsoleShared = {
  RoleLabels,
  getSession,
  setSession,
  clearSession,
  getCurrentUser,
  requireAuth,
  requireRole,
  initConsoleShell,
  apiFetch,
  loadTasks,
  loadTaskState,
  saveTaskState,
  appendTaskLog,
};
