let backofficeCurrentUser = null;
let backofficeNotifications = [];
let deliverySignatureResolver = null;
let deliverySignaturePadReady = false;
let deliverySignatureDrawing = false;
let deliverySignatureContext = null;

function extractOrderIdFromNotificationMessage(message) {
  const match = String(message || "").match(/(?:commande|livraison)\s*#(\d+)/i);
  return match ? Number(match[1]) : null;
}

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

function ensureDeliverySignatureModal() {
  let modal = document.getElementById("delivery-signature-modal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "delivery-signature-modal";
  modal.className = "admin-modal hidden";
  modal.innerHTML = `
    <div class="admin-modal-backdrop" data-delivery-signature-close></div>
    <div class="admin-modal-card delivery-signature-modal-card">
      <div class="admin-modal-head">
        <div>
          <p class="admin-eyebrow">Preuve de remise</p>
          <h2 id="delivery-signature-title">Signature du client</h2>
        </div>
        <button class="btn-light" type="button" data-delivery-signature-close>Fermer</button>
      </div>
      <div class="stack">
        <div id="delivery-signature-message" class="message-box"></div>
        <label>
          Nom du client qui signe
          <input id="delivery-signature-name" type="text" placeholder="Nom complet du client" />
        </label>
        <div class="delivery-signature-pad-shell">
          <div class="delivery-signature-pad-head">
            <strong>Signature manuscrite</strong>
            <small>Demande au client de signer dans la zone ci-dessous.</small>
          </div>
          <canvas id="delivery-signature-canvas" class="delivery-signature-canvas"></canvas>
          <div class="delivery-signature-pad-actions">
            <button id="delivery-signature-clear" class="btn btn-light" type="button">Effacer</button>
          </div>
        </div>
        <div class="delivery-signature-actions">
          <button class="btn btn-light" type="button" data-delivery-signature-close>Annuler</button>
          <button id="delivery-signature-save" class="btn admin-btn-success" type="button">Valider la remise</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.querySelectorAll("[data-delivery-signature-close]").forEach(element => {
    element.addEventListener("click", () => closeDeliverySignatureModal(null));
  });

  initializeDeliverySignaturePad(modal);
  return modal;
}

function resetDeliverySignatureCanvas() {
  const canvas = document.getElementById("delivery-signature-canvas");
  if (!canvas || !deliverySignatureContext) return;

  const width = canvas.width / (window.devicePixelRatio || 1);
  const height = canvas.height / (window.devicePixelRatio || 1);
  deliverySignatureContext.fillStyle = "#ffffff";
  deliverySignatureContext.fillRect(0, 0, width, height);
  deliverySignatureContext.strokeStyle = "#7f1d1d";
  deliverySignatureContext.lineWidth = 2.5;
  deliverySignatureContext.lineCap = "round";
  deliverySignatureContext.lineJoin = "round";
  canvas.dataset.hasStroke = "false";
}

function resizeDeliverySignatureCanvas() {
  const canvas = document.getElementById("delivery-signature-canvas");
  if (!canvas) return;

  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const width = canvas.clientWidth || 320;
  const height = canvas.clientHeight || 180;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  deliverySignatureContext = canvas.getContext("2d");
  deliverySignatureContext.setTransform(ratio, 0, 0, ratio, 0, 0);
  resetDeliverySignatureCanvas();
}

function getDeliverySignaturePoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function initializeDeliverySignaturePad(modal) {
  if (deliverySignaturePadReady) return;

  const canvas = modal.querySelector("#delivery-signature-canvas");
  const clearButton = modal.querySelector("#delivery-signature-clear");
  if (!canvas || !clearButton) return;

  resizeDeliverySignatureCanvas();

  canvas.addEventListener("pointerdown", event => {
    deliverySignatureDrawing = true;
    const point = getDeliverySignaturePoint(canvas, event);
    deliverySignatureContext.beginPath();
    deliverySignatureContext.moveTo(point.x, point.y);
    canvas.dataset.hasStroke = "true";
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", event => {
    if (!deliverySignatureDrawing) return;
    const point = getDeliverySignaturePoint(canvas, event);
    deliverySignatureContext.lineTo(point.x, point.y);
    deliverySignatureContext.stroke();
  });

  const stopDrawing = event => {
    if (!deliverySignatureDrawing) return;
    deliverySignatureDrawing = false;
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch (error) {
      // no-op
    }
  };

  canvas.addEventListener("pointerup", stopDrawing);
  canvas.addEventListener("pointerleave", stopDrawing);
  canvas.addEventListener("pointercancel", stopDrawing);
  clearButton.addEventListener("click", resetDeliverySignatureCanvas);
  window.addEventListener("resize", () => {
    if (!document.getElementById("delivery-signature-modal")?.classList.contains("hidden")) {
      resizeDeliverySignatureCanvas();
    }
  });

  deliverySignaturePadReady = true;
}

function closeDeliverySignatureModal(result) {
  const modal = document.getElementById("delivery-signature-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");

  const resolver = deliverySignatureResolver;
  deliverySignatureResolver = null;
  if (resolver) {
    resolver(result);
  }
}

function openDeliverySignatureModal(order) {
  const modal = ensureDeliverySignatureModal();
  const title = document.getElementById("delivery-signature-title");
  const nameInput = document.getElementById("delivery-signature-name");
  const saveButton = document.getElementById("delivery-signature-save");

  if (title) {
    title.textContent = order?.id
      ? `Signature du client pour la commande #${order.id}`
      : "Signature du client";
  }

  showMessage("delivery-signature-message", "info", "Fais signer le client avant de valider la remise.");
  if (nameInput) {
    nameInput.value = order?.customer_name || "";
  }

  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  window.requestAnimationFrame(() => {
    resizeDeliverySignatureCanvas();
    nameInput?.focus();
  });

  return new Promise(resolve => {
    deliverySignatureResolver = resolve;

    saveButton.onclick = () => {
      const canvas = document.getElementById("delivery-signature-canvas");
      const signatureName = String(nameInput?.value || "").trim();

      if (!signatureName) {
        showMessage("delivery-signature-message", "error", "Le nom du client est obligatoire.");
        return;
      }

      if (!canvas || canvas.dataset.hasStroke !== "true") {
        showMessage("delivery-signature-message", "error", "La signature du client est obligatoire.");
        return;
      }

      closeDeliverySignatureModal({
        signature_name: signatureName,
        signature_data: canvas.toDataURL("image/png")
      });
    };
  });
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
    button.addEventListener("click", async () => {
      const notificationId = Number(button.dataset.backofficeNotificationId);
      const notification = {
        id: notificationId,
        status: button.dataset.backofficeNotificationStatus,
        message: decodeURIComponent(button.dataset.backofficeNotificationMessage || ""),
        createdAtLabel: decodeURIComponent(button.dataset.backofficeNotificationDate || "")
      };

      await markBackofficeNotificationAsRead(notificationId, button);
      navigateFromBackofficeNotification(notification);
    });
  });
}

function getBackofficeNotificationTarget(notification) {
  const message = String(notification?.message || "").toLowerCase();
  const orderId = extractOrderIdFromNotificationMessage(notification?.message);
  const query = orderId ? `?orderId=${orderId}&fromNotification=1` : "";

  if (
    message.includes("preuve de paiement") ||
    message.includes("paiement confirme") ||
    message.includes("paiement rejete")
  ) {
    return `./orders-pending.html${query}${orderId ? "&focus=payments-section" : "?focus=payments-section"}`.replace(
      "?&",
      "?"
    );
  }

  if (
    message.includes("livraison") ||
    message.includes("livreur") ||
    message.includes("retour au point chaud") ||
    message.includes("reaffecte")
  ) {
    return `./deliveries.html${query}`;
  }

  if (
    message.includes("nouvelle commande") ||
    message.includes("validation") ||
    message.includes("commande #")
  ) {
    return `./orders-pending.html${query}`;
  }

  return null;
}

function navigateFromBackofficeNotification(notification) {
  const target = getBackofficeNotificationTarget(notification);

  if (target) {
    const orderId = extractOrderIdFromNotificationMessage(notification?.message);
    const [targetPath, targetQuery = ""] = target.split("?");
    const isSamePage = window.location.pathname.endsWith(targetPath.replace("./", "/"));

    closeBackofficeNotificationsModal();
    closeNotificationDetailModal();

    if (isSamePage) {
      const params = new URLSearchParams(targetQuery);
      const focus = params.get("focus");
      if (focus) {
        document.getElementById(focus)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }

      if (orderId && typeof window.openDeliveryDetail === "function" && targetPath.includes("deliveries")) {
        window.openDeliveryDetail(orderId);
        return;
      }

      if (orderId && typeof window.openOrderDetailById === "function" && targetPath.includes("orders-pending")) {
        window.openOrderDetailById(orderId);
        return;
      }
    }

    window.location.href = target;
    return;
  }

  openNotificationDetail(notification);
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

async function openBackofficeNotificationByKeyword(keyword = "") {
  if (!backofficeNotifications.length) {
    await loadBackofficeNotifications();
  }

  const normalizedKeyword = String(keyword || "").trim().toLowerCase();
  const match = normalizedKeyword
    ? backofficeNotifications.find(notification =>
        String(notification.message || "")
          .toLowerCase()
          .includes(normalizedKeyword)
      )
    : null;

  if (match) {
    openNotificationDetail({
      id: Number(match.id),
      status: match.is_read ? "Lu" : "Nouveau",
      message: match.message || "",
      createdAtLabel: formatTimestamp(match.created_at)
    });
    await markBackofficeNotificationAsRead(Number(match.id));
    return;
  }

  openBackofficeNotificationsModal();
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
                ${order.delivery_signature_name ? `<span>Signature recue: ${order.delivery_signature_name}</span>` : ""}
                ${order.delivery_signature_captured_at ? `<span>Signee le: ${formatTimestamp(order.delivery_signature_captured_at)}</span>` : ""}
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

      ${
        order.order_type === "delivery" && order.delivery_signature_data
          ? `
            <section class="admin-detail-panel">
              <h4>Signature de remise</h4>
              <div class="delivery-signature-proof">
                <strong>${order.delivery_signature_name || "Signature client"}</strong>
                <img src="${order.delivery_signature_data}" alt="Signature client commande ${order.id}" />
              </div>
            </section>
          `
          : ""
      }
    </div>
    <div class="card-actions admin-detail-actions">
      <button class="btn-primary" type="button" onclick="printKitchenOrderSheet(${order.id})">Imprimer fiche cuisine</button>
      <button class="btn-light" type="button" onclick="printClientReceiptFromBackoffice(${order.id})">Imprimer fiche client</button>
    </div>
  `;

  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function escapePrintHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function openPrintDocument(title, bodyMarkup) {
  const printWindow = window.open("", "_blank", "width=980,height=1280");
  if (!printWindow) return;

  printWindow.document.open();
  printWindow.document.write(`
    <!doctype html>
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <title>${escapePrintHtml(title)}</title>
        <style>
          :root {
            color-scheme: light;
            --ink: #261711;
            --muted: #75584b;
            --line: #d9c3b3;
            --accent: #d86628;
            --soft: #fff7f1;
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 24px;
            font-family: "Segoe UI", Arial, sans-serif;
            color: var(--ink);
            background: #fff;
          }
          .print-sheet {
            width: 100%;
            max-width: 820px;
            margin: 0 auto;
            border: 1px solid var(--line);
            border-radius: 18px;
            overflow: hidden;
            background: #fff;
          }
          .print-head {
            padding: 22px 24px 18px;
            background: linear-gradient(135deg, #3e160d 0%, #cf5c20 55%, #f08a46 100%);
            color: #fff;
          }
          .print-type {
            display: inline-flex;
            padding: 6px 12px;
            border-radius: 999px;
            background: rgba(255,255,255,0.16);
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.05em;
            text-transform: uppercase;
          }
          .print-head h1 {
            margin: 14px 0 6px;
            font-size: 32px;
            line-height: 1.05;
          }
          .print-head p {
            margin: 0;
            font-size: 14px;
            opacity: 0.92;
          }
          .print-body {
            padding: 22px 24px 26px;
          }
          .print-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 16px;
            margin-bottom: 18px;
          }
          .print-card {
            border: 1px solid var(--line);
            border-radius: 14px;
            padding: 14px 16px;
            background: var(--soft);
          }
          .print-card h2 {
            margin: 0 0 10px;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: var(--muted);
          }
          .print-card p,
          .print-card li,
          .print-card span {
            font-size: 14px;
            line-height: 1.5;
          }
          .print-card p { margin: 0; }
          .print-list {
            display: grid;
            gap: 10px;
          }
          .print-line {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            border-bottom: 1px dashed var(--line);
            padding-bottom: 8px;
          }
          .print-line:last-child {
            border-bottom: 0;
            padding-bottom: 0;
          }
          .print-line strong {
            display: block;
            font-size: 15px;
          }
          .print-line small {
            display: block;
            color: var(--muted);
            margin-top: 2px;
          }
          .print-total {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 18px;
            padding: 16px 18px;
            border-radius: 16px;
            background: #2b1710;
            color: #fff;
          }
          .print-total strong {
            font-size: 26px;
          }
          .kitchen-note {
            min-height: 84px;
            border: 1px dashed var(--line);
            border-radius: 12px;
            background: #fff;
            margin-top: 8px;
            padding: 12px;
            color: var(--muted);
          }
          .kitchen-flags {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 12px;
          }
          .kitchen-flag {
            min-width: 132px;
            border: 1px solid var(--line);
            border-radius: 999px;
            padding: 8px 12px;
            font-size: 13px;
            font-weight: 700;
          }
          @media print {
            body { padding: 0; }
            .print-sheet {
              max-width: none;
              border: 0;
              border-radius: 0;
            }
          }
        </style>
      </head>
      <body>
        ${bodyMarkup}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.onload = () => {
    printWindow.print();
  };
}

function buildKitchenPrintMarkup(order) {
  const orderLabel = order.order_type === "delivery" ? "Livraison cuisine" : "Retrait cuisine";
  const itemsMarkup = order.items
    .map(
      item => `
        <div class="print-line">
          <div>
            <strong>${escapePrintHtml(item.name)}</strong>
            <small>${escapePrintHtml(formatMoney(item.price))} / unite</small>
          </div>
          <strong>x${escapePrintHtml(item.quantity)}</strong>
        </div>
      `
    )
    .join("");

  return `
    <article class="print-sheet">
      <header class="print-head">
        <span class="print-type">${escapePrintHtml(orderLabel)}</span>
        <h1>Commande #${escapePrintHtml(order.id)}</h1>
        <p>${escapePrintHtml(order.location_name)} • ${escapePrintHtml(formatDateTime(order.pickup_date, order.pickup_time))}</p>
      </header>
      <div class="print-body">
        <div class="print-grid">
          <section class="print-card">
            <h2>Preparation</h2>
            <p><strong>Client :</strong> ${escapePrintHtml(order.customer_name)}</p>
            <p><strong>Mode :</strong> ${escapePrintHtml(order.order_type === "delivery" ? "Livraison" : "Retrait")}</p>
            <p><strong>Heure cible :</strong> ${escapePrintHtml(formatDateTime(order.pickup_date, order.pickup_time))}</p>
            ${order.order_type === "delivery" ? `<p><strong>Adresse :</strong> ${escapePrintHtml(order.delivery_address || "Non renseignee")}</p>` : ""}
          </section>
          <section class="print-card">
            <h2>Consignes</h2>
            <div class="kitchen-flags">
              <span class="kitchen-flag">Cuisine reçue</span>
              <span class="kitchen-flag">En préparation</span>
              <span class="kitchen-flag">Prête à sortir</span>
            </div>
            <div class="kitchen-note">${escapePrintHtml(order.notes || "Aucune note particuliere pour la cuisine.")}</div>
          </section>
        </div>
        <section class="print-card">
          <h2>Articles a preparer</h2>
          <div class="print-list">${itemsMarkup}</div>
        </section>
        <div class="print-total">
          <span>Total commande</span>
          <strong>${escapePrintHtml(formatMoney(order.total))}</strong>
        </div>
      </div>
    </article>
  `;
}

function buildClientPrintMarkup(order) {
  const itemsMarkup = order.items
    .map(
      item => `
        <div class="print-line">
          <div>
            <strong>${escapePrintHtml(item.name)}</strong>
            <small>${escapePrintHtml(item.quantity)} x ${escapePrintHtml(formatMoney(item.price))}</small>
          </div>
          <strong>${escapePrintHtml(formatMoney(Number(item.quantity) * Number(item.price)))}</strong>
        </div>
      `
    )
    .join("");

  return `
    <article class="print-sheet">
      <header class="print-head">
        <span class="print-type">Fiche client</span>
        <h1>Commande #${escapePrintHtml(order.id)}</h1>
        <p>${escapePrintHtml(order.location_name)} • ${escapePrintHtml(order.customer_name)}</p>
      </header>
      <div class="print-body">
        <div class="print-grid">
          <section class="print-card">
            <h2>Informations</h2>
            <p><strong>Client :</strong> ${escapePrintHtml(order.customer_name)}</p>
            <p><strong>Email :</strong> ${escapePrintHtml(order.customer_email)}</p>
            <p><strong>Téléphone :</strong> ${escapePrintHtml(order.customer_phone || "Non renseigné")}</p>
          </section>
          <section class="print-card">
            <h2>Commande</h2>
            <p><strong>Mode :</strong> ${escapePrintHtml(order.order_type === "delivery" ? "Livraison" : "Retrait")}</p>
            <p><strong>Date prévue :</strong> ${escapePrintHtml(formatDateTime(order.pickup_date, order.pickup_time))}</p>
            <p><strong>Statut :</strong> ${escapePrintHtml(backofficeStatusLabel(order.status))}</p>
            ${order.order_type === "delivery" ? `<p><strong>Adresse :</strong> ${escapePrintHtml(order.delivery_address || "Non renseignée")}</p>` : ""}
          </section>
        </div>
        <section class="print-card">
          <h2>Détail de la commande</h2>
          <div class="print-list">${itemsMarkup}</div>
        </section>
        <div class="print-total">
          <span>Total à payer</span>
          <strong>${escapePrintHtml(formatMoney(order.total))}</strong>
        </div>
      </div>
    </article>
  `;
}

function printKitchenOrderSheet(orderId) {
  const order = ordersCache.find(item => Number(item.id) === Number(orderId)) || filteredOrdersCache.find(item => Number(item.id) === Number(orderId));
  if (!order) return;
  openPrintDocument(`Fiche cuisine - Commande #${order.id}`, buildKitchenPrintMarkup(order));
}

function printClientReceiptFromBackoffice(orderId) {
  const order = ordersCache.find(item => Number(item.id) === Number(orderId)) || filteredOrdersCache.find(item => Number(item.id) === Number(orderId));
  if (!order) return;
  openPrintDocument(`Fiche client - Commande #${order.id}`, buildClientPrintMarkup(order));
}

function closeOrderDetail() {
  const modal = document.getElementById("order-detail-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

window.openBackofficeNotificationByKeyword = openBackofficeNotificationByKeyword;
window.openDeliverySignatureModal = openDeliverySignatureModal;
window.printKitchenOrderSheet = printKitchenOrderSheet;
window.printClientReceiptFromBackoffice = printClientReceiptFromBackoffice;
