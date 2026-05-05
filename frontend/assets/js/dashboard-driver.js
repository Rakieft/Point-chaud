let driverOrdersCache = [];

function driverDayKey(dateValue) {
  if (!dateValue) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Port-au-Prince",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(dateValue));
}

function driverActionButtons(order) {
  const buttons = [];

  if (order.customer_phone) {
    buttons.push(`<a class="btn btn-light" href="tel:${order.customer_phone}">Appeler le client</a>`);
  }

  if (order.delivery_status === "assigned") {
    buttons.push(
      `<button class="btn btn-primary" type="button" onclick="updateDriverDeliveryStatus(${order.id}, 'out_for_delivery')">Marquer en route</button>`
    );
  }

  if (order.delivery_status === "out_for_delivery") {
    buttons.push(
      `<button class="btn admin-btn-success" type="button" onclick="updateDriverDeliveryStatus(${order.id}, 'delivered')">Marquer livree</button>`
    );
    buttons.push(
      `<button class="btn admin-btn-warning" type="button" onclick="markDriverReturn(${order.id})">Client absent / retour</button>`
    );
  }

  buttons.push(
    `<button class="btn btn-light" type="button" onclick="openDriverOrderDetail(${order.id})">Voir details</button>`
  );
  return buttons.join("");
}

function driverTimeline(order) {
  const steps = [
    ["assigned", "Assignee"],
    ["out_for_delivery", "En route"],
    ["return_to_branch", "Retour"],
    ["delivered", "Livree"]
  ];
  const activeMap = {
    assigned: ["assigned"],
    out_for_delivery: ["assigned", "out_for_delivery"],
    return_to_branch: ["assigned", "out_for_delivery", "return_to_branch"],
    delivered: ["assigned", "out_for_delivery", "delivered"]
  };
  const activeStatuses = activeMap[order.delivery_status] || [];

  return `
    <div class="driver-timeline">
      ${steps
        .map(
          ([status, label], index) => `
            <span class="driver-timeline-step ${activeStatuses.includes(status) ? "active" : ""} ${status === "return_to_branch" && order.delivery_status === "return_to_branch" ? "warning" : ""}">
              ${label}
            </span>
          `
        )
        .join("")}
    </div>
  `;
}

function renderDriverStats(orders) {
  const container = document.getElementById("driver-stats");
  if (!container) return;

  const todayKey = driverDayKey(new Date());
  const deliveredToday = orders.filter(order => {
    if (!(order.delivery_status === "delivered" || order.status === "completed")) return false;
    const deliveredDate = order.delivered_at || order.updated_at || order.created_at;
    return driverDayKey(deliveredDate) === todayKey;
  }).length;

  const cards = [
    ["Mes livraisons", orders.length],
    ["A demarrer", orders.filter(order => order.delivery_status === "assigned").length],
    ["En route", orders.filter(order => order.delivery_status === "out_for_delivery").length],
    ["Retours", orders.filter(order => order.delivery_status === "return_to_branch").length],
    ["Livrees aujourd'hui", deliveredToday]
  ];

  container.innerHTML = cards
    .map(
      ([label, value], index) => `
        <article class="admin-stat-card admin-stat-${["orange", "red", "gold", "white", "orange"][index]}">
          <small>${label}</small>
          <h2>${value}</h2>
        </article>
      `
    )
    .join("");
}

function renderNextDelivery(order) {
  const container = document.getElementById("driver-next-delivery");
  if (!container) return;

  if (!order) {
    container.innerHTML = `<div class="empty-state"><p>Aucune livraison prioritaire pour le moment.</p></div>`;
    return;
  }

  container.innerHTML = `
    <article class="driver-priority-card">
      <div class="admin-payment-card-head">
        <div>
          <strong>Commande #${order.id}</strong>
          <p>${order.customer_name} - ${order.location_name}</p>
        </div>
        <span class="status ${order.delivery_status}">${backofficeStatusLabel(order.delivery_status)}</span>
      </div>

      ${driverTimeline(order)}

      <div class="driver-priority-grid">
        <span><strong>Adresse:</strong> ${order.delivery_address || "Non renseignee"}</span>
        <span><strong>Telephone:</strong> ${order.customer_phone || "Non renseigne"}</span>
        <span><strong>Heure:</strong> ${formatDateTime(order.pickup_date, order.pickup_time)}</span>
        <span><strong>Total:</strong> ${formatMoney(order.total)}</span>
      </div>

      <div class="driver-priority-actions admin-action-group">
        ${driverActionButtons(order)}
      </div>
    </article>
  `;
}

function renderQuickActions(user, orders) {
  const container = document.getElementById("driver-quick-actions");
  if (!container) return;

  const activeOrder = orders.find(order => order.delivery_status === "out_for_delivery") || orders[0];
  const returnedOrder = orders.find(order => order.delivery_status === "return_to_branch");
  const cards = [
    {
      title: "Mes livraisons",
      body: "Ouvre la liste complete de tes commandes actives et archivees.",
      action: `<a class="btn btn-light" href="./deliveries.html">Voir mes livraisons</a>`
    },
    {
      title: "Mon profil",
      body: "Mets a jour ton telephone, ton email et tes informations terrain.",
      action: `<a class="btn btn-light" href="./driver-profile.html">Ouvrir mon profil</a>`
    },
    {
      title: "Client du moment",
      body: activeOrder?.customer_phone
        ? `Contacte ${activeOrder.customer_name} avant l'arrivee si necessaire.`
        : "Le numero du client apparaitra ici des qu'une livraison sera en cours.",
      action: activeOrder?.customer_phone
        ? `<a class="btn btn-light" href="tel:${activeOrder.customer_phone}">Appeler</a>`
        : `<span class="muted">Aucun appel prioritaire</span>`
    },
    {
      title: "Retour a traiter",
      body: returnedOrder
        ? `La commande #${returnedOrder.id} est revenue au point chaud. Le manager peut la replanifier.`
        : "Aucun retour client a signaler sur ta tournee actuelle.",
      action: returnedOrder
        ? `<a class="btn btn-light" href="./deliveries.html">Voir le retour</a>`
        : `<span class="muted">Rien a traiter</span>`
    }
  ];

  container.innerHTML = cards
    .map(
      card => `
        <article class="admin-driver-card">
          <div class="stack-sm">
            <strong>${card.title}</strong>
            <p>${card.body}</p>
          </div>
          <div class="admin-action-group">${card.action}</div>
        </article>
      `
    )
    .join("");
}

function renderDriverOrderCard(order) {
  return `
    <article class="admin-delivery-card">
      <div class="admin-payment-card-head">
        <div>
          <strong>Commande #${order.id}</strong>
          <p>${order.customer_name} - ${order.location_name}</p>
        </div>
        <span class="status ${order.delivery_status}">${backofficeStatusLabel(order.delivery_status)}</span>
      </div>

      ${driverTimeline(order)}

      <div class="admin-delivery-grid">
        <span><strong>Adresse:</strong> ${order.delivery_address || "Non renseignee"}</span>
        <span><strong>Telephone:</strong> ${order.customer_phone || "Non renseigne"}</span>
        <span><strong>Heure:</strong> ${formatDateTime(order.pickup_date, order.pickup_time)}</span>
        <span><strong>Zone:</strong> ${order.delivery_zone || "Standard"}</span>
      </div>

      <div class="admin-delivery-hint">
        <strong>${order.customer_name}</strong>
        <p>${order.delivery_status === "return_to_branch" ? order.return_note || "Client absent au moment de la livraison." : order.notes || "Aucune note particuliere pour cette commande."}</p>
      </div>

      <div class="admin-action-group">
        ${driverActionButtons(order)}
      </div>
    </article>
  `;
}

function renderDriverLists(orders) {
  const activeContainer = document.getElementById("driver-active-deliveries");
  const completedContainer = document.getElementById("driver-completed-deliveries");
  if (!activeContainer || !completedContainer) return;

  const activeOrders = orders.filter(order => ["assigned", "out_for_delivery"].includes(order.delivery_status));
  const completedOrders = orders.filter(
    order => ["delivered", "return_to_branch"].includes(order.delivery_status) || order.status === "completed"
  );

  activeContainer.innerHTML = activeOrders.length
    ? activeOrders.map(renderDriverOrderCard).join("")
    : `<div class="empty-state"><p>Aucune livraison active pour le moment.</p></div>`;

  completedContainer.innerHTML = completedOrders.length
    ? completedOrders.slice(0, 6).map(renderDriverOrderCard).join("")
    : `<div class="empty-state"><p>Aucune livraison terminee pour le moment.</p></div>`;
}

async function updateDriverDeliveryStatus(orderId, deliveryStatus) {
  try {
    const data = await apiRequest(`/orders/${orderId}/delivery-status`, {
      method: "PATCH",
      body: JSON.stringify({ delivery_status: deliveryStatus })
    });
    showMessage("driver-dashboard-message", "success", data.message);
    await renderDriverDashboard();
  } catch (error) {
    showMessage("driver-dashboard-message", "error", error.message);
  }
}

async function markDriverReturn(orderId) {
  const returnNote =
    window.prompt("Motif du retour au point chaud", "Client indisponible a la livraison") ||
    "Client indisponible a la livraison";

  try {
    const data = await apiRequest(`/orders/${orderId}/delivery-status`, {
      method: "PATCH",
      body: JSON.stringify({ delivery_status: "return_to_branch", return_note: returnNote })
    });
    showMessage("driver-dashboard-message", "success", data.message);
    await renderDriverDashboard();
  } catch (error) {
    showMessage("driver-dashboard-message", "error", error.message);
  }
}

function openDriverOrderDetail(orderId) {
  const order = driverOrdersCache.find(item => Number(item.id) === Number(orderId));
  openBackofficeOrderDetail(order);
}

async function renderDriverDashboard() {
  try {
    const user = await loadBackofficeUser();
    if (!user || user.role !== "driver") {
      window.location.href = "./deliveries.html";
      return;
    }

    const orders = await apiRequest("/orders/deliveries");
    driverOrdersCache = orders;

    document.getElementById("driver-branch-label").textContent =
      user.assigned_location_name || "Succursale de livraison";
    document.getElementById("driver-hero-note").textContent =
      orders.length
        ? `${orders.length} livraison(s) te sont actuellement rattachees.`
        : "Aucune livraison pour le moment. Le dashboard se mettra a jour automatiquement.";

    const priorityOrder =
      orders.find(order => order.delivery_status === "out_for_delivery") ||
      orders.find(order => order.delivery_status === "assigned") ||
      null;

    renderDriverStats(orders);
    renderNextDelivery(priorityOrder);
    renderQuickActions(user, orders);
    renderDriverLists(orders);
  } catch (error) {
    showMessage("driver-dashboard-message", "error", error.message);
  }
}

window.updateDriverDeliveryStatus = updateDriverDeliveryStatus;
window.markDriverReturn = markDriverReturn;
window.openDriverOrderDetail = openDriverOrderDetail;

document.addEventListener("DOMContentLoaded", () => {
  renderDriverDashboard();
  startLiveRefresh("driver-dashboard", renderDriverDashboard, 12000);
});
