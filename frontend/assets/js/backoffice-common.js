let backofficeCurrentUser = null;

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
