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

    renderDashboardStats(data);
    renderQuickLinks(user);
    renderDashboardAlerts(pendingOrders, user, data.lowStockItems || [], data.lowStockThreshold || 5);
    renderDashboardPaymentsReview(pendingOrders);
    renderDashboardRecentOrders(pendingOrders, validatedOrders);
    renderDashboardRecentActivity(pendingOrders, validatedOrders);

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
