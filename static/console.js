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
      href: "/logs",
      children: [
        { key: "task_logs", label: "任务操作日志" },
        { key: "device_logs", label: "设备池操作日志" },
        { key: "account_logs", label: "账户操作日志" },
      ],
    },
    {
      key: "system",
      label: "系统配置",
      href: "/system",
      children: [{ key: "global_config", label: "全局参数配置" }],
    },
  ],
  super_admin: [
    {
      key: "system",
      label: "系统配置",
      href: "/system",
      children: [
        { key: "platform_config", label: "平台级配置" },
        { key: "global_config", label: "全局参数配置" },
      ],
    },
  ],
};

const STORAGE_KEYS = {
  users: "garh_users",
  current: "garh_current_user",
  tasks: "garh_tasks",
};

const DEFAULT_USERS = [
  {
    username: "admin",
    displayName: "超级管理员",
    role: "super_admin",
    password: "xu12345678gh",
    isActive: true,
  },
];

const DEFAULT_TASKS = [
  { id: "T-1001", name: "每日构建", status: "已完成", updated: "2024-10-01 09:30" },
  { id: "T-1002", name: "冒烟测试", status: "运行中", updated: "2024-10-01 09:45" },
  { id: "T-1003", name: "资源巡检", status: "排队中", updated: "2024-10-01 10:00" },
];

function ensureSeedData() {
  if (!localStorage.getItem(STORAGE_KEYS.users)) {
    localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(DEFAULT_USERS));
  }
  if (!localStorage.getItem(STORAGE_KEYS.tasks)) {
    localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(DEFAULT_TASKS));
  }
}

function loadUsers() {
  const raw = localStorage.getItem(STORAGE_KEYS.users);
  return raw ? JSON.parse(raw) : [];
}

function saveUsers(list) {
  localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(list));
}

function getCurrentUser() {
  const raw = localStorage.getItem(STORAGE_KEYS.current);
  return raw ? JSON.parse(raw) : null;
}

function setCurrentUser(user) {
  localStorage.setItem(STORAGE_KEYS.current, JSON.stringify(user));
}

function requireAuth() {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = "/";
    return null;
  }
  return user;
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
    if (item.key === "system" && role !== "super_admin") return false;
    return true;
  });

  allowed.forEach((item) => {
    const link = document.createElement("a");
    link.className = "menu-item";
    link.href = item.href;
    link.textContent = item.label;
    if (item.key === activeKey) {
      link.classList.add("active");
    }

    if (item.children) {
      link.classList.add("parent");
      const wrapper = document.createElement("div");
      wrapper.appendChild(link);

      const childrenList = document.createElement("div");
      childrenList.className = "menu-children";
      item.children.forEach((child) => {
        const childLink = document.createElement("span");
        childLink.className = "menu-item";
        childLink.textContent = child.label;
        childLink.style.cursor = "not-allowed";
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
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem(STORAGE_KEYS.current);
      window.location.href = "/";
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

function loadTasks() {
  const raw = localStorage.getItem(STORAGE_KEYS.tasks);
  return raw ? JSON.parse(raw) : [];
}

function saveTasks(tasks) {
  localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(tasks));
}

window.ConsoleShared = {
  initConsoleShell,
  requireRole,
  loadUsers,
  saveUsers,
  getCurrentUser,
  setCurrentUser,
  loadTasks,
  saveTasks,
  RoleLabels,
};
