let ordersCache = [];
let catalogCache = null;

function currentOrdersGroup() {
  return document.body.dataset.ordersGroup || "pending";
}

async function renderOrdersPage() {
  try {
    const user = await loadBackofficeUser();
    if (!user) return;

    const [orders, catalog] = await Promise.all([
      apiRequest(`/orders?group=${currentOrdersGroup()}`),
      apiRequest("/products")
    ]);

    ordersCache = orders;
    catalogCache = catalog;

    renderOrdersTable(orders);
    renderPaymentCards(orders);
  } catch (error) {
    showMessage("orders-message", "error", error.message);
  }
}

function renderOrdersTable(orders) {
  const tbody = document.getElementById("orders-table-body");
  if (!tbody) return;

  tbody.innerHTML = orders.length
    ? orders
        .map(
          order => `
            <tr class="admin-mobile-row">
              <td data-label="Commande"><strong>#${order.id}</strong></td>
              <td data-label="Client">${order.customer_name}</td>
              <td data-label="Point chaud">${order.location_name}</td>
              <td data-label="Retrait">${formatDateTime(order.pickup_date, order.pickup_time)}</td>
              <td data-label="Statut">
                <div class="admin-status-stack">
                  <span class="status ${order.status}">${backofficeStatusLabel(order.status)}</span>
                  ${
                    order.status === "cancelled"
                      ? `<span class="status rejected">Paiement non requis</span>`
                      : `<span class="status ${order.payment_status}">${backofficeStatusLabel(order.payment_status)}</span>`
                  }
                </div>
              </td>
              <td data-label="Actions">
                <div class="admin-action-group">
                  ${
                    currentOrdersGroup() === "pending" && order.status === "pending_validation"
                      ? `
                        <button class="admin-btn-success" onclick="validateOrder(${order.id}, 'validate')">Valider</button>
                        <button class="admin-btn-danger" onclick="validateOrder(${order.id}, 'reject')">Refuser</button>
                        <button class="btn-light" onclick="openOrderEdit(${order.id})">Modifier</button>
                      `
                      : ""
                  }
                  <button class="btn-light" onclick="openOrderDetailById(${order.id})">Voir details</button>
                  ${
                    order.qr_code_token && order.status === "paid"
                      ? `<button class="btn-primary" onclick="scanQrToken('${order.qr_code_token}')">Marquer retiree</button>`
                      : ""
                  }
                </div>
              </td>
            </tr>
          `
        )
        .join("")
    : `
      <tr>
        <td colspan="6" class="admin-table-empty">
          <div class="empty-state"><p>Aucune commande dans cette categorie.</p></div>
        </td>
      </tr>
    `;
}

function renderPaymentCards(orders) {
  const container = document.getElementById("payments-review-list");
  if (!container) return;

  const paymentOrders = orders.filter(
    order => order.status !== "cancelled" && order.payment_proof && order.payment_status === "pending"
  );
  container.innerHTML = paymentOrders.length
    ? paymentOrders
        .map(
          order => `
            <article class="admin-payment-card">
              <div class="admin-payment-card-head">
                <div>
                  <strong>Commande #${order.id}</strong>
                  <p>${order.customer_name} - ${order.location_name}</p>
                </div>
                <span class="status pending">${backofficeStatusLabel(order.payment_status)}</span>
              </div>

              <div class="admin-proof-preview">
                <img src="${backofficeUploadsBaseUrl()}/uploads/${order.payment_proof}" alt="Preuve commande ${order.id}" onerror="this.style.display='none'; this.nextElementSibling.style.display='grid';" />
                <div class="admin-proof-fallback" style="display:none;">
                  <p>Impossible d'afficher cette preuve directement.</p>
                  <a class="btn btn-light" href="${backofficeUploadsBaseUrl()}/uploads/${order.payment_proof}" target="_blank">Ouvrir le fichier</a>
                </div>
              </div>

              <div class="stack-sm">
                <span>Reference: ${order.transaction_reference || "Aucune"}</span>
                <span>Total: ${formatMoney(order.total)}</span>
              </div>

              <div class="admin-action-group">
                <button class="admin-btn-success" onclick="confirmPayment(${order.id}, 'confirm')">Confirmer paiement</button>
                <button class="admin-btn-danger" onclick="confirmPayment(${order.id}, 'reject')">Refuser</button>
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state"><p>Aucune preuve de paiement en attente.</p></div>`;
}

function openOrderDetailById(orderId) {
  const order = ordersCache.find(item => item.id === orderId);
  openBackofficeOrderDetail(order);
}

function openOrderEdit(orderId) {
  const order = ordersCache.find(item => item.id === orderId);
  const form = document.getElementById("order-edit-form");
  const modal = document.getElementById("order-edit-modal");

  if (!order || !form || !modal || !catalogCache) return;

  form.dataset.orderId = String(order.id);
  form.innerHTML = `
    <label>Date de retrait <input name="pickup_date" type="date" value="${order.pickup_date ? String(order.pickup_date).slice(0, 10) : ""}" required /></label>
    <label>Heure de retrait <input name="pickup_time" type="time" value="${String(order.pickup_time || "").slice(0, 5)}" required /></label>
    <label>Notes <textarea name="notes">${order.notes || ""}</textarea></label>
    <div class="admin-form-span">
      <strong>Produits</strong>
      <div class="stack">
        ${order.items
          .map(
            item => `
              <div class="admin-inline-editor">
                <span>${item.name}</span>
                <input type="hidden" name="product_id" value="${item.product_id}" />
                <input type="number" name="quantity_${item.product_id}" min="0" value="${item.quantity}" />
              </div>
            `
          )
          .join("")}
      </div>
    </div>
    <div class="card-actions">
      <button class="btn-primary" type="submit">Enregistrer les modifications</button>
    </div>
  `;

  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeOrderEdit() {
  const modal = document.getElementById("order-edit-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

async function validateOrder(orderId, action) {
  try {
    await apiRequest(`/orders/${orderId}/validate`, {
      method: "PATCH",
      body: JSON.stringify({ action })
    });
    renderOrdersPage();
  } catch (error) {
    showMessage("orders-message", "error", error.message);
  }
}

async function confirmPayment(orderId, action) {
  try {
    await apiRequest(`/payments/${orderId}/confirm`, {
      method: "PATCH",
      body: JSON.stringify({ action })
    });
    renderOrdersPage();
  } catch (error) {
    showMessage("orders-message", "error", error.message);
  }
}

async function scanQrToken(token) {
  try {
    await apiRequest(`/orders/scan/${token}`, { method: "POST" });
    renderOrdersPage();
  } catch (error) {
    showMessage("orders-message", "error", error.message);
  }
}

function bindOrderEditForm() {
  const form = document.getElementById("order-edit-form");
  if (!form) return;

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const order = ordersCache.find(item => item.id === Number(form.dataset.orderId));
    if (!order) return;

    const payload = {
      pickup_date: form.elements.pickup_date.value,
      pickup_time: form.elements.pickup_time.value,
      notes: form.elements.notes.value,
      items: order.items
        .map(item => ({
          product_id: item.product_id,
          quantity: Number(form.elements[`quantity_${item.product_id}`].value)
        }))
        .filter(item => item.quantity > 0)
    };

    try {
      await apiRequest(`/orders/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      showMessage("edit-order-message", "success", "Commande modifiee avec succes");
      closeOrderEdit();
      renderOrdersPage();
    } catch (error) {
      showMessage("edit-order-message", "error", error.message);
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindOrderEditForm();
  renderOrdersPage();
  startLiveRefresh(`orders-${currentOrdersGroup()}`, renderOrdersPage, 12000);
});
