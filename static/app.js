const RoleLabels = {
  user: "普通用户",
  admin: "管理员",
  super_admin: "超级管理员",
};

const PermissionMenus = {
  base: [
    { key: "tasks", label: "任务管理" },
    { key: "devices", label: "设备池" },
    { key: "account", label: "账户设置" },
  ],
  admin: [
    { key: "users", label: "用户管理" },
    {
      key: "logs",
      label: "日志中心",
      children: [
        { key: "task_logs", label: "任务操作日志" },
        { key: "device_logs", label: "设备池操作日志" },
        { key: "account_logs", label: "账户操作日志" },
      ],
    },
    {
      key: "system",
      label: "系统配置",
      children: [{ key: "global_config", label: "全局参数配置" }],
    },
  ],
  super_admin: [
    {
      key: "system",
      label: "系统配置",
      children: [
        { key: "platform_config", label: "平台级配置" },
        { key: "global_config", label: "全局参数配置" },
      ],
    },
  ],
};

const demoTasks = [
  { id: "T-1001", name: "每日构建", status: "已完成", updated: "2024-10-01 09:30" },
  { id: "T-1002", name: "冒烟测试", status: "运行中", updated: "2024-10-01 09:45" },
  { id: "T-1003", name: "资源巡检", status: "排队中", updated: "2024-10-01 10:00" },
];

const defaultUsers = [
  {
    username: "admin",
    displayName: "超级管理员",
    role: "super_admin",
    password: "xu12345678gh",
    isActive: true,
  },
];

let currentUser = null;
let users = [...defaultUsers];

const qs = (selector) => document.querySelector(selector);
const menuContainer = qs("#menu");
const consoleSection = qs("#console");
const loginView = qs("#login-view");
const contentPanels = document.querySelectorAll(".panel");

function renderClock() {
  qs("#clock").textContent = new Date().toLocaleString();
}

function renderUserInfo() {
  if (!currentUser) return;
  qs("#user-info").textContent = `${currentUser.username}（${RoleLabels[currentUser.role]}）`;
}

function renderTasks() {
  const tbody = qs("#task-rows");
  tbody.innerHTML = demoTasks
    .map(
      (task) => `
        <tr>
          <td>${task.id}</td>
          <td>${task.name}</td>
          <td>${task.status}</td>
          <td>${task.updated}</td>
        </tr>
      `
    )
    .join("");
}

function renderUsers() {
  const tbody = qs("#user-rows");
  tbody.innerHTML = users
    .map(
      (user) => `
        <tr>
          <td>${user.username}</td>
          <td>${user.displayName}</td>
          <td>${RoleLabels[user.role]}</td>
          <td>${user.isActive ? "启用" : "停用"}</td>
        </tr>
      `
    )
    .join("");
}

function buildMenu(role) {
  const base = [...PermissionMenus.base];
  let extra = [];

  if (role === "admin") {
    extra = PermissionMenus.admin;
  }
  if (role === "super_admin") {
    extra = [...PermissionMenus.admin, ...PermissionMenus.super_admin];
  }

  const menu = [...base];
  for (const item of extra) {
    const existing = menu.find((m) => m.key === item.key);
    if (existing && item.children) {
      existing.children = item.children;
    } else if (!existing) {
      menu.push(item);
    }
  }

  menuContainer.innerHTML = "";
  menu.forEach((item) => {
    const link = document.createElement("a");
    link.className = "menu-item";
    link.textContent = item.label;
    link.href = `#${item.key}`;
    link.addEventListener("click", (event) => handleMenuClick(event, item.key));

    if (item.children) {
      link.classList.add("parent");
      const wrapper = document.createElement("div");
      wrapper.appendChild(link);

      const childrenList = document.createElement("div");
      childrenList.className = "menu-children";
      item.children.forEach((child) => {
        const childLink = document.createElement("a");
        childLink.className = "menu-item";
        childLink.href = `#${child.key}`;
        childLink.textContent = child.label;
        childLink.addEventListener("click", (event) => handleMenuClick(event, child.key));
        childrenList.appendChild(childLink);
      });

      wrapper.appendChild(childrenList);
      menuContainer.appendChild(wrapper);
      return;
    }

    menuContainer.appendChild(link);
  });
}

function handleMenuClick(event, key) {
  event.preventDefault();
  if (!currentUser) return;

  const protectedMenus = ["users", "logs", "system"];
  if (protectedMenus.includes(key) && !["admin", "super_admin"].includes(currentUser.role)) {
    alert("当前角色无访问权限");
    return;
  }

  if (key === "system" && currentUser.role !== "super_admin") {
    alert("仅超级管理员可访问系统配置");
    return;
  }

  switchPanel(key);
}

function switchPanel(key) {
  contentPanels.forEach((panel) => panel.classList.remove("active"));

  const panel = qs(`#${key}`) || qs("#tasks");
  panel.classList.add("active");

  const menuLinks = menuContainer.querySelectorAll(".menu-item");
  menuLinks.forEach((link) => {
    const hrefKey = link.getAttribute("href").replace("#", "");
    link.classList.toggle("active", hrefKey === key);
  });
}

function login() {
  const username = qs("#username").value.trim();
  const password = qs("#password").value.trim();
  const role = qs("#role").value;

  const matchedUser = users.find((u) => u.username === username);
  if (!matchedUser || matchedUser.password !== password) {
    qs("#login-error").textContent = "用户名或密码不正确";
    return;
  }

  if (matchedUser.role !== role) {
    qs("#login-error").textContent = "角色选择与账户不一致";
    return;
  }

  currentUser = matchedUser;
  qs("#login-error").textContent = "";
  loginView.classList.add("hidden");
  consoleSection.classList.remove("hidden");
  qs("#app").style.alignItems = "stretch";
  qs("#app").style.justifyContent = "stretch";

  renderClock();
  renderUserInfo();
  renderTasks();
  renderUsers();
  buildMenu(currentUser.role);
  switchPanel("tasks");
}

function logout() {
  currentUser = null;
  qs("#password").value = "";
  qs("#login-error").textContent = "";
  consoleSection.classList.add("hidden");
  loginView.classList.remove("hidden");
  qs("#app").style.alignItems = "center";
  qs("#app").style.justifyContent = "center";
}

function bindEvents() {
  qs("#login-btn").addEventListener("click", login);
  qs("#logout-btn").addEventListener("click", logout);

  qs("#change-password-btn").addEventListener("click", () => switchPanel("account"));

  qs("#add-user").addEventListener("click", () => {
    if (!currentUser || !["admin", "super_admin"].includes(currentUser.role)) {
      qs("#user-form-error").textContent = "仅管理员及以上可创建用户";
      return;
    }

    const username = qs("#new-username").value.trim();
    const displayName = qs("#new-display").value.trim();
    const password = qs("#new-password").value.trim();
    const role = qs("#new-role").value;

    if (!username || !displayName || !password) {
      qs("#user-form-error").textContent = "请填写完整信息";
      return;
    }

    if (users.some((u) => u.username === username)) {
      qs("#user-form-error").textContent = "用户名已存在";
      return;
    }

    if (role === "super_admin" && currentUser.role !== "super_admin") {
      qs("#user-form-error").textContent = "仅超级管理员可创建超级管理员";
      return;
    }

    users.push({ username, displayName, password, role, isActive: true });
    qs("#user-form-error").textContent = "";
    qs("#new-username").value = "";
    qs("#new-display").value = "";
    qs("#new-password").value = "";
    renderUsers();
  });

  qs("#update-self-password").addEventListener("click", () => {
    if (!currentUser) return;
    const oldPwd = qs("#old-password").value.trim();
    const newPwd = qs("#new-self-password").value.trim();

    if (!oldPwd || !newPwd) {
      qs("#self-password-msg").textContent = "请填写完整密码信息";
      qs("#self-password-msg").classList.remove("success");
      qs("#self-password-msg").classList.add("error");
      return;
    }

    if (currentUser.password !== oldPwd) {
      qs("#self-password-msg").textContent = "旧密码不正确";
      qs("#self-password-msg").classList.remove("success");
      qs("#self-password-msg").classList.add("error");
      return;
    }

    currentUser.password = newPwd;
    qs("#self-password-msg").textContent = "密码已更新（仅本地演示）";
    qs("#self-password-msg").classList.remove("error");
    qs("#self-password-msg").classList.add("success");
    qs("#old-password").value = "";
    qs("#new-self-password").value = "";
  });
}

function init() {
  bindEvents();
  renderClock();
  setInterval(renderClock, 1000);
  renderTasks();
  renderUsers();
}

document.addEventListener("DOMContentLoaded", init);
