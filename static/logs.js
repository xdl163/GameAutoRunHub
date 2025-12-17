(function () {
  const { initConsoleShell, requireRole, apiFetch } = window.ConsoleShared;

  function getPageConfig() {
    const body = document.body;
    return {
      endpoint: body.dataset.logEndpoint || "/api/logs/account",
      activeKey: body.dataset.activeKey || "logs",
      requiredRoles: (body.dataset.requiredRoles || "admin,super_admin").split(","),
    };
  }

  async function fetchLogs(endpoint) {
    const resp = await apiFetch(endpoint);
    if (!resp.ok) throw new Error("日志获取失败");
    return resp.json();
  }

  function renderLogs(logs) {
    const tbody = document.querySelector("#log-rows");
    tbody.innerHTML = "";

    logs.forEach((log) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${new Date(log.created_at).toLocaleString()}</td>
        <td>${log.performer_username || "-"}</td>
        <td>${log.target_username || "-"}</td>
        <td>${log.action}</td>
        <td>${log.detail || "-"}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  async function refresh(endpoint) {
    try {
      const logs = await fetchLogs(endpoint);
      renderLogs(logs);
    } catch (err) {
      console.error(err);
      alert("加载日志失败");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const config = getPageConfig();
    const user = initConsoleShell(config.activeKey);
    if (!requireRole(user, config.requiredRoles)) return;

    const handler = () => refresh(config.endpoint);
    document.querySelector("#refresh-logs")?.addEventListener("click", handler);
    handler();
  });
})();
