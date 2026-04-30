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
            <input type="number" min="1" value="${item.quantity}" onchange="updateCartQuantity(${item.product_id}, this.value)" />
            <button class="btn-danger" onclick="removeFromCart(${item.product_id})">Retirer</button>
          </div>
        </div>
      `
    )
    .join("");

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  totalEl.textContent = formatMoney(total);
}

document.addEventListener("DOMContentLoaded", renderCartPage);
