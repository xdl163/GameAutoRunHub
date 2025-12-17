(function () {
  const { initConsoleShell, loadUsers, saveUsers, getCurrentUser, setCurrentUser } = window.ConsoleShared;

  function bindUpdatePassword() {
    const btn = document.querySelector("#update-self-password");
    const message = document.querySelector("#self-password-msg");
    btn.addEventListener("click", () => {
      const oldPwd = document.querySelector("#old-password").value.trim();
      const newPwd = document.querySelector("#new-self-password").value.trim();
      const current = getCurrentUser();

      if (!oldPwd || !newPwd) {
        message.textContent = "请填写完整密码信息";
        message.classList.remove("success");
        message.classList.add("error");
        return;
      }

      if (current.password !== oldPwd) {
        message.textContent = "旧密码不正确";
        message.classList.remove("success");
        message.classList.add("error");
        return;
      }

      const users = loadUsers();
      const idx = users.findIndex((u) => u.username === current.username);
      if (idx >= 0) {
        users[idx].password = newPwd;
        saveUsers(users);
        setCurrentUser(users[idx]);
      }

      message.textContent = "密码已更新（仅本地演示）";
      message.classList.remove("error");
      message.classList.add("success");
      document.querySelector("#old-password").value = "";
      document.querySelector("#new-self-password").value = "";
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initConsoleShell("account");
    bindUpdatePassword();
  });
})();
