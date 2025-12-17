(function () {
  const { initConsoleShell, requireRole, RoleLabels, apiFetch } = window.ConsoleShared;

  function permittedStatusChange(actor, target) {
    if (actor.role === "super_admin") return true;
    return actor.role === "admin" && target.role === "user";
  }

  function permittedDelete(actor, target) {
    return permittedStatusChange(actor, target);
  }

  function permittedReset(actor, target) {
    if (actor.role === "super_admin") return true;
    return actor.role === "admin" && target.role === "user";
  }

  async function fetchUsers() {
    const resp = await apiFetch("/api/users");
    if (!resp.ok) throw new Error("加载用户失败");
    return resp.json();
  }

  async function refreshTable(currentUser) {
    const rows = document.querySelector("#user-rows");
    rows.innerHTML = "";
    const users = await fetchUsers();

    users.forEach((user) => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${user.username}</td>
        <td>${user.display_name}</td>
      `;

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
        select.addEventListener("change", async () => {
          select.disabled = true;
          try {
            const resp = await apiFetch(`/api/users/${user.id}/role`, {
              method: "PATCH",
              body: JSON.stringify({ role: select.value }),
            });
            if (!resp.ok) {
              const data = await resp.json().catch(() => ({}));
              alert(data.detail || "角色更新失败");
            }
          } finally {
            select.disabled = false;
            refreshTable(currentUser);
          }
        });
        roleCell.appendChild(select);
      } else {
        roleCell.textContent = RoleLabels[user.role];
      }
      tr.appendChild(roleCell);

      const statusCell = document.createElement("td");
      statusCell.textContent = user.is_active ? "启用" : "禁用";
      tr.appendChild(statusCell);

      const actionTd = document.createElement("td");
      const actions = document.createElement("div");
      actions.className = "row-actions";

      const resetBtn = document.createElement("button");
      resetBtn.className = "ghost";
      resetBtn.textContent = "重置密码";
      resetBtn.disabled = !permittedReset(currentUser, user);
      resetBtn.addEventListener("click", async () => {
        if (!permittedReset(currentUser, user)) return;
        resetBtn.disabled = true;
        try {
          const resp = await apiFetch(`/api/users/${user.id}/reset-password`, { method: "POST" });
          if (!resp.ok) {
            const data = await resp.json().catch(() => ({}));
            alert(data.detail || "重置失败");
            return;
          }
          const data = await resp.json();
          document.querySelector("#reset-result").textContent = data.new_password;
          openResetModal();
        } finally {
          resetBtn.disabled = false;
          refreshTable(currentUser);
        }
      });

      const toggleBtn = document.createElement("button");
      toggleBtn.className = "ghost";
      toggleBtn.textContent = user.is_active ? "禁用" : "启用";
      toggleBtn.disabled = !permittedStatusChange(currentUser, user);
      toggleBtn.addEventListener("click", async () => {
        if (!permittedStatusChange(currentUser, user)) return;
        toggleBtn.disabled = true;
        try {
          const resp = await apiFetch(`/api/users/${user.id}/status`, {
            method: "PATCH",
            body: JSON.stringify({ is_active: !user.is_active }),
          });
          if (!resp.ok) {
            const data = await resp.json().catch(() => ({}));
            alert(data.detail || "状态切换失败");
          }
        } finally {
          toggleBtn.disabled = false;
          refreshTable(currentUser);
        }
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "ghost";
      deleteBtn.textContent = "删除";
      deleteBtn.disabled = !permittedDelete(currentUser, user);
      deleteBtn.addEventListener("click", async () => {
        if (!permittedDelete(currentUser, user)) return;
        deleteBtn.disabled = true;
        try {
          const resp = await apiFetch(`/api/users/${user.id}`, { method: "DELETE" });
          if (!resp.ok) {
            const data = await resp.json().catch(() => ({}));
            alert(data.detail || "删除失败");
          }
        } finally {
          deleteBtn.disabled = false;
          refreshTable(currentUser);
        }
      });

      actions.appendChild(resetBtn);
      actions.appendChild(toggleBtn);
      actions.appendChild(deleteBtn);
      actionTd.appendChild(actions);
      tr.appendChild(actionTd);

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

    btn.addEventListener("click", async () => {
      const username = document.querySelector("#new-username").value.trim();
      const displayName = document.querySelector("#new-display").value.trim();
      const password = document.querySelector("#new-password").value.trim();
      const roleSelect = document.querySelector("#new-role");
      const role = roleSelect.value;

      if (!username || !displayName || !password) {
        error.textContent = "请填写完整信息";
        return;
      }

      if (currentUser.role !== "super_admin" && role !== "user") {
        error.textContent = "管理员仅能创建普通用户";
        return;
      }

      btn.disabled = true;
      try {
        const resp = await apiFetch("/api/users", {
          method: "POST",
          body: JSON.stringify({ username, display_name: displayName, password, role }),
        });
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          error.textContent = data.detail || "创建失败";
          return;
        }
        error.textContent = "";
        ["#new-username", "#new-display", "#new-password"].forEach((id) => {
          document.querySelector(id).value = "";
        });
        if (currentUser.role !== "super_admin") {
          roleSelect.value = "user";
        }
        closeModal();
        refreshTable(currentUser);
      } finally {
        btn.disabled = false;
      }
    });
  }

  function bindResetModal() {
    const modal = document.querySelector("#reset-modal");
    const closeBtn = document.querySelector("#close-reset");
    if (!modal || !closeBtn) return;
    closeBtn.addEventListener("click", () => modal.classList.remove("active"));
  }

  function openResetModal() {
    document.querySelector("#reset-modal")?.classList.add("active");
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const user = initConsoleShell("users");
    if (!requireRole(user, ["admin", "super_admin"])) return;
    const roleSelect = document.querySelector("#new-role");
    if (user.role !== "super_admin" && roleSelect) {
      roleSelect.value = "user";
      roleSelect.disabled = true;
    }
    await refreshTable(user);
    bindCreate(user);
    bindResetModal();
  });
})();
