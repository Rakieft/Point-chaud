function addToCart(product) {
  const cart = getCart();
  const existingItem = cart.find(item => item.product_id === product.id);

  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    cart.push({
      product_id: product.id,
      name: product.name,
      price: Number(product.price),
      quantity: 1
    });
  }

  saveCart(cart);
}

function removeFromCart(productId) {
  const cart = getCart().filter(item => item.product_id !== productId);
  saveCart(cart);
  renderCartPage();
}

function updateCartQuantity(productId, quantity) {
  const cart = getCart()
    .map(item => {
      if (item.product_id === productId) {
        return { ...item, quantity: Number(quantity) };
      }

      return item;
    })
    .filter(item => item.quantity > 0);

  saveCart(cart);
  renderCartPage();
}

function renderCartPage() {
  if (document.body.classList.contains("client-body")) {
    initClientShell?.();
  }

  const list = document.getElementById("cart-items");
  const totalEl = document.getElementById("cart-total");
  const subtotalEl = document.getElementById("cart-subtotal");
  const countEl = document.getElementById("cart-count");

  if (!list || !totalEl) {
    return;
  }

  const cart = getCart();

  if (!cart.length) {
    list.innerHTML = `
      <div class="empty-state client-cart-empty">
        <h3>Votre panier est vide</h3>
        <p>Ajoutez quelques produits chauds avant de continuer.</p>
        <a class="btn btn-primary" href="./client-products.html">Explorer le catalogue</a>
      </div>
    `;
    totalEl.textContent = formatMoney(0);
    if (subtotalEl) subtotalEl.textContent = formatMoney(0);
    if (countEl) countEl.textContent = "0 article";
    return;
  }

  list.innerHTML = cart
    .map(
      item => `
        <article class="cart-item client-cart-item">
          <div class="client-cart-item-main">
            <div class="client-cart-item-copy">
              <strong>${item.name}</strong>
              <small>Prix unitaire: ${formatMoney(item.price)}</small>
            </div>
            <div class="client-cart-item-total">
              <span>${formatMoney(item.price * item.quantity)}</span>
            </div>
          </div>
          <div class="inline-fields client-cart-controls">
            <input type="number" min="1" value="${item.quantity}" onchange="updateCartQuantity(${item.product_id}, this.value)" />
            <button class="btn-danger" onclick="removeFromCart(${item.product_id})">Retirer</button>
          </div>
        </article>
      `
    )
    .join("");

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalItems = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  totalEl.textContent = formatMoney(total);
  if (subtotalEl) subtotalEl.textContent = formatMoney(total);
  if (countEl) countEl.textContent = `${totalItems} article${totalItems > 1 ? "s" : ""}`;
}

document.addEventListener("DOMContentLoaded", renderCartPage);
