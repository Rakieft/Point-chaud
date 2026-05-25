async function renderDashboardHome() {
  try {
    const user = await loadBackofficeUser();
    if (!user) return;
    if (user.role === "driver") {
      window.location.href = "./dashboard-driver.html";
      return;
    }

    const data = await apiRequest("/users/dashboard");
    const pendingOrders = await apiRequest("/orders?group=pending");
    const validatedOrders = await apiRequest("/orders?group=validated");
    const securityData = user.role === "admin" ? await apiRequest("/users/security-events") : null;

    renderDashboardStats(data);
    renderQuickLinks(user);
    renderDashboardAlerts(pendingOrders, user, data.lowStockItems || [], data.lowStockThreshold || 5);
    renderDashboardPaymentsReview(pendingOrders);
    renderDashboardRecentOrders(pendingOrders, validatedOrders);
    renderDashboardRecentActivity(pendingOrders, validatedOrders);
    renderSecurityEventsPanel(user, securityData);

    const locationLabel = document.getElementById("admin-location-label");
    const locationCopy = document.getElementById("admin-location-copy");
    if (locationLabel) {
      locationLabel.textContent = user.assigned_location_name || "Toutes les succursales";
    }
    if (locationCopy) {
      locationCopy.textContent =
        user.role === "manager"
          ? "Tu vois uniquement les donnees de ta succursale."
          : "Tu peux superviser l'ensemble du reseau Point Chaud.";
    }
  } catch (error) {
    showMessage("admin-message", "error", error.message);
  }
}

function formatSecurityEventLabel(eventType) {
  const labels = {
    login_invalid_password: "Mot de passe incorrect",
    login_user_not_found: "Compte introuvable",
    login_disabled_account: "Compte desactive",
    login_unverified_email: "Email non verifie",
    login_social_account_password_attempt: "Tentative sur compte social",
    login_success: "Connexion reussie",
    rate_limit_blocked: "Blocage anti-tentatives",
    missing_bearer_token: "Jeton absent",
    invalid_bearer_token: "Jeton invalide",
    password_reset_requested: "Reset demande",
    password_reset_completed: "Reset termine"
  };

  return labels[eventType] || String(eventType || "").replace(/_/g, " ");
}

function renderSecurityEventsPanel(user, data) {
  const panel = document.getElementById("security-events-panel");
  const summary = document.getElementById("security-events-summary");
  const body = document.getElementById("security-events-body");

  if (!panel || !summary || !body) return;

  if (user.role !== "admin") {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;

  const counts = data?.summary || {
    total_events: 0,
    info_events: 0,
    warning_events: 0,
    critical_events: 0
  };

  const cards = [
    ["Events 30 jours", counts.total_events || 0, "white"],
    ["Infos", counts.info_events || 0, "gold"],
    ["Alertes", counts.warning_events || 0, "orange"],
    ["Critiques", counts.critical_events || 0, "red"]
  ];

  summary.innerHTML = cards
    .map(
      ([label, value, tone]) => `
        <article class="admin-stat-card admin-stat-${tone}">
          <small>${label}</small>
          <h2>${value}</h2>
        </article>
      `
    )
    .join("");

  const events = Array.isArray(data?.events) ? data.events : [];
  body.innerHTML = events.length
    ? events
        .map(
          event => `
            <tr>
              <td><span class="status ${event.severity}">${event.severity}</span></td>
              <td>
                <strong>${formatSecurityEventLabel(event.event_type)}</strong>
                ${
                  event.details && typeof event.details === "object"
                    ? `<small>${Object.entries(event.details)
                        .slice(0, 2)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join(" • ")}</small>`
                    : ""
                }
              </td>
              <td>${event.email || (event.user_id ? `Utilisateur #${event.user_id}` : "Anonyme")}</td>
              <td>${event.ip_address || "-"}</td>
              <td>${formatTimestamp(event.created_at)}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="5"><div class="empty-state"><p>Aucun evenement de securite a afficher.</p></div></td></tr>`;
}

function buildDashboardOrderTarget(orderId, options = {}) {
  const params = new URLSearchParams();
  params.set("orderId", String(orderId));
  params.set("fromNotification", "1");
  if (options.focus) {
    params.set("focus", options.focus);
  }
  return `./orders-pending.html?${params.toString()}`;
}

function buildDashboardDeliveryTarget(orderId) {
  const params = new URLSearchParams();
  params.set("orderId", String(orderId));
  params.set("fromNotification", "1");
  return `./deliveries.html?${params.toString()}`;
}

function renderDashboardPaymentsReview(orders) {
  const container = document.getElementById("dashboard-payments-review");
  if (!container) return;

  const paymentReviewOrders = orders
    .filter(order => order.status === "awaiting_payment" && order.payment_proof && order.payment_status === "pending")
    .slice(0, 4);

  container.innerHTML = paymentReviewOrders.length
    ? paymentReviewOrders
        .map(
          order => `
            <a class="admin-alert-item admin-alert-action" href="${buildDashboardOrderTarget(order.id, { focus: "payments-section" })}">
              <strong>Commande #${order.id}</strong>
              <p>${order.customer_name} a envoye une preuve pour ${formatMoney(order.total)}.</p>
              <small>${order.location_name} • ${formatDateTime(order.pickup_date, order.pickup_time)}</small>
            </a>
          `
        )
        .join("")
    : `<div class="empty-state"><p>Aucun paiement en attente de verification pour le moment.</p></div>`;
}

function renderDashboardRecentOrders(pendingOrders, validatedOrders) {
  const container = document.getElementById("dashboard-recent-orders");
  if (!container) return;

  const recentOrders = [...pendingOrders, ...validatedOrders]
    .filter(order => order.status !== "cancelled" && order.status !== "completed")
    .filter((order, index, source) => source.findIndex(item => Number(item.id) === Number(order.id)) === index)
    .sort((a, b) => Number(b.id) - Number(a.id))
    .slice(0, 3);

  container.innerHTML = recentOrders.length
    ? recentOrders
        .map(
          order => `
            <a
              class="admin-alert-item admin-alert-action"
              href="${order.order_type === "delivery" ? buildDashboardDeliveryTarget(order.id) : buildDashboardOrderTarget(order.id)}">
              <div class="toolbar">
                <strong>Commande #${order.id}</strong>
                <span class="status ${order.status}">${formatOrderStatusLabel(order.status)}</span>
              </div>
              <p>${order.customer_name} • ${order.location_name}</p>
              <small>${order.items.length} produit(s) • ${formatMoney(order.total)}</small>
            </a>
          `
        )
        .join("")
    : `<div class="empty-state"><p>Aucune commande active a afficher.</p></div>`;
}

function renderDashboardRecentActivity(pendingOrders, validatedOrders) {
  const container = document.getElementById("dashboard-recent-activity");
  if (!container) return;

  const items = [];

  pendingOrders
    .filter(order => order.status === "pending_validation")
    .slice(0, 2)
    .forEach(order => {
      items.push({
        href: buildDashboardOrderTarget(order.id),
        title: `Nouvelle commande #${order.id}`,
        text: `${order.customer_name} attend une validation pour ${order.location_name}.`,
        meta: formatDateValue(order.created_at)
      });
    });

  pendingOrders
    .filter(order => order.status === "awaiting_payment" && order.payment_proof && order.payment_status === "pending")
    .slice(0, 2)
    .forEach(order => {
      items.push({
        href: buildDashboardOrderTarget(order.id, { focus: "payments-section" }),
        title: `Preuve recue pour #${order.id}`,
        text: "Une preuve de paiement attend la verification du staff.",
        meta: `${order.location_name} • ${formatMoney(order.total)}`
      });
    });

  validatedOrders
    .filter(order => order.status === "paid")
    .slice(0, 2)
    .forEach(order => {
      items.push({
        href: order.order_type === "delivery" ? buildDashboardDeliveryTarget(order.id) : buildDashboardOrderTarget(order.id),
        title: order.order_type === "delivery" ? `Livraison a organiser #${order.id}` : `Commande prete #${order.id}`,
        text:
          order.order_type === "delivery"
            ? `${order.customer_name} attend l'affectation d'un livreur.`
            : `${order.customer_name} peut maintenant recuperer sa commande.`,
        meta: order.location_name
      });
    });

  container.innerHTML = items.length
    ? items
        .slice(0, 6)
        .map(
          item => `
            <a class="admin-alert-item admin-alert-action" href="${item.href}">
              <strong>${item.title}</strong>
              <p>${item.text}</p>
              <small>${item.meta}</small>
            </a>
          `
        )
        .join("")
    : `<div class="empty-state"><p>Aucune activite recente a signaler.</p></div>`;
}

function formatOrderStatusLabel(status) {
  const labels = {
    pending_validation: "En attente",
    awaiting_payment: "Paiement",
    paid: "Confirmee",
    completed: "Terminee",
    cancelled: "Refusee"
  };

  return labels[status] || status;
}

function renderDashboardStats(data) {
  const container = document.getElementById("stats-grid");
  if (!container) return;

  const cards = [
    ["Nombre de commandes", data.orders.total_orders || 0],
    ["Commandes en attente", data.orders.pending_validation || 0],
    ["Revenus", formatMoney(data.orders.revenue || 0)],
    ["Produits disponibles", data.products.total_products || 0]
  ];

  container.innerHTML = cards
    .map(
      ([label, value], index) => `
        <article class="admin-stat-card admin-stat-${["orange", "red", "gold", "white"][index]}">
          <small>${label}</small>
          <h2>${value}</h2>
        </article>
      `
    )
    .join("");
}

function renderQuickLinks(user) {
  const container = document.getElementById("quick-links-grid");
  if (!container) return;

  const links = [
    ["Commandes a traiter", "./orders-pending.html", "Valider ou ajuster les commandes en attente"],
    ["Commandes validees", "./orders-validated.html", "Voir les commandes payees, retirees ou refusees"],
    ["Promotions & plats du jour", "./promotions.html", "Mettre a jour l'evenement du moment et le programme de la semaine"],
    ["Livraisons", "./deliveries.html", "Affecter les livreurs et suivre les commandes en livraison"],
    ["Caisse & scan", "./cashier.html", "Douchette, camera QR, scans rapides, file de retrait et journal de caisse"],
    ["Mon profil", "./staff-profile.html", "Modifier le nom, la biographie, l'avatar et le poste"],
    ["Rapports", "./reports.html", "Analyser les produits les plus et les moins vendus"]
  ];

  if (user.role === "admin") {
    links.push(["Gestion managers", "./staff-profile.html", "Promouvoir, reassigner ou desactiver un manager"]);
    links.push(["Analyse data", "./analytics.html", "Suivre la progression des ventes par succursale sur 30 jours"]);
  }

  container.innerHTML = links
    .map(
      ([title, href, text]) => `
        <a class="admin-link-card" href="${href}">
          <strong>${title}</strong>
          <p>${text}</p>
        </a>
      `
    )
    .join("");
}

function renderDashboardAlerts(orders, user, lowStockItems = [], lowStockThreshold = 5) {
  const container = document.getElementById("alerts-list");
  if (!container) return;

  const pending = orders.filter(order => order.status === "pending_validation");
  const payments = orders.filter(order => order.status === "awaiting_payment" && order.payment_status !== "rejected");

  const alerts = [];

  if (pending.length) {
    alerts.push(`Tu as ${pending.length} commande(s) a valider dans ${user.assigned_location_name || "le reseau"}.`);
  }

  if (payments.length) {
    alerts.push(`${payments.length} commande(s) attendent une etape de paiement ou verification.`);
  }

  if (lowStockItems.length) {
    const top = lowStockItems
      .slice(0, 3)
      .map(item => `${item.product_name} (${item.location_name}: ${item.stock})`)
      .join(", ");
    alerts.push(`Stock faible detecte sous ${lowStockThreshold} unite(s): ${top}.`);
  }

  if (!alerts.length) {
    alerts.push("Aucune alerte urgente pour le moment.");
  }

  container.innerHTML = alerts
    .map(
      alert => `
        <button class="admin-alert-item admin-alert-action" type="button" onclick="openBackofficeNotificationsModal()">
          <strong>Priorite</strong>
          <p>${alert}</p>
        </button>
      `
    )
    .join("");
}

document.addEventListener("DOMContentLoaded", renderDashboardHome);
document.addEventListener("DOMContentLoaded", () => {
  startLiveRefresh("dashboard-home", renderDashboardHome, 15000);
});
