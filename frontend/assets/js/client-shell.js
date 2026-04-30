function getClientInitials(name) {
  return (name || "CL")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join("");
}

function closeClientMenu() {
  const sidebar = document.getElementById("client-sidebar");
  const overlay = document.getElementById("client-sidebar-overlay");

  sidebar?.classList.remove("open");
  overlay?.classList.remove("visible");
  document.body.classList.remove("client-menu-open");
}

function openClientMenu() {
  const sidebar = document.getElementById("client-sidebar");
  const overlay = document.getElementById("client-sidebar-overlay");

  sidebar?.classList.add("open");
  overlay?.classList.add("visible");
  document.body.classList.add("client-menu-open");
}

function bindClientMenu() {
  const toggle = document.getElementById("client-menu-toggle");
  const overlay = document.getElementById("client-sidebar-overlay");
  const closeBtn = document.getElementById("client-menu-close");

  toggle?.addEventListener("click", openClientMenu);
  overlay?.addEventListener("click", closeClientMenu);
  closeBtn?.addEventListener("click", closeClientMenu);
}

async function initClientShell() {
  if (!document.body.classList.contains("client-body")) return null;

  const user = requireAuth(["client"]);
  if (!user) return null;

  const nameElements = document.querySelectorAll("[data-client-name]");
  const emailElements = document.querySelectorAll("[data-client-email]");
  const phoneElements = document.querySelectorAll("[data-client-phone]");
  const avatarElements = document.querySelectorAll("[data-client-avatar]");

  nameElements.forEach(element => {
    element.textContent = user.name || "Client";
  });
  emailElements.forEach(element => {
    element.textContent = user.email || "";
  });
  phoneElements.forEach(element => {
    element.textContent = user.phone || "Telephone non renseigne";
  });
  avatarElements.forEach(element => {
    element.textContent = getClientInitials(user.name);
  });

  bindClientMenu();
  document.querySelectorAll(".client-sidebar-nav a").forEach(link => {
    link.addEventListener("click", () => {
      if (window.innerWidth <= 980) {
        closeClientMenu();
      }
    });
  });

  return user;
}
