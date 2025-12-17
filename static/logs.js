(function () {
  const { initConsoleShell, requireRole } = window.ConsoleShared;

  document.addEventListener("DOMContentLoaded", () => {
    const user = initConsoleShell("logs");
    if (!requireRole(user, ["admin", "super_admin"])) return;
  });
})();
