async function renderAdminDashboard() {
  const user = requireAuth(["manager", "admin"]);
  if (!user) return;

  const nameEl = document.getElementById("admin-name");
  if (nameEl) {
    nameEl.textContent = user.name;
  }

  try {
    const [stats, orders] = await Promise.all([apiRequest("/users/dashboard"), apiRequest("/orders")]);

    renderStats(stats);
    renderManagerOrders(orders);
  } catch (error) {
    showMessage("admin-message", "error", error.message);
  }
}

function renderStats(stats) {
  const container = document.getElementById("stats-grid");
  if (!container) return;

  const cards = [
    { label: "Commandes totales", value: stats.orders.total_orders },
    { label: "En validation", value: stats.orders.pending_validation },
    { label: "Attente paiement", value: stats.orders.awaiting_payment },
    { label: "Paiements confirmes", value: stats.orders.paid },
    { label: "Clients", value: stats.users.total_clients },
    { label: "Produits", value: stats.products.total_products }
  ];

  container.innerHTML = cards
    .map(
      card => `
        <article class="stat">
          <small>${card.label}</small>
          <h2>${card.value || 0}</h2>
        </article>
      `
    )
    .join("");
}

function renderManagerOrders(orders) {
  const container = document.getElementById("manager-orders");
  if (!container) return;

  container.innerHTML = orders.length
    ? orders
        .map(
          order => `
            <article class="order-card">
              <div class="toolbar">
                <strong>Commande #${order.id}</strong>
                <span class="status ${order.status}">${order.status}</span>
                <span class="status ${order.payment_status}">${order.payment_status}</span>
              </div>
              <div class="stack-sm">
                <span>Client: ${order.customer_name} (${order.customer_email})</span>
                <span>Retrait: ${order.location_name} - ${formatDateTime(order.pickup_date, order.pickup_time)}</span>
                <span>Total: ${formatMoney(order.total)}</span>
                <span>Reference paiement: ${order.transaction_reference || "Aucune"}</span>
              </div>
              <div class="stack-sm">
                ${order.items
                  .map(item => `<div class="line-item">${item.name} x ${item.quantity} - ${formatMoney(item.price)}</div>`)
                  .join("")}
              </div>
              <div class="card-actions">
                ${
                  order.status === "pending_validation"
                    ? `
                      <button class="btn-secondary" onclick="validateOrder(${order.id}, 'validate')">Valider</button>
                      <button class="btn-danger" onclick="validateOrder(${order.id}, 'reject')">Refuser</button>
                    `
                    : ""
                }
                ${
                  order.payment_proof && order.payment_status === "pending"
                    ? `
                      <a class="btn btn-light" href="http://localhost:5000/uploads/${order.payment_proof}" target="_blank">Voir la preuve</a>
                      <button class="btn-secondary" onclick="confirmPayment(${order.id}, 'confirm')">Confirmer paiement</button>
                      <button class="btn-danger" onclick="confirmPayment(${order.id}, 'reject')">Rejeter paiement</button>
                    `
                    : ""
                }
                ${
                  order.qr_code_token && order.status === "paid"
                    ? `
                      <button class="btn-primary" onclick="scanQrToken('${order.qr_code_token}')">Marquer retiree</button>
                    `
                    : ""
                }
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state"><p>Aucune commande a afficher.</p></div>`;
}

async function validateOrder(orderId, action) {
  try {
    await apiRequest(`/orders/${orderId}/validate`, {
      method: "PATCH",
      body: JSON.stringify({ action })
    });
    renderAdminDashboard();
  } catch (error) {
    showMessage("admin-message", "error", error.message);
  }
}

async function confirmPayment(orderId, action) {
  try {
    await apiRequest(`/payments/${orderId}/confirm`, {
      method: "PATCH",
      body: JSON.stringify({ action })
    });
    renderAdminDashboard();
  } catch (error) {
    showMessage("admin-message", "error", error.message);
  }
}

async function scanQrToken(token) {
  try {
    await apiRequest(`/orders/scan/${token}`, {
      method: "POST"
    });
    renderAdminDashboard();
  } catch (error) {
    showMessage("admin-message", "error", error.message);
  }
}

document.addEventListener("DOMContentLoaded", renderAdminDashboard);
