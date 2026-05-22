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

function navigateToClientProfile() {
  if (window.location.pathname.endsWith("/client-profile.html")) return;
  window.location.href = "./client-profile.html";
}

function bindClientProfileShortcuts() {
  document.querySelectorAll(".client-topbar-user, .client-sidebar-user").forEach(element => {
    if (element.dataset.profileShortcutBound === "true") return;

    element.dataset.profileShortcutBound = "true";
    element.setAttribute("role", "link");
    element.setAttribute("tabindex", "0");
    element.setAttribute("aria-label", "Ouvrir mon profil");

    element.addEventListener("click", navigateToClientProfile);
    element.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        navigateToClientProfile();
      }
    });
  });
}

let clientShellInitPromise = null;

async function initClientShell() {
  if (!document.body.classList.contains("client-body")) return null;

  if (clientShellInitPromise) {
    return clientShellInitPromise;
  }

  clientShellInitPromise = (async () => {
    const user = requireAuth(["client"]);
    if (!user) {
      clientShellInitPromise = null;
      return null;
    }

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
      element.textContent = user.phone || "Téléphone non renseigné";
  });
    avatarElements.forEach(element => {
      element.textContent = getClientInitials(user.name);
    });

    bindClientMenu();
    bindClientProfileShortcuts();
    document.querySelectorAll(".client-sidebar-nav a").forEach(link => {
      if (link.dataset.clientMenuBound === "true") return;
      link.dataset.clientMenuBound = "true";
      link.addEventListener("click", () => {
        if (window.innerWidth <= 980) {
          closeClientMenu();
        }
      });
    });

    return user;
  })();

  return clientShellInitPromise;
}

window.initClientShell = initClientShell;

document.addEventListener("DOMContentLoaded", () => {
  initClientShell();
});
