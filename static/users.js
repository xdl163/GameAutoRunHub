(function () {
  const { initConsoleShell, requireRole, loadUsers, saveUsers, RoleLabels } = window.ConsoleShared;

  function renderUsers() {
    const rows = document.querySelector("#user-rows");
    const users = loadUsers();
    rows.innerHTML = users
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

  function bindCreate(user) {
    const btn = document.querySelector("#add-user");
    const error = document.querySelector("#user-form-error");
    btn.addEventListener("click", () => {
      const username = document.querySelector("#new-username").value.trim();
      const displayName = document.querySelector("#new-display").value.trim();
      const password = document.querySelector("#new-password").value.trim();
      const role = document.querySelector("#new-role").value;

      if (!username || !displayName || !password) {
        error.textContent = "请填写完整信息";
        return;
      }

      const users = loadUsers();
      if (users.some((u) => u.username === username)) {
        error.textContent = "用户名已存在";
        return;
      }

      if (role === "super_admin" && user.role !== "super_admin") {
        error.textContent = "仅超级管理员可创建超级管理员";
        return;
      }

      users.push({ username, displayName, password, role, isActive: true });
      saveUsers(users);
      error.textContent = "";
      document.querySelector("#new-username").value = "";
      document.querySelector("#new-display").value = "";
      document.querySelector("#new-password").value = "";
      renderUsers();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const user = initConsoleShell("users");
    if (!requireRole(user, ["admin", "super_admin"])) return;
    renderUsers();
    bindCreate(user);
  });
})();
