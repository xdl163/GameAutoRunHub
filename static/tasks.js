(function () {
  const { initConsoleShell, loadTasks } = window.ConsoleShared;

  function renderTasks() {
    const rows = document.querySelector("#task-rows");
    const tasks = loadTasks();
    rows.innerHTML = tasks
      .map(
        (task) => `
        <tr>
          <td>${task.id}</td>
          <td>${task.name}</td>
          <td>${task.status}</td>
          <td>${task.updated}</td>
        </tr>
      `
      )
      .join("");
  }

  document.addEventListener("DOMContentLoaded", () => {
    initConsoleShell("tasks");
    renderTasks();
  });
})();
