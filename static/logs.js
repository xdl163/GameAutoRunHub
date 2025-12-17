(function () {
  const { initConsoleShell, requireRole, apiFetch } = window.ConsoleShared;

  async function fetchLogs() {
    const resp = await apiFetch("/api/logs/account");
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

  async function refresh() {
    try {
      const logs = await fetchLogs();
      renderLogs(logs);
    } catch (err) {
      console.error(err);
      alert("加载日志失败");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const user = initConsoleShell("logs");
    if (!requireRole(user, ["admin", "super_admin"])) return;

    document.querySelector("#refresh-logs")?.addEventListener("click", refresh);
    refresh();
  });
})();
