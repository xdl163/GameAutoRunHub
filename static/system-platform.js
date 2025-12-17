(function () {
  const { initConsoleShell, requireRole } = window.ConsoleShared;

  document.addEventListener("DOMContentLoaded", () => {
    const user = initConsoleShell("platform_config");
    requireRole(user, ["super_admin"]);
  });
})();
