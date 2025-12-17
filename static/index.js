const DEFAULT_USERS = [
  {
    username: "admin",
    displayName: "超级管理员",
    role: "super_admin",
    password: "xu12345678gh",
    isActive: true,
  },
];

const STORAGE_KEYS = {
  users: "garh_users",
  current: "garh_current_user",
  tasks: "garh_tasks",
};

function ensureSeedData() {
  if (!localStorage.getItem(STORAGE_KEYS.users)) {
    localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(DEFAULT_USERS));
  }
  if (!localStorage.getItem(STORAGE_KEYS.tasks)) {
    localStorage.setItem(
      STORAGE_KEYS.tasks,
      JSON.stringify([
        { id: "T-1001", name: "每日构建", status: "已完成", updated: "2024-10-01 09:30" },
        { id: "T-1002", name: "冒烟测试", status: "运行中", updated: "2024-10-01 09:45" },
        { id: "T-1003", name: "资源巡检", status: "排队中", updated: "2024-10-01 10:00" },
      ])
    );
  }
}

function loadUsers() {
  const raw = localStorage.getItem(STORAGE_KEYS.users);
  return raw ? JSON.parse(raw) : [];
}

function saveCurrentUser(user) {
  localStorage.setItem(STORAGE_KEYS.current, JSON.stringify(user));
}

function login() {
  const username = document.querySelector("#username").value.trim();
  const password = document.querySelector("#password").value.trim();
  const errorEl = document.querySelector("#login-error");

  const users = loadUsers();
  const matched = users.find((u) => u.username === username);

  if (!matched || matched.password !== password) {
    errorEl.textContent = "用户名或密码不正确";
    return;
  }

  saveCurrentUser(matched);
  errorEl.textContent = "";
  window.location.href = "/tasks";
}

function init() {
  ensureSeedData();
  const btn = document.querySelector("#login-btn");
  btn.addEventListener("click", login);
  document.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter") {
      login();
    }
  });

  const current = localStorage.getItem(STORAGE_KEYS.current);
  if (current) {
    window.location.href = "/tasks";
  }
}

document.addEventListener("DOMContentLoaded", init);
