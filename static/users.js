(function () {
  const { initConsoleShell, requireRole, loadUsers, saveUsers, RoleLabels } = window.ConsoleShared;

  function permittedStatusChange(actor, target) {
    if (actor.role === "super_admin") return true;
    return actor.role === "admin" && target.role === "user";
  }

  function permittedDelete(actor, target) {
    return permittedStatusChange(actor, target);
  }

  function renderUsers(currentUser) {
    const rows = document.querySelector("#user-rows");
    const users = loadUsers();
    rows.innerHTML = "";

    users.forEach((user) => {
      const tr = document.createElement("tr");

      const roleCell = document.createElement("td");
      if (currentUser.role === "super_admin") {
        const select = document.createElement("select");
        [
          { value: "user", label: RoleLabels.user },
          { value: "admin", label: RoleLabels.admin },
          { value: "super_admin", label: RoleLabels.super_admin },
        ].forEach((opt) => {
          const option = document.createElement("option");
          option.value = opt.value;
          option.textContent = opt.label;
          if (opt.value === user.role) option.selected = true;
          select.appendChild(option);
        });
        select.addEventListener("change", () => {
          const updated = loadUsers().map((u) => (u.username === user.username ? { ...u, role: select.value } : u));
          saveUsers(updated);
          renderUsers(currentUser);
        });
        roleCell.appendChild(select);
      } else {
        roleCell.textContent = RoleLabels[user.role];
      }

      const statusBtn = document.createElement("button");
      statusBtn.className = "ghost";
      statusBtn.textContent = user.isActive ? "禁用" : "启用";
      statusBtn.disabled = !permittedStatusChange(currentUser, user);
      statusBtn.addEventListener("click", () => {
        if (!permittedStatusChange(currentUser, user)) return;
        const updated = loadUsers().map((u) =>
          u.username === user.username ? { ...u, isActive: !u.isActive } : u
        );
        saveUsers(updated);
        renderUsers(currentUser);
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "ghost";
      deleteBtn.textContent = "删除";
      deleteBtn.disabled = !permittedDelete(currentUser, user);
      deleteBtn.addEventListener("click", () => {
        if (!permittedDelete(currentUser, user)) return;
        const updated = loadUsers().filter((u) => u.username !== user.username);
        saveUsers(updated);
        renderUsers(currentUser);
      });

      const actions = document.createElement("div");
      actions.className = "row-actions";
      const statusChip = document.createElement("span");
      statusChip.className = `status-chip ${user.isActive ? "active" : "inactive"}`;
      statusChip.textContent = user.isActive ? "启用" : "停用";
      actions.appendChild(statusChip);
      actions.appendChild(statusBtn);
      actions.appendChild(deleteBtn);

      tr.innerHTML = `
        <td>${user.username}</td>
        <td>${user.displayName}</td>
      `;
      tr.appendChild(roleCell);
      tr.appendChild(document.createElement("td")).appendChild(actions.cloneNode(true));

      // replace actions cell content after clone to keep references
      const actionTd = tr.lastChild;
      actionTd.innerHTML = "";
      actionTd.appendChild(actions);

      const statusCell = document.createElement("td");
      statusCell.appendChild(statusChip.cloneNode(true));
      // Insert status cell before actions
      tr.insertBefore(statusCell, actionTd);

      rows.appendChild(tr);
    });
  }

  function openModal() {
    document.querySelector("#user-modal").classList.add("active");
  }

  function closeModal() {
    document.querySelector("#user-modal").classList.remove("active");
  }

  function bindCreate(currentUser) {
    const btn = document.querySelector("#add-user");
    const error = document.querySelector("#user-form-error");
    const openBtn = document.querySelector("#open-create");
    const closeBtn = document.querySelector("#close-modal");

    if (openBtn) openBtn.addEventListener("click", openModal);
    if (closeBtn) closeBtn.addEventListener("click", () => {
      error.textContent = "";
      closeModal();
    });

    btn.addEventListener("click", () => {
      const username = document.querySelector("#new-username").value.trim();
      const displayName = document.querySelector("#new-display").value.trim();
      const password = document.querySelector("#new-password").value.trim();
      const roleSelect = document.querySelector("#new-role");
      const role = roleSelect.value;

      if (!username || !displayName || !password) {
        error.textContent = "请填写完整信息";
        return;
      }

      const users = loadUsers();
      if (users.some((u) => u.username === username)) {
        error.textContent = "用户名已存在";
        return;
      }

      if (currentUser.role !== "super_admin" && role !== "user") {
        error.textContent = "管理员仅能创建普通用户";
        return;
      }

      users.push({ username, displayName, password, role, isActive: true });
      saveUsers(users);
      error.textContent = "";
      ["#new-username", "#new-display", "#new-password"].forEach((id) => {
        document.querySelector(id).value = "";
      });
      if (currentUser.role !== "super_admin") {
        roleSelect.value = "user";
      }
      closeModal();
      renderUsers(currentUser);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const user = initConsoleShell("users");
    if (!requireRole(user, ["admin", "super_admin"])) return;
    const roleSelect = document.querySelector("#new-role");
    if (user.role !== "super_admin" && roleSelect) {
      roleSelect.value = "user";
      roleSelect.disabled = true;
    }
    renderUsers(user);
    bindCreate(user);
  });
})();
