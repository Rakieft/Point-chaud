let backofficeCurrentUser = null;
let backofficeNotifications = [];

function getBackofficeProfilePath(role) {
  if (role === "driver") return "./driver-profile.html";
  return "./staff-profile.html";
}

function initializeBackofficeMobileMenu() {
  const toggle = document.getElementById("admin-menu-toggle");
  const close = document.getElementById("admin-menu-close");
  const sidebar = document.getElementById("admin-sidebar");
  const overlay = document.getElementById("admin-sidebar-overlay");

  if (!toggle || !close || !sidebar || !overlay) return;

  const openMenu = () => {
    sidebar.classList.add("open");
    overlay.classList.add("visible");
    document.body.classList.add("admin-menu-open");
  };

  const closeMenu = () => {
    sidebar.classList.remove("open");
    overlay.classList.remove("visible");
    document.body.classList.remove("admin-menu-open");
  };

  toggle.addEventListener("click", openMenu);
  close.addEventListener("click", closeMenu);
  overlay.addEventListener("click", closeMenu);

  window.addEventListener("resize", () => {
    if (window.innerWidth > 1100) {
      closeMenu();
    }
  });
}

function backofficeStatusLabel(status) {
  const labels = {
    pending_validation: "En attente",
    awaiting_payment: "Paiement attendu",
    validated: "Validee",
    paid: "Payee",
    completed: "Retiree",
    cancelled: "Refusee",
    pending_assignment: "En attente d'affectation",
    assigned: "Livreur assigne",
    out_for_delivery: "En livraison",
    return_to_branch: "Retour au point chaud",
    delivered: "Livree",
    pending: "A verifier",
    confirmed: "Confirme",
    rejected: "Rejete"
  };

  return labels[status] || status;
}

function backofficeUploadsBaseUrl() {
  return API_BASE_URL.replace("/api", "");
}

function backofficeInitials(name) {
  return (name || "ST")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join("");
}

function bindBackofficeProfileShortcut(profile) {
  const chip = document.querySelector(".admin-user-chip");
  if (!chip || !profile) return;
  if (chip.dataset.profileShortcutBound === "true") return;

  const profilePath = getBackofficeProfilePath(profile.role);
  const openProfile = () => {
    if (window.location.pathname.endsWith(profilePath.replace("./", "/"))) return;
    window.location.href = profilePath;
  };

  chip.dataset.profileShortcutBound = "true";
  chip.setAttribute("role", "link");
  chip.setAttribute("tabindex", "0");
  chip.setAttribute("aria-label", "Ouvrir mon profil");

  chip.addEventListener("click", openProfile);
  chip.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openProfile();
    }
  });
}

function ensureBackofficeHeaderTools() {
  const header = document.querySelector(".admin-header");
  if (!header) return null;

  let tools = header.querySelector(".admin-header-tools");
  const chip = header.querySelector(".admin-user-chip");

  if (!tools) {
    tools = document.createElement("div");
    tools.className = "admin-header-tools";
    if (chip) {
      header.insertBefore(tools, chip);
      tools.appendChild(chip);
    } else {
      header.appendChild(tools);
    }
  } else if (chip && chip.parentElement !== tools) {
    tools.appendChild(chip);
  }

  return tools;
}

function ensureBackofficeNotificationsButton() {
  const tools = ensureBackofficeHeaderTools();
  if (!tools) return null;

  document.querySelectorAll("#header-notification-count").forEach(node => {
    node.closest("button")?.remove();
  });

  const buttons = [...document.querySelectorAll("#admin-notifications-button")];
  let button = buttons[0] || null;

  if (buttons.length > 1) {
    buttons.slice(1).forEach(extraButton => extraButton.remove());
  }

  if (!button) {
    button = document.createElement("button");
    button.id = "admin-notifications-button";
    button.type = "button";
    button.className = "admin-icon-btn";
    button.innerHTML = `
      <span aria-hidden="true">Notifications</span>
      <span id="admin-notification-count" class="admin-notification-count">0</span>
    `;
    button.addEventListener("click", openBackofficeNotificationsModal);
  }

  if (button.parentElement !== tools) {
    tools.insertBefore(button, tools.firstChild);
  }

  return button;
}

function ensureBackofficeNotificationsModal() {
  let modal = document.getElementById("backoffice-notifications-modal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "backoffice-notifications-modal";
  modal.className = "admin-modal hidden";
  modal.innerHTML = `
    <div class="admin-modal-backdrop" data-backoffice-notification-close></div>
    <div class="admin-modal-card notification-modal-card">
      <div class="admin-modal-head">
        <div>
          <p class="admin-eyebrow">Notifications staff</p>
          <h2>Messages recus</h2>
        </div>
        <button class="btn-light" type="button" data-backoffice-notification-close>Fermer</button>
      </div>
      <div id="backoffice-notifications-list" class="notification-detail-stack"></div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelectorAll("[data-backoffice-notification-close]").forEach(element => {
    element.addEventListener("click", closeBackofficeNotificationsModal);
  });

  return modal;
}

function ensureNotificationDetailModal() {
  let modal = document.getElementById("notification-detail-modal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "notification-detail-modal";
  modal.className = "admin-modal hidden";
  modal.innerHTML = `
    <div class="admin-modal-backdrop" data-notification-detail-close></div>
    <div class="admin-modal-card notification-modal-card">
      <div class="admin-modal-head">
        <div>
          <p class="admin-eyebrow">Notification</p>
          <h2>Detail du message</h2>
        </div>
        <button class="btn-light" type="button" data-notification-detail-close>Fermer</button>
      </div>
      <div class="notification-detail-stack">
        <div class="admin-detail-panel">
          <small>Etat</small>
          <strong id="notification-detail-status">Nouveau</strong>
        </div>
        <div class="admin-detail-panel">
          <small>Recu le</small>
          <strong id="notification-detail-date">-</strong>
        </div>
        <div class="admin-detail-panel notification-detail-message-box">
          <small>Message</small>
          <strong id="notification-detail-message">-</strong>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.querySelectorAll("[data-notification-detail-close]").forEach(element => {
    element.addEventListener("click", closeNotificationDetailModal);
  });

  return modal;
}

function openNotificationDetail(notification) {
  const modal = ensureNotificationDetailModal();
  const statusEl = document.getElementById("notification-detail-status");
  const dateEl = document.getElementById("notification-detail-date");
  const messageEl = document.getElementById("notification-detail-message");

  if (statusEl) statusEl.textContent = notification.status || "Notification";
  if (dateEl) dateEl.textContent = notification.createdAtLabel || "-";
  if (messageEl) messageEl.textContent = notification.message || "Aucun detail disponible.";

  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeNotificationDetailModal() {
  const modal = document.getElementById("notification-detail-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function renderBackofficeNotificationsList() {
  const container = document.getElementById("backoffice-notifications-list");
  if (!container) return;

  container.innerHTML = backofficeNotifications.length
    ? backofficeNotifications
        .map(
          notification => `
            <button
              class="notification-item notification-item-button"
              type="button"
              data-backoffice-notification-id="${notification.id}"
              data-backoffice-notification-status="${notification.is_read ? "Lu" : "Nouveau"}"
              data-backoffice-notification-message="${encodeURIComponent(notification.message || "")}"
              data-backoffice-notification-date="${encodeURIComponent(formatTimestamp(notification.created_at))}">
              <strong>${notification.is_read ? "Lu" : "Nouveau"}</strong>
              <span>${notification.message}</span>
              <small>${formatTimestamp(notification.created_at)}</small>
            </button>
          `
        )
        .join("")
    : `<div class="empty-state"><p>Aucune notification pour l'instant.</p></div>`;

  container.querySelectorAll("[data-backoffice-notification-id]").forEach(button => {
    button.addEventListener("click", () => {
      const notificationId = Number(button.dataset.backofficeNotificationId);
      openNotificationDetail({
        id: notificationId,
        status: button.dataset.backofficeNotificationStatus,
        message: decodeURIComponent(button.dataset.backofficeNotificationMessage || ""),
        createdAtLabel: decodeURIComponent(button.dataset.backofficeNotificationDate || "")
      });
      markBackofficeNotificationAsRead(notificationId, button);
    });
  });
}

async function markBackofficeNotificationAsRead(notificationId, button) {
  if (!notificationId || button?.dataset.notificationRead === "true") return;

  try {
    await apiRequest(`/notifications/${notificationId}/read`, {
      method: "PATCH"
    });

    backofficeNotifications = backofficeNotifications.map(notification =>
      Number(notification.id) === Number(notificationId) ? { ...notification, is_read: true } : notification
    );

    if (button) {
      button.dataset.notificationRead = "true";
      button.dataset.backofficeNotificationStatus = "Lu";
      const label = button.querySelector("strong");
      if (label) label.textContent = "Lu";
    }

    const count = document.getElementById("admin-notification-count");
    if (count) {
      count.textContent = String(backofficeNotifications.filter(notification => !notification.is_read).length || 0);
    }
  } catch (error) {
    // Do not block notification reading if the state update fails.
  }
}

function openBackofficeNotificationsModal() {
  ensureBackofficeNotificationsModal();
  renderBackofficeNotificationsList();

  const modal = document.getElementById("backoffice-notifications-modal");
  if (!modal) return;
  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeBackofficeNotificationsModal() {
  const modal = document.getElementById("backoffice-notifications-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

async function loadBackofficeNotifications() {
  try {
    backofficeNotifications = await apiRequest("/notifications");
  } catch (error) {
    backofficeNotifications = [];
  }

  ensureBackofficeNotificationsButton();
  const count = document.getElementById("admin-notification-count");
  if (count) {
    count.textContent = String(backofficeNotifications.filter(notification => !notification.is_read).length || 0);
  }
}

async function loadBackofficeUser() {
  const user = requireAuth(["manager", "admin", "driver"]);
  if (!user) return null;

  initializeBackofficeMobileMenu();

  const profile = await apiRequest("/users/me");
  backofficeCurrentUser = profile;
  storage.user = profile;

  const nameEl = document.getElementById("admin-name");
  const avatarEl = document.getElementById("admin-avatar");
  const roleEl = document.getElementById("admin-role-label");

  if (nameEl) nameEl.textContent = profile.name;
  if (avatarEl) avatarEl.textContent = backofficeInitials(profile.name);
  if (roleEl) {
    roleEl.textContent =
      profile.role === "admin" ? "Administrateur" : profile.role === "driver" ? "Livreur" : "Manager";
  }

  bindBackofficeProfileShortcut(profile);
  ensureBackofficeNotificationsButton();
  await loadBackofficeNotifications();

  document.querySelectorAll(".admin-only").forEach(element => {
    element.style.display = profile.role === "admin" ? "" : "none";
  });

  document.querySelectorAll(".driver-hidden").forEach(element => {
    element.style.display = profile.role === "driver" ? "none" : "";
  });

  document.querySelectorAll(".driver-only").forEach(element => {
    element.style.display = profile.role === "driver" ? "" : "none";
  });

  document.querySelectorAll(".manager-admin-only").forEach(element => {
    element.style.display = profile.role === "driver" ? "none" : "";
  });

  return profile;
}

function openBackofficeOrderDetail(order) {
  const modal = document.getElementById("order-detail-modal");
  const title = document.getElementById("modal-order-title");
  const content = document.getElementById("order-detail-content");

  if (!modal || !content || !order) {
    return;
  }

  if (title) {
    title.textContent = `Commande #${order.id}`;
  }

  content.innerHTML = `
    <div class="admin-detail-grid">
      <section class="admin-detail-panel">
        <h4>Produits</h4>
        <div class="stack-sm">
          ${order.items
            .map(
              item => `
                <div class="line-item">
                  <strong>${item.name}</strong>
                  <span>${item.quantity} x ${formatMoney(item.price)}</span>
                </div>
              `
            )
            .join("")}
        </div>
      </section>

      <section class="admin-detail-panel">
        <h4>Client</h4>
        <div class="stack-sm">
          <span>${order.customer_name}</span>
          <span>${order.customer_email}</span>
          <span>${order.customer_phone || "Telephone non renseigne"}</span>
          <span>${order.location_name}</span>
        </div>
      </section>

      <section class="admin-detail-panel">
        <h4>Commande</h4>
        <div class="stack-sm">
          <span>Retrait: ${formatDateTime(order.pickup_date, order.pickup_time)}</span>
          <span>Total: ${formatMoney(order.total)}</span>
          <span>Statut: ${backofficeStatusLabel(order.status)}</span>
          <span>Paiement: ${
            order.status === "cancelled" ? "Non requis" : backofficeStatusLabel(order.payment_status)
          }</span>
          <span>Mode: ${order.order_type === "delivery" ? "Livraison" : "Retrait"}</span>
          ${
            order.order_type === "delivery"
              ? `
                <span>Adresse: ${order.delivery_address || "A renseigner"}</span>
                <span>Livreur: ${order.driver_name || "Non assigne"}</span>
                <span>Livraison: ${backofficeStatusLabel(order.delivery_status)}</span>
                ${order.return_note ? `<span>Motif retour: ${order.return_note}</span>` : ""}
              `
              : ""
          }
          <span>Manager validateur: ${order.validator_name || "Pas encore validee"}</span>
        </div>
      </section>

      <section class="admin-detail-panel">
        <h4>QR code</h4>
        ${
          order.qrCode
            ? `
              <div class="qr-box">
                <img src="${order.qrCode.image}" alt="QR commande ${order.id}" />
                <small>${order.qrCode.token}</small>
              </div>
            `
            : `<p class="muted">Le QR code sera visible apres confirmation du paiement.</p>`
        }
      </section>
    </div>
  `;

  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeOrderDetail() {
  const modal = document.getElementById("order-detail-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}
