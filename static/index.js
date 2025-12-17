function saveSession(session) {
  localStorage.setItem("garh_session", JSON.stringify(session));
}

async function login() {
  const username = document.querySelector("#username").value.trim();
  const password = document.querySelector("#password").value.trim();
  const errorEl = document.querySelector("#login-error");

  if (!username || !password) {
    errorEl.textContent = "请输入用户名和密码";
    return;
  }

  try {
    const resp = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      errorEl.textContent = data.detail || "登录失败";
      return;
    }

    const data = await resp.json();
    saveSession(data);
    errorEl.textContent = "";
    window.location.href = "/tasks";
  } catch (err) {
    console.error(err);
    errorEl.textContent = "无法连接服务器";
  }
}

function init() {
  const btn = document.querySelector("#login-btn");
  btn.addEventListener("click", login);
  document.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter") {
      login();
    }
  });

  const sessionRaw = localStorage.getItem("garh_session");
  if (sessionRaw) {
    const session = JSON.parse(sessionRaw);
    // 确认令牌仍然有效再跳转，避免无效会话造成重定向噪声
    fetch("/api/health", {
      headers: { Authorization: `Bearer ${session.token}` },
    })
      .then((resp) => {
        if (resp.ok) {
          window.location.href = "/tasks";
        } else if (resp.status === 401) {
          localStorage.removeItem("garh_session");
        }
      })
      .catch(() => {
        localStorage.removeItem("garh_session");
      });
  }
}

document.addEventListener("DOMContentLoaded", init);
