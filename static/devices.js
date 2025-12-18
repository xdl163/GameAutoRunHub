(function () {
  const { initConsoleShell, apiFetch } = window.ConsoleShared;

  const PlatformLabels = {
    android: "Android",
    ios: "iOS",
    emulator: "模拟器",
  };

  const StatusLabels = {
    idle: "空闲",
    running: "运行中",
    shutdown: "已关机",
    error: "异常",
  };

  let currentUser = null;
  let editingId = null;
  let devicesCache = [];
  let userOptionsCache = [];
  let userOptionsPromise = null;

  function canManage() {
    return ["admin", "super_admin"].includes(currentUser?.role);
  }

  async function fetchDevices() {
    const params = new URLSearchParams();
    const deviceId = document.querySelector("#filter-device-id").value.trim();
    const taskIdRaw = document.querySelector("#filter-task-id").value.trim();
    const status = document.querySelector("#filter-status").value;
    const creatorUsername = document.querySelector("#filter-username")?.value.trim();

    const taskId = Number.parseInt(taskIdRaw, 10);

    if (deviceId) params.set("device_id", deviceId);
    if (!Number.isNaN(taskId)) params.set("task_id", taskId);
    if (status) params.set("status", status);
    if (creatorUsername && canManage()) params.set("username", creatorUsername);

    const resp = await apiFetch(`/api/devices?${params.toString()}`);
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.detail || "加载设备失败");
    }
    return resp.json();
  }

  function updateSummary(devices) {
    const summary = document.querySelector("#device-summary");
    const idleCount = devices.filter((d) => d.status === "idle").length;
    summary.textContent = `共 ${devices.length} 台设备，空闲 ${idleCount} 台`;
  }

  function renderDevices(devices) {
    const rows = document.querySelector("#device-rows");
    rows.innerHTML = "";

    if (!devices.length) {
      rows.innerHTML = `<tr><td colspan="8" style="text-align:center" class="muted">暂无数据</td></tr>`;
      return;
    }

    devices.forEach((device) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${device.device_id}</td>
        <td>${device.created_by_username || "-"}</td>
        <td>${PlatformLabels[device.platform] || device.platform}</td>
        <td>${StatusLabels[device.status] || device.status}</td>
        <td>${device.remark || "-"}</td>
        <td>${device.config || "-"}</td>
        <td>${device.updated_at ? new Date(device.updated_at).toLocaleString() : "-"}</td>
      `;

      const actionTd = document.createElement("td");
      const actions = document.createElement("div");
      actions.className = "row-actions";

      const editBtn = document.createElement("button");
      editBtn.className = "ghost";
      editBtn.textContent = "编辑";
      editBtn.disabled = !canManage();
      editBtn.addEventListener("click", () => openEditModal(device));

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "ghost";
      deleteBtn.textContent = "删除";
      deleteBtn.disabled = !canManage();
      deleteBtn.addEventListener("click", async () => {
        if (!canManage()) return;
        const taskFilter = document.querySelector("#filter-task-id")?.value.trim();
        const filterHint = taskFilter ? `（任务ID筛选：${taskFilter}）` : "";
        if (!confirm(`确认删除设备 ${device.device_id}${filterHint}吗？`)) return;
        deleteBtn.disabled = true;
        try {
          const resp = await apiFetch(`/api/devices/${device.id}`, { method: "DELETE" });
          if (!resp.ok) {
            const data = await resp.json().catch(() => ({}));
            alert(data.detail || "删除失败");
          } else {
            await refreshDevices();
          }
        } finally {
          deleteBtn.disabled = false;
        }
      });

      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);
      actionTd.appendChild(actions);
      tr.appendChild(actionTd);
      rows.appendChild(tr);
    });
  }

  async function refreshDevices() {
    const rows = document.querySelector("#device-rows");
    rows.innerHTML = `<tr><td colspan="8" style="text-align:center" class="muted">加载中...</td></tr>`;

    try {
      devicesCache = await fetchDevices();
      updateSummary(devicesCache);
      renderDevices(devicesCache);
    } catch (err) {
      rows.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#d93025">${err.message}</td></tr>`;
    }
  }

  async function handleCreate() {
    const errorEl = document.querySelector("#create-device-error");
    errorEl.textContent = "";

    const deviceId = document.querySelector("#create-device-id").value.trim();
    const platform = document.querySelector("#create-device-platform").value;
    const remark = document.querySelector("#create-device-remark").value.trim();
    const config = document.querySelector("#create-device-config").value.trim();

    if (!deviceId) {
      errorEl.textContent = "请输入设备ID";
      return;
    }

    const btn = document.querySelector("#submit-create-device");
    btn.disabled = true;
    try {
      const resp = await apiFetch("/api/devices", {
        method: "POST",
        body: JSON.stringify({ device_id: deviceId, platform, remark, config }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        errorEl.textContent = data.detail || "创建失败";
        return;
      }
      document.querySelector("#create-device-id").value = "";
      document.querySelector("#create-device-remark").value = "";
      document.querySelector("#create-device-config").value = "";
      closeCreateModal();
      await refreshDevices();
    } finally {
      btn.disabled = false;
    }
  }

  function openCreateModal() {
    document.querySelector("#create-device-error").textContent = "";
    document.querySelector("#create-device-id").value = "";
    document.querySelector("#create-device-remark").value = "";
    document.querySelector("#create-device-config").value = "";
    document.querySelector("#create-modal").classList.add("active");
  }

  function closeCreateModal() {
    document.querySelector("#create-modal").classList.remove("active");
  }

  function openEditModal(device) {
    if (!canManage()) return;
    editingId = device.id;
    document.querySelector("#edit-platform").value = device.platform;
    document.querySelector("#edit-status").value = device.status;
    document.querySelector("#edit-remark").value = device.remark || "";
    document.querySelector("#edit-config").value = device.config || "";
    document.querySelector("#edit-error").textContent = "";
    document.querySelector("#device-modal").classList.add("active");
  }

  function closeEditModal() {
    document.querySelector("#device-modal").classList.remove("active");
    editingId = null;
  }

  async function handleUpdate() {
    if (!editingId) return;
    const errorEl = document.querySelector("#edit-error");
    errorEl.textContent = "";

    const platform = document.querySelector("#edit-platform").value;
    const status = document.querySelector("#edit-status").value;
    const remark = document.querySelector("#edit-remark").value.trim();
    const config = document.querySelector("#edit-config").value.trim();

    const btn = document.querySelector("#save-device");
    btn.disabled = true;
    try {
      const resp = await apiFetch(`/api/devices/${editingId}`, {
        method: "PUT",
        body: JSON.stringify({ platform, status, remark, config }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        errorEl.textContent = data.detail || "更新失败";
        return;
      }
      closeEditModal();
      await refreshDevices();
    } finally {
      btn.disabled = false;
    }
  }

  function bindEvents() {
    document.querySelector("#open-create-modal").addEventListener("click", openCreateModal);
    document.querySelector("#close-create-modal").addEventListener("click", closeCreateModal);
    document.querySelector("#submit-create-device").addEventListener("click", handleCreate);
    document.querySelector("#search-devices").addEventListener("click", refreshDevices);
    document.querySelector("#reset-filters").addEventListener("click", () => {
      document.querySelector("#filter-device-id").value = "";
      document.querySelector("#filter-task-id").value = "";
      document.querySelector("#filter-status").value = "";
      const usernameField = document.querySelector("#filter-username");
      if (usernameField) usernameField.value = "";
      const suggest = document.querySelector("#username-suggest");
      if (suggest) {
        suggest.innerHTML = "";
        suggest.classList.remove("active");
      }
      refreshDevices();
    });
    document.querySelector("#close-device-modal").addEventListener("click", closeEditModal);
    document.querySelector("#save-device").addEventListener("click", handleUpdate);
  }

  async function loadUserOptions() {
    if (userOptionsPromise) return userOptionsPromise;
    userOptionsPromise = (async () => {
      try {
        const resp = await apiFetch("/api/users/options");
        if (!resp.ok) throw new Error("加载用户列表失败");
        userOptionsCache = (await resp.json()) || [];
      } catch (err) {
        console.warn("加载用户选项失败", err);
        userOptionsCache = [];
      } finally {
        userOptionsPromise = null;
      }
      return userOptionsCache;
    })();
    return userOptionsPromise;
  }

  async function ensureUserOptions() {
    if (userOptionsCache.length) return userOptionsCache;
    return loadUserOptions();
  }

  function formatUsername(option) {
    if (!option) return "";
    return option.display_name ? `${option.display_name}（${option.username}）` : option.username;
  }

  function bindUsernameSuggest() {
    const input = document.querySelector("#filter-username");
    const list = document.querySelector("#username-suggest");
    if (!input || !list) return;

    const render = (options, keyword) => {
      const trimmed = (keyword || "").trim().toLowerCase();
      const filtered = options.filter((opt) => {
        const uname = (opt.username || "").toLowerCase();
        const display = (opt.display_name || "").toLowerCase();
        return !trimmed || uname.includes(trimmed) || display.includes(trimmed);
      });
      const displayList = filtered.length ? filtered : options;
      if (!displayList.length) {
        list.classList.remove("active");
        list.innerHTML = "";
        return;
      }
      list.innerHTML = displayList
        .slice(0, 8)
        .map((opt) => `<div class="suggestion-item" data-username="${opt.username}">${formatUsername(opt)}</div>`)
        .join("");
      list.classList.add("active");
    };

    const refreshList = async () => {
      const options = await ensureUserOptions();
      render(options, input.value);
    };

    input.addEventListener("input", refreshList);
    input.addEventListener("focus", refreshList);
    input.addEventListener("blur", () => setTimeout(() => list.classList.remove("active"), 150));
    list.addEventListener("click", (evt) => {
      const target = evt.target;
      const username = target?.dataset?.username;
      if (!username) return;
      input.value = username;
      list.classList.remove("active");
      refreshDevices();
    });
  }

  function bindFilterShortcuts() {
    const selectors = ["#filter-device-id", "#filter-username", "#filter-task-id"];
    selectors.forEach((selector) => {
      const el = document.querySelector(selector);
      if (!el) return;
      el.addEventListener("keydown", (evt) => {
        if (evt.key === "Enter") {
          refreshDevices();
        }
      });
    });

    const statusSelect = document.querySelector("#filter-status");
    if (statusSelect) {
      statusSelect.addEventListener("change", refreshDevices);
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    currentUser = initConsoleShell("devices");
    if (!currentUser) return;

    if (!canManage()) {
      const usernameField = document.querySelector("#filter-username-field");
      if (usernameField) usernameField.style.display = "none";
    }

    if (canManage()) {
      bindUsernameSuggest();
    }

    bindEvents();
    bindFilterShortcuts();
    await refreshDevices();
  });
})();
