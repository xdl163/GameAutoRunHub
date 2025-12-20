import { apiFetch as baseApiFetch } from "./http.js";

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

function buildDefaultGroups(owner) {
  const username = owner?.username || owner || "system";
  return [
    { id: "g-default", name: "未分组", description: "默认分组，删除分组后任务归档于此", is_default: true, owner: username },
    { id: "g-completed", name: "已完成", description: "终止/完成任务归档区", is_default: true, owner: username },
  ];
}

const DEFAULT_TASKS = [];

const DEFAULT_TASK_LOGS = [];

function ensureSeedData() {
  const session = getSession();
  if (!session?.user) return;
  const owner = session.user;
  const currentGroupsRaw = localStorage.getItem(STORAGE_KEYS.taskGroups);
  let groups = currentGroupsRaw ? JSON.parse(currentGroupsRaw) : [];
  const defaultGroups = buildDefaultGroups(owner);
  const shouldReseed =
    !groups.length ||
    groups.some((g) => g.owner !== owner.username) ||
    groups.length !== defaultGroups.length ||
    !defaultGroups.every((dg) => groups.some((g) => g.name === dg.name && g.owner === dg.owner));

  if (shouldReseed) {
    groups = defaultGroups;
    localStorage.setItem(STORAGE_KEYS.taskGroups, JSON.stringify(groups));
    localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.taskLogs, JSON.stringify([]));
    return;
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
  const resp = await baseApiFetch(url, { ...options, headers });
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
