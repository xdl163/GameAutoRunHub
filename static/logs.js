(function () {
  const { initConsoleShell, requireRole, apiFetch } = window.ConsoleShared;

  function getPageConfig() {
    const body = document.body;
    return {
      endpoint: body.dataset.logEndpoint || "/api/logs/account",
      activeKey: body.dataset.activeKey || "logs",
      requiredRoles: (body.dataset.requiredRoles || "admin,super_admin").split(","),
      pageSize: Number.parseInt(body.dataset.pageSize || "20", 10) || 20,
    };
  }

  const state = {
    page: 1,
    pageSize: 20,
    total: 0,
  };

  async function fetchLogs(endpoint, page, pageSize) {
    const url = new URL(endpoint, window.location.origin);
    url.searchParams.set("page", page);
    url.searchParams.set("page_size", pageSize);
    const resp = await apiFetch(url.pathname + url.search);
    if (!resp.ok) throw new Error("日志获取失败");
    return resp.json();
  }

  function renderLogs(logs) {
    const tbody = document.querySelector("#log-rows");
    tbody.innerHTML = "";

    if (!logs.length) {
      const columnCount = document.querySelectorAll(".simple-table thead th")?.length || 1;
      const empty = document.createElement("tr");
      empty.innerHTML = `<td colspan="${columnCount}" class="muted" style="text-align:center">暂无数据</td>`;
      tbody.appendChild(empty);
      return;
    }

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

  function renderPagination() {
    const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
    const info = document.querySelector("#pagination-info");
    if (info) {
      info.textContent = `第 ${state.page} / ${totalPages} 页，共 ${state.total} 条记录`;
    }
    const prevBtn = document.querySelector("#prev-page");
    const nextBtn = document.querySelector("#next-page");
    if (prevBtn) prevBtn.disabled = state.page <= 1;
    if (nextBtn) nextBtn.disabled = state.page >= totalPages;
  }

  async function refresh(endpoint) {
    try {
      const data = await fetchLogs(endpoint, state.page, state.pageSize);
      const logs = Array.isArray(data) ? data : data?.items || [];
      state.total = typeof data?.total === "number" ? data.total : logs.length;
      renderLogs(logs);
      renderPagination();
    } catch (err) {
      console.error(err);
      alert("加载日志失败");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const config = getPageConfig();
    const user = initConsoleShell(config.activeKey);
    if (!requireRole(user, config.requiredRoles)) return;

    state.pageSize = config.pageSize;

    const handler = (resetPage = false) => {
      if (resetPage) state.page = 1;
      refresh(config.endpoint);
    };
    document.querySelector("#refresh-logs")?.addEventListener("click", () => handler(true));

    document.querySelector("#prev-page")?.addEventListener("click", () => {
      if (state.page <= 1) return;
      state.page -= 1;
      handler();
    });
    document.querySelector("#next-page")?.addEventListener("click", () => {
      const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
      if (state.page >= totalPages) return;
      state.page += 1;
      handler();
    });

    handler(true);
  });
})();
