(function () {
  const { initConsoleShell, requireRole, apiFetch } = window.ConsoleShared;

  async function loadConfig() {
    const resp = await apiFetch("/api/system/global");
    if (!resp.ok) throw new Error("加载配置失败");
    return resp.json();
  }

  async function saveConfig(payload) {
    const resp = await apiFetch("/api/system/global", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error("保存失败");
    return resp.json();
  }

  function bindForm() {
    const form = document.querySelector("#global-config-form");
    const scoreInput = document.querySelector("#score-rate");
    const multiplierInput = document.querySelector("#multiplier");
    const statusEl = document.querySelector("#form-status");

    if (!form || !scoreInput || !multiplierInput) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      statusEl.textContent = "保存中...";
      try {
        const payload = {
          default_score_rate: Number(scoreInput.value),
          default_multiplier: Number(multiplierInput.value),
        };
        const data = await saveConfig(payload);
        scoreInput.value = data.default_score_rate;
        multiplierInput.value = data.default_multiplier;
        statusEl.textContent = "保存成功";
      } catch (err) {
        console.error(err);
        statusEl.textContent = "保存失败，请重试";
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const user = initConsoleShell("system");
    if (!requireRole(user, ["admin", "super_admin"])) return;

    try {
      const data = await loadConfig();
      document.querySelector("#score-rate").value = data.default_score_rate;
      document.querySelector("#multiplier").value = data.default_multiplier;
    } catch (err) {
      console.error(err);
      const statusEl = document.querySelector("#form-status");
      if (statusEl) statusEl.textContent = "加载配置失败";
    }

    bindForm();
  });
})();
