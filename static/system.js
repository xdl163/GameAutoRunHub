(function () {
  const { initConsoleShell, requireRole } = window.ConsoleShared;

  document.addEventListener("DOMContentLoaded", () => {
    const user = initConsoleShell("system");
    if (!requireRole(user, ["super_admin"])) return;
  });
})();
