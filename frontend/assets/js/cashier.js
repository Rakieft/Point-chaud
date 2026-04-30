const cashierStorageKey = "pointchaud_cashier_recent_scans";

function getRecentCashierScans() {
  return JSON.parse(localStorage.getItem(cashierStorageKey) || "[]");
}

function saveRecentCashierScans(items) {
  localStorage.setItem(cashierStorageKey, JSON.stringify(items.slice(0, 8)));
}

function renderCashierClock() {
  const now = new Date();
  const timeEl = document.getElementById("cashier-live-time");
  const dateEl = document.getElementById("cashier-live-date");
  if (timeEl) timeEl.textContent = formatTimestamp(now).split(" ")[1] || "--:--";
  if (dateEl) dateEl.textContent = formatDateValue(now);
}

function renderCashierStats(orders) {
  const container = document.getElementById("cashier-stats");
  if (!container) return;

  const readyOrders = orders.filter(order => order.status === "paid" && order.order_type !== "delivery" && order.qr_code_token);
  const cards = [
    ["Prêtes au retrait", readyOrders.length],
    ["Scans récents", getRecentCashierScans().length],
    ["Succursale", backofficeCurrentUser?.assigned_location_name || "Réseau"],
    ["Mode", "Caisse live"]
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

function renderRecentCashierScans() {
  const container = document.getElementById("cashier-recent-scans");
  if (!container) return;

  const scans = getRecentCashierScans();
  container.innerHTML = scans.length
    ? scans
        .map(
          item => `
            <div class="admin-alert-item">
              <strong>Commande #${item.orderId}</strong>
              <p>${item.customerName} - ${item.locationName}</p>
              <small>${item.scannedAt}</small>
            </div>
          `
        )
        .join("")
    : `<div class="empty-state"><p>Aucun retrait valide récemment.</p></div>`;
}

function bindCashierFocus() {
  const input = document.getElementById("scan-token-input");
  const button = document.getElementById("cashier-focus-btn");
  if (!input) return;

  input.focus();
  button?.addEventListener("click", () => input.focus());
  document.addEventListener("click", event => {
    if (event.target.closest("button, a, input, select, textarea")) return;
    input.focus();
  });
}

async function renderCashierPage() {
  if (!document.body.classList.contains("cashier-body")) return;

  try {
    await loadBackofficeUser();
    await renderScanPage();
    renderCashierStats(readyOrdersCache);
    renderRecentCashierScans();
  } catch (error) {
    showMessage("scan-message", "error", error.message);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (!document.body.classList.contains("cashier-body")) return;

  bindCashierFocus();
  renderCashierClock();
  window.setInterval(renderCashierClock, 1000);
  renderCashierPage();
  startLiveRefresh("cashier-page", renderCashierPage, 8000);

  window.addEventListener("pointchaud:scan-success", event => {
    const order = event.detail?.order;
    if (!order) return;

    const current = getRecentCashierScans();
    current.unshift({
      orderId: order.id,
      customerName: order.customer_name,
      locationName: order.location_name,
      scannedAt: formatTimestamp(new Date())
    });
    saveRecentCashierScans(current);
    renderRecentCashierScans();
    renderCashierStats(readyOrdersCache);
  });
});
