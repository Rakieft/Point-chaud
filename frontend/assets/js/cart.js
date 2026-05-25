function getCartStockLimit(item) {
  const limit = Number(item?.max_stock ?? item?.available_stock ?? item?.stock ?? 0);
  return Number.isFinite(limit) && limit > 0 ? limit : 0;
}

function showCartFeedback(message, type = "warning") {
  if (typeof showMessage === "function" && document.getElementById("cart-feedback")) {
    showMessage("cart-feedback", type, message);
    return;
  }

  if (typeof window.showToast === "function") {
    window.showToast(message, type);
    return;
  }

  window.alert(message);
}

function addToCart(product) {
  const cart = getCart();
  const nextLocationId = Number(product.location_id || 0);
  const nextLocationName = String(product.location_name || "").trim();
  const nextMaxStock = Number(product.max_stock ?? product.available_stock ?? product.stock ?? 0);

  if (
    nextLocationId &&
    cart.some(item => Number(item.location_id || 0) && Number(item.location_id || 0) !== nextLocationId)
  ) {
    return {
      ok: false,
      message: "Ton panier contient deja des produits d'une autre succursale. Termine d'abord cette commande ou vide le panier."
    };
  }

  const existingItem = cart.find(
    item => item.product_id === product.id && Number(item.location_id || 0) === nextLocationId
  );

  if (existingItem) {
    const limit = nextMaxStock || getCartStockLimit(existingItem);
    if (limit > 0 && existingItem.quantity >= limit) {
      return {
        ok: false,
        message: `Stock maximum atteint pour ${product.name}${nextLocationName ? ` a ${nextLocationName}` : ""}.`
      };
    }

    existingItem.quantity += 1;
    existingItem.max_stock = limit || existingItem.max_stock || 0;
  } else {
    if (nextMaxStock <= 0) {
      return {
        ok: false,
        message: `${product.name} est actuellement indisponible dans cette succursale.`
      };
    }

    cart.push({
      product_id: product.id,
      name: product.name,
      price: Number(product.price),
      quantity: 1,
      location_id: nextLocationId || null,
      location_name: nextLocationName || "",
      max_stock: nextMaxStock
    });
  }

  saveCart(cart);
  return { ok: true };
}

function removeFromCart(productId) {
  const cart = getCart().filter(item => item.product_id !== productId);
  saveCart(cart);
  renderCartPage();
}

function updateCartQuantity(productId, quantity) {
  const requestedQuantity = Math.max(0, Number(quantity || 0));
  const cart = getCart()
    .map(item => {
      if (item.product_id === productId) {
        const limit = getCartStockLimit(item);
        const safeQuantity = limit > 0 ? Math.min(requestedQuantity, limit) : requestedQuantity;

        if (limit > 0 && requestedQuantity > limit) {
          showCartFeedback(
            `Tu ne peux pas depasser ${limit} article${limit > 1 ? "s" : ""} pour ${item.name} dans cette succursale.`,
            "warning"
          );
        }

        return { ...item, quantity: safeQuantity };
      }

      return item;
    })
    .filter(item => item.quantity > 0);

  saveCart(cart);
  renderCartPage();
}

function renderCartPage() {
  const list = document.getElementById("cart-items");
  const totalEl = document.getElementById("cart-total");

  if (!list || !totalEl) {
    return;
  }

  const cart = getCart();

  if (!cart.length) {
    list.innerHTML = `
      <div class="empty-state">
        <h3>Votre panier est vide</h3>
        <p>Ajoutez quelques produits chauds avant de continuer.</p>
      </div>
    `;
    totalEl.textContent = formatMoney(0);
    return;
  }

  list.innerHTML = cart
    .map(
      item => `
        <div class="cart-item">
          <strong>${item.name}</strong>
          <span>${formatMoney(item.price)} x ${item.quantity}</span>
          <div class="inline-fields">
            <input type="number" min="1" ${getCartStockLimit(item) > 0 ? `max="${getCartStockLimit(item)}"` : ""} value="${item.quantity}" onchange="updateCartQuantity(${item.product_id}, this.value)" />
            <button class="btn-danger" onclick="removeFromCart(${item.product_id})">Retirer</button>
          </div>
          ${
            getCartStockLimit(item) > 0
              ? `<small>Maximum pour cette succursale : ${getCartStockLimit(item)}</small>`
              : ""
          }
        </div>
      `
    )
    .join("");

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  totalEl.textContent = formatMoney(total);
}

document.addEventListener("DOMContentLoaded", () => {
  const pathname = window.location.pathname || "";
  const isProductsPage = pathname.endsWith("/products.html");

  if (isProductsPage && typeof guardGuestCartLinks === "function") {
    guardGuestCartLinks();
  }

  renderCartPage();
});
