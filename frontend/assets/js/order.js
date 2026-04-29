async function renderClientDashboard() {
  if (!document.getElementById("client-name")) return;

  const user = requireAuth(["client"]);
  if (!user) return;

  const welcome = document.getElementById("client-name");
  const notificationsList = document.getElementById("notifications-list");
  const ordersContainer = document.getElementById("orders-list");

  if (welcome) {
    welcome.textContent = user.name;
  }

  try {
    const [catalog, orders, notifications] = await Promise.all([
      apiRequest("/products"),
      apiRequest("/orders/my"),
      apiRequest("/notifications")
    ]);

    renderCatalog(catalog.products);
    renderNotifications(notificationsList, notifications);
    renderClientOrders(ordersContainer, orders);
  } catch (error) {
    showMessage("dashboard-message", "error", error.message);
  }
}

function renderCatalog(products) {
  const container = document.getElementById("products-grid");
  const search = document.getElementById("product-search");
  const category = document.getElementById("category-filter");

  if (!container) {
    return;
  }

  const categories = [...new Set(products.map(product => product.category_name).filter(Boolean))];

  if (category && !category.dataset.loaded) {
    category.innerHTML += categories.map(name => `<option value="${name}">${name}</option>`).join("");
    category.dataset.loaded = "true";
  }

  const draw = () => {
    const term = (search?.value || "").toLowerCase();
    const selectedCategory = category?.value || "";

    const filtered = products.filter(product => {
      const matchesText =
        product.name.toLowerCase().includes(term) ||
        (product.description || "").toLowerCase().includes(term);
      const matchesCategory = !selectedCategory || product.category_name === selectedCategory;
      return matchesText && matchesCategory;
    });

    container.innerHTML = filtered.length
      ? filtered
          .map(
            product => `
              <article class="product-card">
                <img src="${product.image || "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=80"}" alt="${product.name}" />
                <div class="product-meta">
                  <span class="badge">${product.category_name || "Produit"}</span>
                  <h3>${product.name}</h3>
                  <p class="muted">${product.description || "Produit artisanal du point chaud."}</p>
                  <span class="price">${formatMoney(product.price)}</span>
                  <small>Stock disponible: ${product.stock}</small>
                  <button
                    class="btn-primary add-to-cart-btn"
                    data-id="${product.id}"
                    data-name="${encodeURIComponent(product.name)}"
                    data-price="${product.price}">
                    Ajouter au panier
                  </button>
                </div>
              </article>
            `
          )
          .join("")
      : `<div class="empty-state"><h3>Aucun produit trouve</h3><p>Essaie un autre mot-cle ou une autre categorie.</p></div>`;

    container.querySelectorAll(".add-to-cart-btn").forEach(button => {
      button.addEventListener("click", () => {
        addToCart({
          id: Number(button.dataset.id),
          name: decodeURIComponent(button.dataset.name),
          price: Number(button.dataset.price)
        });
      });
    });
  };

  search?.addEventListener("input", draw);
  category?.addEventListener("change", draw);
  draw();
}

function renderNotifications(container, notifications) {
  if (!container) return;

  container.innerHTML = notifications.length
    ? notifications
        .map(
          notification => `
            <div class="notification-item">
              <strong>${notification.is_read ? "Lu" : "Nouveau"}</strong>
              <span>${notification.message}</span>
              <small>${new Date(notification.created_at).toLocaleString("fr-FR")}</small>
            </div>
          `
        )
        .join("")
    : `<div class="empty-state"><p>Aucune notification pour l'instant.</p></div>`;
}

function renderClientOrders(container, orders) {
  if (!container) return;

  container.innerHTML = orders.length
    ? orders
        .map(
          order => `
            <article class="order-card">
              <div class="order-meta">
                <div class="toolbar">
                  <strong>Commande #${order.id}</strong>
                  <span class="status ${order.status}">${order.status}</span>
                  <span class="status ${order.payment_status}">${order.payment_status}</span>
                </div>
                <span>Retrait: ${order.location_name} - ${formatDateTime(order.pickup_date, order.pickup_time)}</span>
                <span>Total: ${formatMoney(order.total)}</span>
              </div>
              <div class="stack-sm">
                ${order.items
                  .map(item => `<div class="line-item">${item.name} x ${item.quantity} - ${formatMoney(item.price)}</div>`)
                  .join("")}
              </div>
              ${
                order.status === "awaiting_payment"
                  ? `
                    <div class="card-actions">
                      <a class="btn btn-primary" href="../pages/checkout.html?orderId=${order.id}">Payer maintenant</a>
                    </div>
                  `
                  : ""
              }
              ${
                order.qrCode
                  ? `
                    <div class="qr-box">
                      <img src="${order.qrCode.image}" alt="QR commande ${order.id}" />
                      <small>Token securise: ${order.qrCode.token}</small>
                    </div>
                  `
                  : ""
              }
            </article>
          `
        )
        .join("")
    : `<div class="empty-state"><h3>Pas encore de commande</h3><p>Ton historique apparaitra ici apres la premiere commande.</p></div>`;
}

async function renderCheckoutPage() {
  const hasCheckoutContent =
    document.getElementById("checkout-order-form") || document.getElementById("payment-form");

  if (!hasCheckoutContent) return;

  const user = requireAuth(["client"]);
  if (!user) return;

  const orderId = new URLSearchParams(window.location.search).get("orderId");
  const form = document.getElementById("payment-form");
  const bankAccountsBox = document.getElementById("bank-accounts");
  const locationSelect = document.getElementById("location_id");
  const orderForm = document.getElementById("checkout-order-form");
  const cartPreview = document.getElementById("checkout-cart-preview");

  try {
    const catalog = await apiRequest("/products");

    if (locationSelect) {
      locationSelect.innerHTML = catalog.locations
        .map(location => `<option value="${location.id}">${location.name} - ${location.address}</option>`)
        .join("");
    }

    if (bankAccountsBox) {
      bankAccountsBox.innerHTML = catalog.bankAccounts
        .map(
          account => `
            <div class="line-item">
              <strong>${account.bank_name}</strong>
              <span>${account.account_name}</span>
              <small>${account.account_number}</small>
            </div>
          `
        )
        .join("");
    }
  } catch (error) {
    showMessage("checkout-message", "error", error.message);
  }

  if (cartPreview) {
    const cart = getCart();
    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    cartPreview.innerHTML = cart.length
      ? cart
          .map(item => `<div class="line-item">${item.name} x ${item.quantity} - ${formatMoney(item.price)}</div>`)
          .join("") + `<div class="line-item"><strong>Total: ${formatMoney(total)}</strong></div>`
      : `<div class="empty-state"><p>Le panier est vide.</p></div>`;
  }

  if (orderForm) {
    orderForm.addEventListener("submit", async event => {
      event.preventDefault();

      const cart = getCart();
      const formData = new FormData(orderForm);
      const payload = Object.fromEntries(formData.entries());
      payload.items = cart.map(item => ({
        product_id: item.product_id,
        quantity: Number(item.quantity)
      }));

      try {
        const data = await apiRequest("/orders", {
          method: "POST",
          body: JSON.stringify(payload)
        });

        saveCart([]);
        showMessage("checkout-message", "success", data.message);
        setTimeout(() => {
          window.location.href = "../pages/dashboard-client.html";
        }, 900);
      } catch (error) {
        showMessage("checkout-message", "error", error.message);
      }
    });
  }

  if (form && orderId) {
    document.getElementById("order-id").textContent = orderId;
    form.addEventListener("submit", async event => {
      event.preventDefault();

      const formData = new FormData(form);

      try {
        const data = await apiRequest(`/payments/${orderId}/proof`, {
          method: "POST",
          body: formData
        });

        showMessage("payment-message", "success", data.message);
      } catch (error) {
        showMessage("payment-message", "error", error.message);
      }
    });
  }
}

async function renderPublicCatalogPage() {
  if (!document.getElementById("products-grid") || document.getElementById("client-name")) return;

  try {
    const catalog = await apiRequest("/products");
    renderCatalog(catalog.products);
  } catch (error) {
    showMessage("dashboard-message", "error", error.message);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  renderPublicCatalogPage();
  renderClientDashboard();
  renderCheckoutPage();
});
