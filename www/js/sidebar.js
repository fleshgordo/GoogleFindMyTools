document.addEventListener("DOMContentLoaded", function () {
  const sidebar = document.getElementById("sidebar");
  const sidebarToggle = document.getElementById("sidebar-toggle");

  sidebarToggle.addEventListener("click", function () {
    if (sidebar.classList.contains("sidebar-expanded")) {
      sidebar.classList.remove("sidebar-expanded");
      sidebar.classList.add("sidebar-collapsed");
    } else {
      sidebar.classList.remove("sidebar-collapsed");
      sidebar.classList.add("sidebar-expanded");
    }

    // Trigger a resize event to make sure the map adjusts
    window.dispatchEvent(new Event("resize"));
  });
});
