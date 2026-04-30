async function renderDashboardHome() {
  try {
    const user = await loadBackofficeUser();
    if (!user) return;
    if (user.role === "driver") {
      window.location.href = "./deliveries.html";
      return;
    }

    const data = await apiRequest("/users/dashboard");
    const pendingOrders = await apiRequest("/orders?group=pending");

    renderDashboardStats(data);
    renderQuickLinks(user);
    renderDashboardAlerts(pendingOrders, user, data.lowStockItems || [], data.lowStockThreshold || 5);

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

function renderDashboardStats(data) {
  const container = document.getElementById("stats-grid");
  const notificationCount = document.getElementById("header-notification-count");

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

  if (notificationCount) {
    notificationCount.textContent = String((data.orders.pending_validation || 0) + (data.orders.awaiting_payment || 0));
  }
}

function renderQuickLinks(user) {
  const container = document.getElementById("quick-links-grid");
  if (!container) return;

  const links = [
    ["Commandes a traiter", "./orders-pending.html", "Valider ou ajuster les commandes en attente"],
    ["Commandes validees", "./orders-validated.html", "Voir les commandes payees, retirees ou refusees"],
    ["Livraisons", "./deliveries.html", "Affecter les livreurs et suivre les commandes en livraison"],
    ["Scan retraits", "./scan-orders.html", "Scanner les QR codes et confirmer la remise des commandes"],
    ["Poste de caisse", "./cashier.html", "Mode comptoir optimise pour douchette, scans rapides et file d'attente"],
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
  const payments = orders.filter(
    order => order.status === "awaiting_payment" && order.payment_status !== "rejected"
  );

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
        <div class="admin-alert-item">
          <strong>Priorite</strong>
          <p>${alert}</p>
        </div>
      `
    )
    .join("");
}

document.addEventListener("DOMContentLoaded", renderDashboardHome);
document.addEventListener("DOMContentLoaded", () => {
  startLiveRefresh("dashboard-home", renderDashboardHome, 15000);
});
