let deliveriesCache = [];
let driversCache = [];

function renderDeliveriesStats(orders) {
  const container = document.getElementById("deliveries-stats");
  if (!container) return;

  const cards = [
    ["Livraisons totales", orders.length],
    ["A affecter", orders.filter(order => order.status === "paid" && order.delivery_status === "pending_assignment").length],
    ["En livraison", orders.filter(order => order.delivery_status === "out_for_delivery").length],
    ["Retours", orders.filter(order => order.delivery_status === "return_to_branch").length],
    ["Livrees", orders.filter(order => order.delivery_status === "delivered" || order.status === "completed").length]
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

function deliveryStateCopy(order) {
  if (order.status === "cancelled") {
    return "Commande annulee, aucune livraison necessaire.";
  }

  if (order.status !== "paid") {
    return "Le paiement doit etre confirme avant l'affectation du livreur.";
  }

  if (order.delivery_status === "pending_assignment") {
    return "Commande prete: choisis maintenant le livreur de la bonne succursale.";
  }

  if (order.delivery_status === "assigned") {
    return "Livreur affecte: la commande peut maintenant partir en livraison.";
  }

  if (order.delivery_status === "out_for_delivery") {
    return "Livraison en cours: le livreur est deja en route.";
  }

  if (order.delivery_status === "return_to_branch") {
    return `Retour au point chaud en cours. Motif: ${order.return_note || "client indisponible"}.`;
  }

  return "Livraison terminee.";
}

function driverOptionsHtml(order) {
  const matchingDrivers = driversCache.filter(
    driver => String(driver.assigned_location_id) === String(order.location_id)
  );

  return `
    <select id="driver-select-${order.id}">
      <option value="">Choisir un livreur</option>
      ${matchingDrivers
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

function canManagerAssign(order) {
  return order.status === "paid" && ["pending_assignment", "assigned", "return_to_branch"].includes(order.delivery_status);
}

function renderDriverSummary(user, orders) {
  const hub = document.getElementById("deliveries-manager-hub");
  const container = document.getElementById("deliveries-driver-summary");
  if (!hub || !container) return;

  if (!["manager", "admin"].includes(user.role)) {
    hub.style.display = "none";
    return;
  }

  hub.style.display = "";

  container.innerHTML = driversCache.length
    ? driversCache
        .map(driver => {
          const assignedCount = orders.filter(
            order => Number(order.assigned_driver_id) === Number(driver.id) && order.delivery_status === "assigned"
          ).length;
          const onRoadCount = orders.filter(
            order =>
              Number(order.assigned_driver_id) === Number(driver.id) && order.delivery_status === "out_for_delivery"
          ).length;
          const completedCount = orders.filter(
            order =>
              Number(order.assigned_driver_id) === Number(driver.id) &&
              (order.delivery_status === "delivered" || order.status === "completed")
          ).length;
          const returnedCount = orders.filter(
            order => Number(order.assigned_driver_id) === Number(driver.id) && order.delivery_status === "return_to_branch"
          ).length;

          return `
            <article class="admin-driver-card">
              <div class="admin-driver-card-head">
                <div>
                  <strong>${driver.name}</strong>
                  <p>${driver.assigned_location_name || "Succursale non renseignee"}</p>
                </div>
                <span class="status assigned">Livreur</span>
              </div>
              <div class="stack-sm">
                <span>Telephone: ${driver.phone || "Non renseigne"}</span>
                <span>Email: ${driver.email || "Non renseigne"}</span>
              </div>
              <div class="admin-driver-metrics">
                <span><strong>${assignedCount}</strong> a preparer</span>
                <span><strong>${onRoadCount}</strong> en route</span>
                <span><strong>${returnedCount}</strong> retours</span>
                <span><strong>${completedCount}</strong> livrees</span>
              </div>
            </article>
          `;
        })
        .join("")
    : `<div class="empty-state"><p>Aucun livreur actif pour cette vue.</p></div>`;
}

function renderAssignmentCard(order) {
  const matchingDrivers = driversCache.filter(
    driver => String(driver.assigned_location_id) === String(order.location_id)
  );
  const hasAssignedDriver = Boolean(order.assigned_driver_id);

  return `
    <article class="admin-delivery-card admin-delivery-card-highlight">
      <div class="admin-payment-card-head">
        <div>
          <strong>Commande #${order.id}</strong>
          <p>${order.customer_name} - ${order.location_name}</p>
        </div>
        <span class="status ${order.delivery_status}">${backofficeStatusLabel(order.delivery_status)}</span>
      </div>

      <div class="admin-delivery-grid">
        <span><strong>Client:</strong> ${order.customer_phone || "Telephone non renseigne"}</span>
        <span><strong>Adresse:</strong> ${order.delivery_address || "Non renseignee"}</span>
        <span><strong>Heure:</strong> ${formatDateTime(order.pickup_date, order.pickup_time)}</span>
        <span><strong>Total:</strong> ${formatMoney(order.total)}</span>
      </div>

      <div class="admin-delivery-hint">
        <strong>${order.delivery_status === "return_to_branch" ? "Retour a relancer" : hasAssignedDriver ? "Reaffectation possible" : "Affectation requise"}</strong>
        <p>${deliveryStateCopy(order)}</p>
      </div>

      <div class="admin-inline-editor admin-inline-editor-delivery">
        ${driverOptionsHtml(order)}
        <button class="btn btn-primary" type="button" onclick="assignDriverToOrder(${order.id})">
          ${hasAssignedDriver ? "Reaffecter" : "Affecter"}
        </button>
      </div>

      <small class="muted">
        ${matchingDrivers.length
          ? `${matchingDrivers.length} livreur(s) disponible(s) pour ${order.location_name}.`
          : "Aucun livreur actif sur cette succursale pour le moment."}
      </small>

      <div class="admin-action-group">
        <button class="btn btn-light" type="button" onclick="openDeliveryDetail(${order.id})">Voir details</button>
      </div>
    </article>
  `;
}

function renderDeliveryCard(order, user) {
  const isDriver = user.role === "driver";
  const actions = [];

  if (!isDriver && canManagerAssign(order)) {
    actions.push(`
      <div class="admin-inline-editor admin-inline-editor-delivery">
        ${driverOptionsHtml(order)}
        <button class="btn btn-primary" type="button" onclick="assignDriverToOrder(${order.id})">
          ${order.assigned_driver_id ? "Reaffecter" : "Affecter"}
        </button>
      </div>
    `);
  }

  if (isDriver && Number(order.assigned_driver_id) === Number(user.id) && order.delivery_status === "assigned") {
    actions.push(
      `<button class="btn admin-btn-success" type="button" onclick="updateDeliveryStatus(${order.id}, 'out_for_delivery')">Marquer en route</button>`
    );
  }

  if (isDriver && Number(order.assigned_driver_id) === Number(user.id) && order.delivery_status === "out_for_delivery") {
    actions.push(
      `<button class="btn admin-btn-success" type="button" onclick="updateDeliveryStatus(${order.id}, 'delivered')">Marquer livree</button>`
    );
    actions.push(
      `<button class="btn admin-btn-warning" type="button" onclick="markDeliveryReturn(${order.id})">Client absent / retour</button>`
    );
  }

  if (!isDriver && order.delivery_status === "assigned") {
    actions.push(
      `<button class="btn btn-light" type="button" onclick="updateDeliveryStatus(${order.id}, 'out_for_delivery')">Passer en route</button>`
    );
  }

  if (!isDriver && order.delivery_status === "out_for_delivery") {
    actions.push(
      `<button class="btn admin-btn-success" type="button" onclick="updateDeliveryStatus(${order.id}, 'delivered')">Confirmer livree</button>`
    );
    actions.push(
      `<button class="btn admin-btn-warning" type="button" onclick="markDeliveryReturn(${order.id})">Retour point chaud</button>`
    );
  }

  return `
    <article class="admin-delivery-card">
      <div class="admin-payment-card-head">
        <div>
          <strong>Commande #${order.id}</strong>
          <p>${order.customer_name} - ${order.location_name}</p>
        </div>
        <span class="status ${order.delivery_status}">${backofficeStatusLabel(order.delivery_status)}</span>
      </div>

      <div class="admin-delivery-grid">
        <span><strong>Client:</strong> ${order.customer_phone || "Telephone non renseigne"}</span>
        <span><strong>Adresse:</strong> ${order.delivery_address || "Non renseignee"}</span>
        <span><strong>Zone:</strong> ${order.delivery_zone || "Standard"}</span>
        <span><strong>Frais:</strong> ${formatMoney(order.delivery_fee || 0)}</span>
        <span><strong>Heure:</strong> ${formatDateTime(order.pickup_date, order.pickup_time)}</span>
        <span><strong>Livreur:</strong> ${order.driver_name || "Non assigne"}</span>
      </div>

      <div class="admin-delivery-hint">
        <strong>${backofficeStatusLabel(order.payment_status)}</strong>
        <p>${deliveryStateCopy(order)}</p>
      </div>

      <div class="admin-action-group">
        ${actions.join("")}
        <button class="btn btn-light" type="button" onclick="openDeliveryDetail(${order.id})">Voir details</button>
      </div>
    </article>
  `;
}

function renderDeliveries(orders, user) {
  const assignmentPanel = document.getElementById("deliveries-assignment-panel");
  const assignmentContainer = document.getElementById("deliveries-assignment-list");
  const activeContainer = document.getElementById("deliveries-active-list");
  const archiveContainer = document.getElementById("deliveries-archive-list");
  if (!activeContainer || !archiveContainer || !assignmentPanel || !assignmentContainer) return;

  const assignmentOrders = orders.filter(order => canManagerAssign(order));
  const activeOrders = orders.filter(
    order =>
      order.status !== "cancelled" &&
      order.delivery_status !== "pending_assignment" &&
      order.delivery_status !== "delivered" &&
      order.status !== "completed"
  );
  const archivedOrders = orders.filter(order => order.delivery_status === "delivered" || order.status === "completed");

  if (["manager", "admin"].includes(user.role)) {
    assignmentPanel.style.display = "";
    assignmentContainer.innerHTML = assignmentOrders.length
      ? assignmentOrders.map(renderAssignmentCard).join("")
      : `<div class="empty-state"><p>Aucune commande payee n'attend actuellement un livreur.</p></div>`;
  } else {
    assignmentPanel.style.display = "none";
  }

  activeContainer.innerHTML = activeOrders.length
    ? activeOrders.map(order => renderDeliveryCard(order, user)).join("")
    : `<div class="empty-state"><p>Aucune livraison active.</p></div>`;

  archiveContainer.innerHTML = archivedOrders.length
    ? archivedOrders.map(order => renderDeliveryCard(order, user)).join("")
    : `<div class="empty-state"><p>Aucune livraison archivee.</p></div>`;
}

function openDeliveryDetail(orderId) {
  const order = deliveriesCache.find(item => Number(item.id) === Number(orderId));
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
    await renderDeliveriesPage();
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
    await renderDeliveriesPage();
  } catch (error) {
    showMessage("deliveries-message", "error", error.message);
  }
}

async function markDeliveryReturn(orderId) {
  const returnNote =
    window.prompt("Motif du retour au point chaud", "Client indisponible a la livraison") ||
    "Client indisponible a la livraison";

  try {
    const data = await apiRequest(`/orders/${orderId}/delivery-status`, {
      method: "PATCH",
      body: JSON.stringify({ delivery_status: "return_to_branch", return_note: returnNote })
    });
    showMessage("deliveries-message", "success", data.message);
    await renderDeliveriesPage();
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
      title.textContent = user.role === "driver" ? "Mon tableau de livraison" : "Suivi des commandes en livraison";
    }

    const requests = [apiRequest("/orders/deliveries")];
    if (user.role !== "driver") {
      requests.push(apiRequest("/users/drivers"));
    }

    const [orders, drivers = []] = await Promise.all(requests);
    deliveriesCache = orders;
    driversCache = drivers;

    renderDeliveriesStats(orders);
    renderDriverSummary(user, orders);
    renderDeliveries(orders, user);
  } catch (error) {
    showMessage("deliveries-message", "error", error.message);
  }
}

window.assignDriverToOrder = assignDriverToOrder;
window.updateDeliveryStatus = updateDeliveryStatus;
window.markDeliveryReturn = markDeliveryReturn;
window.openDeliveryDetail = openDeliveryDetail;

document.addEventListener("DOMContentLoaded", () => {
  renderDeliveriesPage();
  startLiveRefresh("deliveries-page", renderDeliveriesPage, 12000);
});
