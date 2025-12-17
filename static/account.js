(function () {
  const { initConsoleShell, apiFetch } = window.ConsoleShared;

  function bindUpdatePassword() {
    const btn = document.querySelector("#update-self-password");
    const message = document.querySelector("#self-password-msg");
    btn.addEventListener("click", async () => {
      const oldPwd = document.querySelector("#old-password").value.trim();
      const newPwd = document.querySelector("#new-self-password").value.trim();

      if (!oldPwd || !newPwd) {
        message.textContent = "请填写完整密码信息";
        message.classList.remove("success");
        message.classList.add("error");
        return;
      }

      message.textContent = "";
      btn.disabled = true;
      try {
        const resp = await apiFetch("/api/users/password", {
          method: "PATCH",
          body: JSON.stringify({ new_password: newPwd, old_password: oldPwd }),
        });
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          message.textContent = data.detail || "密码修改失败";
          message.classList.remove("success");
          message.classList.add("error");
          return;
        }
        message.textContent = "密码已更新";
        message.classList.remove("error");
        message.classList.add("success");
        document.querySelector("#old-password").value = "";
        document.querySelector("#new-self-password").value = "";
      } finally {
        btn.disabled = false;
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initConsoleShell("account");
    bindUpdatePassword();
  });
})();
