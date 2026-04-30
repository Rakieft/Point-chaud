let deliveriesCache = [];
let driversCache = [];

function renderDeliveriesStats(orders) {
  const container = document.getElementById("deliveries-stats");
  if (!container) return;

  const cards = [
    ["Livraisons totales", orders.length],
    ["A affecter", orders.filter(order => order.delivery_status === "pending_assignment").length],
    ["En livraison", orders.filter(order => order.delivery_status === "out_for_delivery").length],
    ["Livrees", orders.filter(order => order.delivery_status === "delivered" || order.status === "completed").length]
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

function driverOptionsHtml(order) {
  return `
    <select id="driver-select-${order.id}">
      <option value="">Choisir un livreur</option>
      ${driversCache
        .filter(driver => String(driver.assigned_location_id) === String(order.location_id))
        .map(
          driver => `
            <option value="${driver.id}" ${String(order.assigned_driver_id || "") === String(driver.id) ? "selected" : ""}>
              ${driver.name}
            </option>
          `
        )
        .join("")}
    </select>
  `;
}

function renderDeliveryCard(order, user) {
  const isDriver = user.role === "driver";
  const actions = [];

  if (!isDriver && order.status === "paid" && order.delivery_status !== "delivered") {
    actions.push(`
      <div class="admin-inline-editor">
        ${driverOptionsHtml(order)}
        <button class="btn-primary" onclick="assignDriverToOrder(${order.id})">Affecter</button>
      </div>
    `);
  }

  if (isDriver && Number(order.assigned_driver_id) === Number(user.id) && order.delivery_status === "assigned") {
    actions.push(
      `<button class="admin-btn-success" onclick="updateDeliveryStatus(${order.id}, 'out_for_delivery')">Marquer en route</button>`
    );
  }

  if (isDriver && Number(order.assigned_driver_id) === Number(user.id) && order.delivery_status === "out_for_delivery") {
    actions.push(
      `<button class="admin-btn-success" onclick="updateDeliveryStatus(${order.id}, 'delivered')">Marquer livree</button>`
    );
  }

  if (!isDriver && order.delivery_status === "assigned") {
    actions.push(
      `<button class="btn-light" onclick="updateDeliveryStatus(${order.id}, 'out_for_delivery')">Passer en route</button>`
    );
  }

  if (!isDriver && order.delivery_status === "out_for_delivery") {
    actions.push(
      `<button class="admin-btn-success" onclick="updateDeliveryStatus(${order.id}, 'delivered')">Confirmer livree</button>`
    );
  }

  return `
    <article class="admin-payment-card">
      <div class="admin-payment-card-head">
        <div>
          <strong>Commande #${order.id}</strong>
          <p>${order.customer_name} - ${order.location_name}</p>
        </div>
        <span class="status ${order.delivery_status}">${backofficeStatusLabel(order.delivery_status)}</span>
      </div>

      <div class="stack-sm">
        <span>Client: ${order.customer_phone || "Telephone non renseigne"}</span>
        <span>Adresse: ${order.delivery_address || "Non renseignee"}</span>
        <span>Zone: ${order.delivery_zone || "Standard"}</span>
        <span>Frais: ${formatMoney(order.delivery_fee || 0)}</span>
        <span>Retrait/heure: ${formatDateTime(order.pickup_date, order.pickup_time)}</span>
        <span>Livreur: ${order.driver_name || "Non assigne"}</span>
        <span>Paiement: ${backofficeStatusLabel(order.payment_status)}</span>
      </div>

      <div class="admin-action-group">
        ${actions.join("")}
        <button class="btn-light" onclick="openDeliveryDetail(${order.id})">Voir details</button>
      </div>
    </article>
  `;
}

function renderDeliveries(orders, user) {
  const activeContainer = document.getElementById("deliveries-active-list");
  const archiveContainer = document.getElementById("deliveries-archive-list");
  if (!activeContainer || !archiveContainer) return;

  const activeOrders = orders.filter(order => order.delivery_status !== "delivered" && order.status !== "completed");
  const archivedOrders = orders.filter(order => order.delivery_status === "delivered" || order.status === "completed");

  activeContainer.innerHTML = activeOrders.length
    ? activeOrders.map(order => renderDeliveryCard(order, user)).join("")
    : `<div class="empty-state"><p>Aucune livraison active.</p></div>`;

  archiveContainer.innerHTML = archivedOrders.length
    ? archivedOrders.map(order => renderDeliveryCard(order, user)).join("")
    : `<div class="empty-state"><p>Aucune livraison archivee.</p></div>`;
}

function openDeliveryDetail(orderId) {
  const order = deliveriesCache.find(item => item.id === orderId);
  openBackofficeOrderDetail(order);
}

async function assignDriverToOrder(orderId) {
  const select = document.getElementById(`driver-select-${orderId}`);
  const driverId = select?.value;

  if (!driverId) {
    showMessage("deliveries-message", "error", "Choisis un livreur avant de continuer");
    return;
  }

  try {
    const data = await apiRequest(`/orders/${orderId}/assign-driver`, {
      method: "PATCH",
      body: JSON.stringify({ driver_id: driverId })
    });
    showMessage("deliveries-message", "success", data.message);
    renderDeliveriesPage();
  } catch (error) {
    showMessage("deliveries-message", "error", error.message);
  }
}

async function updateDeliveryStatus(orderId, deliveryStatus) {
  try {
    const data = await apiRequest(`/orders/${orderId}/delivery-status`, {
      method: "PATCH",
      body: JSON.stringify({ delivery_status: deliveryStatus })
    });
    showMessage("deliveries-message", "success", data.message);
    renderDeliveriesPage();
  } catch (error) {
    showMessage("deliveries-message", "error", error.message);
  }
}

async function renderDeliveriesPage() {
  try {
    const user = await loadBackofficeUser();
    if (!user) return;

    const title = document.getElementById("deliveries-page-title");
    if (title) {
      title.textContent =
        user.role === "driver" ? "Mon tableau de livraison" : "Suivi des commandes en livraison";
    }

    const requests = [apiRequest("/orders/deliveries")];
    if (user.role !== "driver") {
      requests.push(apiRequest("/users/drivers"));
    }

    const [orders, drivers = []] = await Promise.all(requests);
    deliveriesCache = orders;
    driversCache = drivers;

    renderDeliveriesStats(orders);
    renderDeliveries(orders, user);
  } catch (error) {
    showMessage("deliveries-message", "error", error.message);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  renderDeliveriesPage();
  startLiveRefresh("deliveries-page", renderDeliveriesPage, 12000);
});
