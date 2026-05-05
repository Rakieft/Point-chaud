async function renderClientDashboard() {
  if (!document.getElementById("client-name")) return;

  const user = (await initClientShell?.()) || requireAuth(["client"]);
  if (!user) return;

  const welcome = document.getElementById("client-name");
  const notificationsList = document.getElementById("notifications-list");

  if (welcome) {
    welcome.textContent = user.name;
  }

  try {
    const [orders, notifications] = await Promise.all([apiRequest("/orders/my"), apiRequest("/notifications")]);
    renderClientStats(orders, notifications);
    renderClientDashboardHighlights(orders, notifications);
    renderNotifications(notificationsList, notifications);
  } catch (error) {
    showMessage("dashboard-message", "error", error.message);
  }
}

function renderClientStats(orders, notifications) {
  const container = document.getElementById("client-stats-grid");
  if (!container) return;

  const pendingValidation = orders.filter(order => order.status === "pending_validation").length;
  const awaitingPayment = orders.filter(
    order => order.status === "awaiting_payment" && (!order.payment_proof || order.payment_status === "rejected")
  ).length;
  const readyOrders = orders.filter(order => order.status === "paid").length;
  const rejectedOrders = orders.filter(order => order.status === "cancelled").length;
  const totalSpent = orders
    .filter(order => ["paid", "completed"].includes(order.status))
    .reduce((sum, order) => sum + Number(order.total || 0), 0);

  const cards = [
    ["Commandes totales", orders.length, "Historique complet de tes commandes"],
    ["En attente", pendingValidation, "Le manager n'a pas encore valide"],
    ["Paiements a faire", awaitingPayment, "Tu peux payer ces commandes"],
    ["Commandes pretes", readyOrders, "QR code disponible pour recuperation"],
    ["Refusees", rejectedOrders, "Commandes archivees dans la section refusee"],
    ["Notifications", notifications.length, "Messages recents du systeme"],
    ["Total confirme", formatMoney(totalSpent), "Montant des commandes deja confirmees"]
  ];

  container.innerHTML = cards
    .map(
      ([label, value, text]) => `
        <article class="client-stat-card">
          <small>${label}</small>
          <h3>${value}</h3>
          <p>${text}</p>
        </article>
      `
    )
    .join("");
}

function renderClientDashboardHighlights(orders, notifications) {
  const nextActions = document.getElementById("client-next-actions");
  const activeOrdersPreview = document.getElementById("client-active-orders-preview");

  const pendingValidation = orders.filter(order => order.status === "pending_validation");
  const paymentRequired = orders.filter(
    order => order.status === "awaiting_payment" && (!order.payment_proof || order.payment_status === "rejected")
  );
  const proofPending = orders.filter(
    order => order.status === "awaiting_payment" && order.payment_proof && order.payment_status === "pending"
  );
  const readyOrders = orders.filter(order => order.status === "paid");
  const activeOrders = orders
    .filter(order => !["cancelled", "completed"].includes(order.status))
    .sort((a, b) => Number(b.id) - Number(a.id))
    .slice(0, 3);

  if (nextActions) {
    const actions = [];

    if (paymentRequired.length) {
      actions.push({
        title: "Paiement a effectuer",
        text: `${paymentRequired.length} commande(s) validee(s) attendent maintenant ton paiement et ta preuve.`,
        href: "./client-orders.html"
      });
    }

    if (proofPending.length) {
      actions.push({
        title: "Preuve en verification",
        text: `${proofPending.length} preuve(s) de paiement ont ete envoyees et attendent la confirmation du manager.`,
        href: "./client-orders.html"
      });
    }

    if (readyOrders.length) {
      actions.push({
        title: "Commande prete a suivre",
        text: `${readyOrders.length} commande(s) sont confirmees avec QR code ou suivi de livraison disponible.`,
        href: "./client-orders.html"
      });
    }

    if (pendingValidation.length) {
      actions.push({
        title: "Validation en attente",
        text: `${pendingValidation.length} commande(s) sont en cours de validation par le manager.`,
        href: "./client-orders.html"
      });
    }

    if (!actions.length) {
      actions.push({
        title: "Tout est calme",
        text: notifications.length
          ? "Aucune action urgente. Tu peux consulter tes notifications ou lancer une nouvelle commande."
          : "Aucune action urgente. Tu peux commencer une nouvelle commande quand tu veux.",
        href: "./client-products.html"
      });
    }

    nextActions.innerHTML = actions
      .map(
        action => `
          <a class="client-helper-item client-dashboard-action-card" href="${action.href}">
            <strong>${action.title}</strong>
            <p>${action.text}</p>
          </a>
        `
      )
      .join("");
  }

  if (activeOrdersPreview) {
    activeOrdersPreview.innerHTML = activeOrders.length
      ? activeOrders
          .map(order => {
            const state = getClientOrderState(order);
            return `
              <a class="client-helper-item client-dashboard-order-card" href="./client-orders.html">
                <div class="toolbar">
                  <strong>Commande #${order.id}</strong>
                  <span class="status ${state.badgeClass}">${state.badgeText}</span>
                </div>
                <p>${order.order_type === "delivery" ? "Livraison" : order.location_name} • ${formatDateTime(order.pickup_date, order.pickup_time)}</p>
                <small>${order.items.length} produit(s) • ${formatMoney(order.total)}</small>
              </a>
            `;
          })
          .join("")
      : `
          <div class="empty-state">
            <h3>Aucune commande active</h3>
            <p>Quand tu passeras une commande, elle apparaitra ici en priorite.</p>
          </div>
        `;
  }
}

function renderCatalog(products, options = {}) {
  const container = document.getElementById(options.gridId || "products-grid");
  const search = document.getElementById(options.searchId || "product-search");
  const category = document.getElementById(options.categoryId || "category-filter");
  const sort = document.getElementById(options.sortId || "product-sort");
  const chips = document.getElementById(options.chipsId || "public-category-chips");
  const resultsCount = document.getElementById(options.resultsCountId || "public-results-count");
  const resultsNote = document.getElementById(options.resultsNoteId || "public-results-note");
  const cartCount = document.getElementById(options.cartCountId || "public-cart-count");
  const cartTotal = document.getElementById(options.cartTotalId || "public-cart-total");

  if (!container) {
    return;
  }

  const categories = [...new Set(products.map(product => product.category_name).filter(Boolean))];

  if (category && !category.dataset.loaded) {
    category.innerHTML += categories.map(name => `<option value="${name}">${name}</option>`).join("");
    category.dataset.loaded = "true";
  }

  const updateCartSummary = () => {
    const cart = getCart();
    const totalItems = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const totalPrice = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);

    if (cartCount) {
      cartCount.textContent = `${totalItems} article${totalItems > 1 ? "s" : ""}`;
    }

    if (cartTotal) {
      cartTotal.textContent = formatMoney(totalPrice);
    }
  };

  if (chips && !chips.dataset.loaded) {
    chips.innerHTML = `
      <button class="category-chip active" type="button" data-category-chip="">Tous</button>
      ${categories
        .map(
          name => `<button class="category-chip" type="button" data-category-chip="${name}">${name}</button>`
        )
        .join("")}
    `;

    chips.querySelectorAll("[data-category-chip]").forEach(button => {
      button.addEventListener("click", () => {
        const value = button.dataset.categoryChip || "";
        if (category) {
          category.value = value;
        }

        chips.querySelectorAll("[data-category-chip]").forEach(chip => {
          chip.classList.toggle("active", chip === button);
        });

        draw();
      });
    });

    chips.dataset.loaded = "true";
  }

  const syncActiveChip = value => {
    if (!chips) return;
    chips.querySelectorAll("[data-category-chip]").forEach(button => {
      button.classList.toggle("active", (button.dataset.categoryChip || "") === value);
    });
  };

  const draw = () => {
    const term = (search?.value || "").toLowerCase();
    const selectedCategory = category?.value || "";
    const sortValue = sort?.value || "featured";

    const filtered = products
      .filter(product => {
        const matchesText =
          product.name.toLowerCase().includes(term) ||
          (product.description || "").toLowerCase().includes(term);
        const matchesCategory = !selectedCategory || product.category_name === selectedCategory;
        return matchesText && matchesCategory;
      })
      .sort((a, b) => {
        if (sortValue === "price-asc") return Number(a.price || 0) - Number(b.price || 0);
        if (sortValue === "price-desc") return Number(b.price || 0) - Number(a.price || 0);
        if (sortValue === "name-asc") return String(a.name || "").localeCompare(String(b.name || ""), "fr");
        if (sortValue === "stock-desc") return Number(b.stock || 0) - Number(a.stock || 0);

        const categoryCompare = String(a.category_name || "").localeCompare(String(b.category_name || ""), "fr");
        if (categoryCompare !== 0) return categoryCompare;
        return String(a.name || "").localeCompare(String(b.name || ""), "fr");
      });

    if (resultsCount) {
      resultsCount.textContent = `${filtered.length} produit${filtered.length > 1 ? "s" : ""}`;
    }

    if (resultsNote) {
      resultsNote.textContent = selectedCategory
        ? `Categorie active: ${selectedCategory}`
        : term
          ? `Resultats pour "${search?.value || ""}".`
          : "Catalogue pret a explorer.";
    }

    syncActiveChip(selectedCategory);

    container.innerHTML = filtered.length
      ? filtered
          .map(
            product => `
              <article class="product-card">
                <img
                  src="${resolveProductImage(product)}"
                  alt="${product.name}"
                  loading="lazy"
                  onerror="handleProductImageError(this, '${String(product.name || "").replace(/'/g, "\\'")}', '${String(product.category_name || "Point Chaud").replace(/'/g, "\\'")}')"
                />
                <div class="product-meta">
                  <div class="product-card-head">
                    <span class="badge">${product.category_name || "Produit"}</span>
                    <span class="product-stock-badge ${Number(product.stock || 0) <= 5 ? "low" : "ok"}">
                      ${Number(product.stock || 0) <= 5 ? "Stock limite" : "Disponible"}
                    </span>
                  </div>
                  <div class="product-title-row">
                    <h3>${product.name}</h3>
                    <span class="price">${formatMoney(product.price)}</span>
                  </div>
                  <p class="muted">${product.description || "Produit artisanal du point chaud."}</p>
                  <div class="product-card-footer">
                    <small>Stock disponible: ${product.stock}</small>
                    <button
                      class="btn-primary add-to-cart-btn"
                      data-id="${product.id}"
                      data-name="${encodeURIComponent(product.name)}"
                      data-price="${product.price}">
                      Ajouter au panier
                    </button>
                  </div>
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
        updateCartSummary();

        if (resultsNote) {
          resultsNote.textContent = `${decodeURIComponent(button.dataset.name)} a ete ajoute au panier.`;
        }
      });
    });
  };

  search?.addEventListener("input", draw);
  category?.addEventListener("change", () => {
    syncActiveChip(category.value || "");
    draw();
  });
  sort?.addEventListener("change", draw);
  updateCartSummary();
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
              <small>${formatTimestamp(notification.created_at)}</small>
            </div>
          `
        )
        .join("")
    : `<div class="empty-state"><p>Aucune notification pour l'instant.</p></div>`;
}

async function renderClientOrdersPage() {
  const container = document.getElementById("orders-list");
  if (!container || document.getElementById("client-name")) return;

  const user = (await initClientShell?.()) || requireAuth(["client"]);
  if (!user) return;

  try {
    const [catalog, orders] = await Promise.all([apiRequest("/products"), apiRequest("/orders/my")]);
    renderClientOrders(container, orders, catalog.bankAccounts || []);
  } catch (error) {
    showMessage("dashboard-message", "error", error.message);
  }
}

async function renderClientProductsPage() {
  const container = document.getElementById("client-products-grid");
  const isClientProductsPage =
    document.body.dataset.clientPage === "products" ||
    document.body.classList.contains("client-body") ||
    document.getElementById("client-products-view")?.style.display === "block";
  if (!container || !isClientProductsPage) return;

  const user = (await initClientShell?.()) || requireAuth(["client"]);
  if (!user) return;

  try {
    const catalog = await apiRequest("/products");
    renderCatalog(catalog.products, {
      gridId: "client-products-grid",
      searchId: "client-product-search",
      categoryId: "client-category-filter",
      sortId: "client-product-sort",
      chipsId: "client-category-chips",
      resultsCountId: "client-results-count",
      resultsNoteId: "client-results-note",
      cartCountId: "client-cart-count",
      cartTotalId: "client-cart-total"
    });
  } catch (error) {
    showMessage("dashboard-message", "error", error.message);
  }
}

function getClientOrderState(order) {
  if (order.status === "cancelled") {
    return {
      badgeClass: "rejected",
      badgeText: "Commande refusee",
      helper: "Cette commande a ete refusee ou annulee. Elle est archivee dans les commandes refusees."
    };
  }

  if (order.status === "pending_validation") {
    return {
      badgeClass: "pending_validation",
      badgeText: "En attente de validation",
      helper: "Votre commande est en attente de validation. Aucune action n'est requise pour le moment."
    };
  }

  if (order.status === "awaiting_payment" && order.payment_status === "rejected") {
    return {
      badgeClass: "rejected",
      badgeText: "Preuve rejetee - nouveau paiement requis",
      helper: "La preuve de paiement a ete rejetee. Veuillez envoyer une nouvelle preuve pour continuer."
    };
  }

  if (order.status === "awaiting_payment" && order.payment_status === "pending" && order.payment_proof) {
    return {
      badgeClass: "confirmed",
      badgeText: "Paiement envoye - confirmation en attente",
      helper: "Votre preuve a ete envoyee. Le manager doit maintenant confirmer le paiement."
    };
  }

  if (order.status === "awaiting_payment") {
    return {
      badgeClass: "validated",
      badgeText: "Commande validee - paiement requis",
      helper: "Veuillez effectuer le paiement puis envoyer la preuve pour continuer."
    };
  }

  if (order.status === "paid") {
    if (order.order_type === "delivery") {
      if (order.delivery_status === "pending_assignment") {
        return {
          badgeClass: "validated",
          badgeText: "Paiement confirme - livreur a affecter",
          helper: "Le paiement est confirme. L'equipe affecte maintenant un livreur a votre commande."
        };
      }

      if (order.delivery_status === "assigned") {
        return {
          badgeClass: "confirmed",
          badgeText: "Livreur assigne",
          helper: "Votre commande est confirmee et un livreur a ete assigne."
        };
      }

      if (order.delivery_status === "out_for_delivery") {
        return {
          badgeClass: "confirmed",
          badgeText: "Commande en route",
          helper: "Votre commande est actuellement en livraison."
        };
      }

      if (order.delivery_status === "return_to_branch") {
        return {
          badgeClass: "return_to_branch",
          badgeText: "Retour au point chaud",
          helper:
            order.return_note ||
            "Le livreur n'a pas pu remettre votre commande. L'equipe du point chaud va vous recontacter."
        };
      }
    }

    return {
      badgeClass: "confirmed",
      badgeText: "Commande confirmee / prete",
      helper: "Votre commande est prete a etre recuperee. Presentez le QR code au point chaud."
    };
  }

  if (order.status === "completed") {
    return {
      badgeClass: "confirmed",
      badgeText: order.order_type === "delivery" ? "Commande livree" : "Commande recuperee",
      helper:
        order.order_type === "delivery"
          ? "Cette commande a ete livree avec succes."
          : "Cette commande a deja ete remise au point chaud."
    };
  }

  return {
    badgeClass: "rejected",
    badgeText: "Commande archivee",
    helper: "Cette commande est archivee."
  };
}

function renderClientTimeline(order) {
  const isCancelled = order.status === "cancelled";
  const isRejectedPayment = order.status === "awaiting_payment" && order.payment_status === "rejected";
  const isDelivery = order.order_type === "delivery";
  const isReturnedDelivery = isDelivery && order.delivery_status === "return_to_branch";

  const steps = [
    { label: "Commande envoyee", state: "done" },
    {
      label: isCancelled ? "Commande refusee" : "Validation manager",
      state: isCancelled ? "current danger" : order.status === "pending_validation" ? "current" : "done"
    },
    {
      label: isRejectedPayment ? "Nouvelle preuve requise" : "Paiement client",
      state: isCancelled
        ? "upcoming muted"
        : order.status === "awaiting_payment"
          ? order.payment_proof && order.payment_status === "pending"
            ? "done"
            : isRejectedPayment
              ? "current danger"
              : "current"
          : ["paid", "completed"].includes(order.status)
            ? "done"
            : "upcoming"
    },
    {
      label: "Confirmation paiement",
      state: isCancelled
        ? "upcoming muted"
        : order.status === "paid" || order.status === "completed"
          ? "done"
          : order.status === "awaiting_payment" && order.payment_proof && order.payment_status === "pending"
            ? "current"
            : "upcoming"
    },
    {
      label: isDelivery ? "Affectation / livraison" : order.status === "completed" ? "Commande retiree" : "QR code & recuperation",
      state: isCancelled
        ? "upcoming muted"
        : isDelivery
          ? isReturnedDelivery
            ? "current danger"
            : order.delivery_status === "delivered" || order.status === "completed"
              ? "done"
              : order.delivery_status === "out_for_delivery"
                ? "current success"
              : order.delivery_status === "assigned" || order.delivery_status === "pending_assignment"
                ? "current"
                : "upcoming"
          : order.status === "completed"
          ? "done"
          : order.status === "paid"
            ? "current success"
            : "upcoming"
    }
  ];

  return `
    <div class="client-order-timeline">
      ${steps
        .map(
          step => `
            <div class="client-timeline-step ${step.state}">
              <span class="client-timeline-dot"></span>
              <small>${step.label}</small>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderBankAccountList(bankAccounts) {
  if (!bankAccounts.length) {
    return `<div class="empty-state"><p>Les informations de paiement seront ajoutees prochainement.</p></div>`;
  }

  const mobileMethods = `
    <div class="client-payment-methods">
      <div class="client-payment-method">
        <strong>MonCash</strong>
        <span>Compte Point Chaud</span>
      </div>
      <div class="client-payment-method">
        <strong>NatCash</strong>
        <span>Compte Point Chaud</span>
      </div>
    </div>
  `;

  return `
    ${mobileMethods}
    <div class="client-bank-list">
      ${bankAccounts
        .map(
          account => `
            <div class="client-bank-item">
              <strong>${account.bank_name}</strong>
              <span>${account.account_name}</span>
              <small>${account.account_number}</small>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function formatPaymentMethod(method) {
  const labels = {
    moncash: "MonCash",
    natcash: "NatCash",
    bank_transfer: "Virement bancaire"
  };

  return labels[method] || "Pas encore renseigne";
}

function formatDeliveryStatusLabel(status) {
  const labels = {
    pending_assignment: "En attente d'affectation",
    assigned: "Livreur assigne",
    out_for_delivery: "En livraison",
    return_to_branch: "Retour au point chaud",
    delivered: "Livree"
  };

  return labels[status] || "Retrait";
}

let clientOrdersCache = [];
let latestClientBankAccounts = [];

function clientOrderSectionLabel(order) {
  if (order.status === "cancelled") return "Refusee";
  if (order.status === "completed") return order.order_type === "delivery" ? "Livree" : "Archivee";
  if (order.delivery_status === "return_to_branch") return "Retour";
  return "En cours";
}

function openClientOrderDetail(orderId) {
  const order = clientOrdersCache.find(item => item.id === orderId);
  const modal = document.getElementById("client-order-detail-modal");
  const title = document.getElementById("client-order-detail-title");
  const content = document.getElementById("client-order-detail-content");
  if (!order || !modal || !content) return;

  if (title) {
    title.textContent = `Commande #${order.id}`;
  }

  content.innerHTML = `
    <div class="admin-detail-grid">
      <section class="admin-detail-panel">
        <h4>Resume</h4>
        <div class="stack-sm">
          <span>Statut: ${getClientOrderState(order).badgeText}</span>
          <span>Date: ${formatDateValue(order.created_at)}</span>
          <span>Total: ${formatMoney(order.total)}</span>
          <span>Mode: ${order.order_type === "delivery" ? "Livraison" : "Retrait"}</span>
          <span>${order.order_type === "delivery" ? "Adresse" : "Point chaud"}: ${order.order_type === "delivery" ? order.delivery_address || "Adresse non renseignee" : order.location_name}</span>
          <span>Retrait / livraison: ${formatDateTime(order.pickup_date, order.pickup_time)}</span>
          ${order.return_note ? `<span>Motif retour: ${order.return_note}</span>` : ""}
        </div>
      </section>

      <section class="admin-detail-panel">
        <h4>Produits</h4>
        <div class="stack-sm">
          ${order.items
            .map(
              item => `
                <div class="line-item">
                  <strong>${item.name}</strong>
                  <span>${item.quantity} x ${formatMoney(item.price)}</span>
                </div>
              `
            )
            .join("")}
        </div>
      </section>

      <section class="admin-detail-panel">
        <h4>Suivi</h4>
        ${renderClientTimeline(order)}
        <div class="client-order-note">
          <strong>Message important</strong>
          <p>${getClientOrderState(order).helper}</p>
        </div>
      </section>

      <section class="admin-detail-panel">
        <h4>Paiement et retrait</h4>
        <div class="stack-sm">
          <span>Paiement: ${formatPaymentMethod(order.payment_method)}</span>
          <span>Etat paiement: ${order.status === "cancelled" ? "Non requis" : getClientOrderState(order).badgeText}</span>
          ${
            order.order_type === "delivery"
              ? `<span>Livreur: ${order.driver_name || "A affecter"}</span><span>Livraison: ${formatDeliveryStatusLabel(order.delivery_status)}</span>`
              : `<span>Manager: ${order.confirmer_name || order.validator_name || "Point Chaud"}</span>`
          }
        </div>
        ${
          order.status === "awaiting_payment" && (!order.payment_proof || order.payment_status === "rejected")
            ? `
              <div class="client-payment-panel">
                <div class="section-head">
                  <div>
                    <h3>Paiement de la commande</h3>
                    <p>Le paiement est disponible uniquement apres validation.</p>
                  </div>
                  <a class="btn btn-light" href="../pages/checkout.html?orderId=${order.id}">Page paiement complete</a>
                </div>

                <div class="client-payment-grid">
                  <div class="client-payment-info">
                    <h4>Methodes disponibles</h4>
                    ${renderBankAccountList(latestClientBankAccounts)}
                  </div>

                  <form class="client-proof-form stack" data-order-id="${order.id}" enctype="multipart/form-data">
                    <label>
                      Methode de paiement
                      <select name="payment_method" required>
                        <option value="moncash">MonCash</option>
                        <option value="natcash">NatCash</option>
                        <option value="bank_transfer">Virement bancaire</option>
                      </select>
                    </label>
                    <label>
                      Reference de transaction
                      <input name="transaction_reference" required />
                    </label>
                    <label>
                      Preuve de paiement
                      <input name="proof" type="file" accept=".png,.jpg,.jpeg,.pdf" required />
                    </label>
                    <div class="card-actions">
                      <button class="btn-primary" type="submit">
                        ${order.payment_status === "rejected" ? "Renvoyer la preuve" : "Envoyer la preuve"}
                      </button>
                    </div>
                    <div id="proof-message-${order.id}" class="message-box"></div>
                  </form>
                </div>
              </div>
            `
            : ""
        }
        ${
          order.status === "awaiting_payment" && order.payment_proof && order.payment_status === "pending"
            ? `
              <div class="client-order-note">
                <strong>Preuve envoyee</strong>
                <p>Votre preuve de paiement a bien ete transmise. Le manager la verifiera avant de generer le QR code.</p>
              </div>
            `
            : ""
        }
        ${
          order.qrCode
            ? `
              <div class="qr-box" style="margin-top:16px;">
                <img src="${order.qrCode.image}" alt="QR commande ${order.id}" />
                <small>${order.qrCode.token}</small>
              </div>
            `
            : ""
        }
      </section>
    </div>
  `;

  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  bindClientPaymentForms();
}

function closeClientOrderDetail() {
  const modal = document.getElementById("client-order-detail-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function renderClientOrders(container, orders, bankAccounts) {
  if (!container) return;
  clientOrdersCache = orders;
  latestClientBankAccounts = bankAccounts;
  const summaryContainer = document.getElementById("client-orders-summary");

  if (!orders.length) {
    if (summaryContainer) {
      summaryContainer.innerHTML = "";
    }
    container.innerHTML = `<div class="empty-state"><h3>Pas encore de commande</h3><p>Ton historique apparaitra ici apres la premiere commande.</p></div>`;
    return;
  }

  const activeOrders = orders.filter(order => !["cancelled", "completed"].includes(order.status));
  const archivedOrders = orders.filter(order => order.status === "completed");
  const rejectedOrders = orders.filter(order => order.status === "cancelled");
  const paymentPendingOrders = orders.filter(order => order.status === "awaiting_payment").length;
  const readyOrders = orders.filter(
    order =>
      order.status === "paid" &&
      (order.order_type === "pickup" ||
        ["pending_assignment", "assigned", "out_for_delivery", "return_to_branch", "delivered"].includes(order.delivery_status))
  ).length;
  const confirmedTotal = orders
    .filter(order => ["paid", "completed"].includes(order.status))
    .reduce((sum, order) => sum + Number(order.total || 0), 0);

  if (summaryContainer) {
    const stats = [
      ["Total commandes", orders.length, "Toutes tes commandes depuis la creation du compte"],
      ["En cours", activeOrders.length, "Validation, paiement, preparation ou livraison"],
      ["Paiement requis", paymentPendingOrders, "Commandes validees qui attendent ton paiement"],
      ["Pretes / confirmees", readyOrders, "QR ou livraison en preparation"],
      ["Archivees", archivedOrders.length, "Commandes completees ou deja retirees"],
      ["Refusees", rejectedOrders.length, "Aucun paiement requis pour ces commandes"],
      ["Montant confirme", formatMoney(confirmedTotal), "Total des commandes deja confirmees"]
    ];

    summaryContainer.innerHTML = stats
      .map(
        ([label, value, text]) => `
          <article class="client-stat-card client-orders-stat-card">
            <small>${label}</small>
            <h3>${value}</h3>
            <p>${text}</p>
          </article>
        `
      )
      .join("");
  }

  const renderOrderCard = order => `
            <article class="order-card client-order-card client-order-summary-card" onclick="openClientOrderDetail(${order.id})" role="button" tabindex="0">
              <div class="client-order-head">
                <div class="stack-sm">
                  <div class="toolbar">
                    <strong>Commande #${order.id}</strong>
                    <span class="status ${getClientOrderState(order).badgeClass}">${getClientOrderState(order).badgeText}</span>
                  </div>
                  <small>Commande du ${formatDateValue(order.created_at)}</small>
                </div>
                <div class="client-order-total">${formatMoney(order.total)}</div>
              </div>
              <div class="client-order-summary-grid">
                <div class="client-meta-item">
                  <small>Mode</small>
                  <strong>${order.order_type === "delivery" ? "Livraison" : "Retrait"}</strong>
                </div>
                <div class="client-meta-item">
                  <small>${order.order_type === "delivery" ? "Adresse" : "Point chaud"}</small>
                  <strong>${order.order_type === "delivery" ? order.delivery_address || "Adresse non renseignee" : order.location_name}</strong>
                </div>
                <div class="client-meta-item">
                  <small>Retrait / livraison</small>
                  <strong>${formatDateTime(order.pickup_date, order.pickup_time)}</strong>
                </div>
                <div class="client-meta-item">
                  <small>Resume</small>
                  <strong>${order.items.length} produit(s)</strong>
                </div>
                <div class="client-meta-item">
                  <small>Section</small>
                  <strong>${clientOrderSectionLabel(order)}</strong>
                </div>
                <div class="client-meta-item">
                  <small>${order.order_type === "delivery" ? "Livraison" : "Validation"}</small>
                  <strong>${order.order_type === "delivery" ? formatDeliveryStatusLabel(order.delivery_status) : order.validator_name || "En attente"}</strong>
                </div>
              </div>
              <div class="client-order-note compact">
                <strong>${getClientOrderState(order).helper}</strong>
                <p>Cliquer pour voir les details de la commande.</p>
              </div>
            </article>
          `;

  container.innerHTML = `
    <section class="client-order-section">
      <div class="section-head">
        <div>
          <h2>Commandes en cours</h2>
          <p>Commandes en validation, paiement ou pretes a etre recuperees.</p>
        </div>
      </div>
      <div class="client-orders-grid">
        ${
          activeOrders.length
            ? activeOrders.map(renderOrderCard).join("")
            : `<div class="empty-state"><p>Aucune commande active pour le moment.</p></div>`
        }
      </div>
    </section>

    <section class="client-order-section">
      <div class="section-head">
        <div>
          <h2>Commandes archivees</h2>
          <p>Commandes deja retirees ou completees.</p>
        </div>
      </div>
      <div class="client-orders-grid">
        ${
          archivedOrders.length
            ? archivedOrders.map(renderOrderCard).join("")
            : `<div class="empty-state"><p>Aucune commande archivee pour le moment.</p></div>`
        }
      </div>
    </section>

    <section class="client-order-section">
      <div class="section-head">
        <div>
          <h2>Commandes refusees</h2>
          <p>Les commandes refusees sont archivees ici et n'attendent aucun paiement.</p>
        </div>
      </div>
      <div class="client-orders-grid">
        ${
          rejectedOrders.length
            ? rejectedOrders.map(renderOrderCard).join("")
            : `<div class="empty-state"><p>Aucune commande refusee.</p></div>`
        }
      </div>
    </section>
  `;

  container.querySelectorAll(".client-order-summary-card").forEach(card => {
    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        card.click();
      }
    });
  });
}

function bindClientPaymentForms() {
  document.querySelectorAll(".client-proof-form").forEach(form => {
    form.addEventListener("submit", async event => {
      event.preventDefault();

      const orderId = form.dataset.orderId;
      const formData = new FormData(form);

      try {
        const data = await apiRequest(`/payments/${orderId}/proof`, {
          method: "POST",
          body: formData
        });

        showMessage(`proof-message-${orderId}`, "success", data.message);
        setTimeout(() => {
          renderClientOrdersPage();
        }, 700);
      } catch (error) {
        showMessage(`proof-message-${orderId}`, "error", error.message);
      }
    });
  });
}

async function renderCheckoutPage() {
  const hasCheckoutContent =
    document.getElementById("checkout-order-form") || document.getElementById("payment-form");

  if (!hasCheckoutContent) return;

  const user = (await initClientShell?.()) || requireAuth(["client"]);
  if (!user) return;

  const orderId = new URLSearchParams(window.location.search).get("orderId");
  const form = document.getElementById("payment-form");
  const bankAccountsBox = document.getElementById("bank-accounts");
  const locationSelect = document.getElementById("location_id");
  const orderForm = document.getElementById("checkout-order-form");
  const cartPreview = document.getElementById("checkout-cart-preview");
  const orderTypeSelect = document.getElementById("order_type");
  const deliveryFields = document.getElementById("delivery-fields");
  const deliveryAddressInput = document.getElementById("delivery_address");
  const deliveryFeePreview = document.getElementById("delivery-fee-preview");
  const locationStockPreview = document.getElementById("checkout-location-stock-preview");
  let checkoutCatalog = null;

  const renderCheckoutLocationStock = () => {
    if (!locationStockPreview || !checkoutCatalog || !locationSelect) return;

    const cart = getCart();
    const selectedLocationId = Number(locationSelect.value || 0);

    if (!cart.length) {
      locationStockPreview.innerHTML = `<div class="empty-state"><p>Le panier est vide.</p></div>`;
      return;
    }

    const productMap = new Map(checkoutCatalog.products.map(product => [Number(product.id), product]));
    const lines = cart.map(item => {
      const product = productMap.get(Number(item.product_id));
      const locationStock =
        product?.location_stocks?.find(stock => Number(stock.location_id) === selectedLocationId)?.stock ?? 0;
      const enough = Number(locationStock) >= Number(item.quantity);

      return `
        <div class="line-item client-checkout-stock-item">
          <strong>${item.name}</strong>
          <span>${item.quantity} demande(s)</span>
          <small class="${enough ? "muted" : "text-danger"}">
            Disponible ici: ${locationStock}${enough ? "" : " - stock insuffisant"}
          </small>
        </div>
      `;
    });

    locationStockPreview.innerHTML = lines.join("");
  };

  try {
    const catalog = await apiRequest("/products");
    checkoutCatalog = catalog;

    if (locationSelect) {
      locationSelect.innerHTML = catalog.locations
        .map(location => `<option value="${location.id}">${location.name} - ${location.address}</option>`)
        .join("");
    }

    const deliveryFeeMap = {
      1: 180,
      2: 220,
      3: 160
    };

    const syncDeliveryFields = () => {
      const isDelivery = orderTypeSelect?.value === "delivery";
      if (deliveryFields) {
        deliveryFields.style.display = isDelivery ? "grid" : "none";
      }
      if (deliveryAddressInput) {
        deliveryAddressInput.required = isDelivery;
      }
      if (deliveryFeePreview && locationSelect) {
        const fee = deliveryFeeMap[Number(locationSelect.value)] || 200;
        deliveryFeePreview.textContent = isDelivery
          ? `Frais estimes: ${formatMoney(fee)} selon la succursale choisie.`
          : "Aucun frais de livraison pour un retrait sur place.";
      }
    };

    orderTypeSelect?.addEventListener("change", syncDeliveryFields);
    locationSelect?.addEventListener("change", () => {
      syncDeliveryFields();
      renderCheckoutLocationStock();
    });
    syncDeliveryFields();
    renderCheckoutLocationStock();

    if (bankAccountsBox) {
      bankAccountsBox.innerHTML = catalog.bankAccounts
        .map(
          account => `
            <article class="client-payment-account-card">
              <div class="client-payment-account-head">
                <strong>${account.bank_name}</strong>
                <span class="badge">${account.account_type || "Paiement"}</span>
              </div>
              <span>${account.account_name}</span>
              <small>${account.account_number}</small>
            </article>
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
    const totalItems = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    cartPreview.innerHTML = cart.length
      ? cart
          .map(
            item => `
              <article class="line-item client-checkout-cart-item">
                <div>
                  <strong>${item.name}</strong>
                  <small>${item.quantity} article${Number(item.quantity) > 1 ? "s" : ""}</small>
                </div>
                <span>${formatMoney(item.price * item.quantity)}</span>
              </article>
            `
          )
          .join("") +
        `
          <article class="line-item client-checkout-cart-total">
            <div>
              <strong>Total commande</strong>
              <small>${totalItems} article${totalItems > 1 ? "s" : ""}</small>
            </div>
            <span class="price">${formatMoney(total)}</span>
          </article>
        `
      : `<div class="empty-state"><p>Le panier est vide.</p></div>`;
  }

  if (orderForm) {
    orderForm.addEventListener("submit", async event => {
      event.preventDefault();

      const cart = getCart();
      const selectedLocationId = Number(locationSelect?.value || 0);

      if (checkoutCatalog && selectedLocationId) {
        const productMap = new Map(checkoutCatalog.products.map(product => [Number(product.id), product]));
        const insufficient = cart.find(item => {
          const product = productMap.get(Number(item.product_id));
          const locationStock =
            product?.location_stocks?.find(stock => Number(stock.location_id) === selectedLocationId)?.stock ?? 0;
          return Number(locationStock) < Number(item.quantity);
        });

        if (insufficient) {
          showMessage(
            "checkout-message",
            "error",
            `Stock insuffisant pour ${insufficient.name} dans cette succursale. Ajuste le panier ou choisis un autre point chaud.`
          );
          return;
        }
      }

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

async function renderClientProfilePage() {
  if (!document.body.classList.contains("client-body") || document.body.dataset.clientPage !== "profile") return;

  const user = (await initClientShell?.()) || requireAuth(["client"]);
  const form = document.getElementById("client-profile-form");
  if (!user || !form) return;

  try {
    const profile = await apiRequest("/users/me");
    storage.user = profile;

    form.name.value = profile.name || "";
    form.email.value = profile.email || "";
    form.phone.value = profile.phone || "";
    form.avatar_url.value = profile.avatar_url || "";
    form.bio.value = profile.bio || "";

    document.querySelectorAll("[data-client-name]").forEach(element => {
      element.textContent = profile.name || "Client";
    });
    document.querySelectorAll("[data-client-email]").forEach(element => {
      element.textContent = profile.email || "";
    });
    document.querySelectorAll("[data-client-phone]").forEach(element => {
      element.textContent = profile.phone || "Telephone non renseigne";
    });
    document.querySelectorAll("[data-client-avatar]").forEach(element => {
      element.textContent = getClientInitials(profile.name);
    });

    const summaryName = document.getElementById("client-profile-summary-name");
    const summaryEmail = document.getElementById("client-profile-summary-email");
    const summaryPhone = document.getElementById("client-profile-summary-phone");
    const bioPreview = document.getElementById("client-profile-bio-preview");
    const bioSummary = document.getElementById("client-profile-bio-summary");
    const contactSummary = document.getElementById("client-profile-contact-summary");

    if (summaryName) summaryName.textContent = profile.name || "Client";
    if (summaryEmail) summaryEmail.textContent = profile.email || "Email non renseigne";
    if (summaryPhone) summaryPhone.textContent = profile.phone || "Telephone non renseigne";
    if (bioPreview) {
      bioPreview.textContent = profile.bio || "Ajoute une courte bio pour aider l'equipe a mieux te reconnaitre.";
    }
    if (bioSummary) {
      bioSummary.textContent = profile.bio || "Une courte note peut aider l'equipe a mieux te servir.";
    }
    if (contactSummary) {
      contactSummary.textContent = profile.phone
        ? `${profile.email || "Email non renseigne"} • ${profile.phone}`
        : `${profile.email || "Email non renseigne"} • Telephone a completer`;
    }
  } catch (error) {
    showMessage("profile-message", "error", error.message);
  }

  if (!form.dataset.bound) {
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(form).entries());

      try {
        const data = await apiRequest("/users/me", {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
        storage.user = data.user;
        showMessage("profile-message", "success", data.message);
        renderClientProfilePage();
      } catch (error) {
        showMessage("profile-message", "error", error.message);
      }
    });

    form.dataset.bound = "true";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  renderPublicCatalogPage();
  renderClientDashboard();
  renderClientOrdersPage();
  renderClientProductsPage();
  renderClientProfilePage();
  renderCheckoutPage();

  if (document.getElementById("client-name")) {
    startLiveRefresh("client-dashboard", renderClientDashboard, 15000);
  }

  if (document.getElementById("orders-list")) {
    startLiveRefresh("client-orders", renderClientOrdersPage, 12000);
  }
});
