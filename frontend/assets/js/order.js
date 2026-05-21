let clientNotificationsCache = [];

async function getClientSessionUser() {
  if (typeof window.initClientShell === "function") {
    const shellUser = await window.initClientShell();
    if (shellUser) return shellUser;
  }

  return requireAuth(["client"]);
}

function getHaitiNowSnapshot() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Port-au-Prince",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(new Date()).map(part => [part.type, part.value])
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`
  };
}

function addMinutesToDateTime(dateString, timeString, minutesToAdd) {
  const [year, month, day] = String(dateString || "")
    .split("-")
    .map(Number);
  const [hour, minute] = String(timeString || "")
    .split(":")
    .map(Number);

  const safeDate = new Date(Date.UTC(year, (month || 1) - 1, day || 1, hour || 0, minute || 0, 0));
  safeDate.setUTCMinutes(safeDate.getUTCMinutes() + Number(minutesToAdd || 0));

  const iso = safeDate.toISOString();
  return {
    date: iso.slice(0, 10),
    time: iso.slice(11, 16)
  };
}

function addDaysToDateString(dateString, daysToAdd) {
  const [year, month, day] = String(dateString || "")
    .split("-")
    .map(Number);
  const safeDate = new Date(Date.UTC(year, (month || 1) - 1, day || 1, 0, 0, 0));
  safeDate.setUTCDate(safeDate.getUTCDate() + Number(daysToAdd || 0));
  return safeDate.toISOString().slice(0, 10);
}

function syncCheckoutScheduleConstraints(dateInput, timeInput) {
  if (!dateInput || !timeInput) return;

  const haitiNow = getHaitiNowSnapshot();
  const closingCutoffTime = "20:45";
  const earliestSlot = addMinutesToDateTime(haitiNow.date, haitiNow.time, 5);
  const todayStillAvailable = earliestSlot.time <= closingCutoffTime;

  dateInput.min = haitiNow.date;

  if (!dateInput.value || dateInput.value < haitiNow.date) {
    dateInput.value = todayStillAvailable ? haitiNow.date : addDaysToDateString(haitiNow.date, 1);
  }

  const isToday = dateInput.value === haitiNow.date;

  if (isToday) {
    timeInput.min = earliestSlot.time > closingCutoffTime ? closingCutoffTime : earliestSlot.time;

    if (!todayStillAvailable) {
      dateInput.value = addDaysToDateString(haitiNow.date, 1);
      timeInput.min = "00:00";
      timeInput.setCustomValidity("");
      dateInput.setCustomValidity("Les commandes du jour sont fermees apres 8h45 PM.");
      return;
    }

    if (!timeInput.value || timeInput.value < earliestSlot.time || timeInput.value > closingCutoffTime) {
      timeInput.value = earliestSlot.time;
    }

    timeInput.setCustomValidity(
      timeInput.value < earliestSlot.time || timeInput.value > closingCutoffTime
        ? "Choisis une heure valide entre maintenant et 8h45 PM."
        : ""
    );
  } else {
    timeInput.min = "00:00";
    if (timeInput.value > closingCutoffTime) {
      timeInput.value = closingCutoffTime;
    }
    timeInput.setCustomValidity("");
  }

  timeInput.max = closingCutoffTime;

  dateInput.setCustomValidity(
    dateInput.value < haitiNow.date
      ? "Choisis une date d'aujourd'hui ou future."
      : ""
  );
}

function extractOrderIdFromNotificationMessage(message) {
  const match = String(message || "").match(/(?:commande|livraison)\s*#(\d+)/i);
  return match ? Number(match[1]) : null;
}

function closeClientNotificationAndDetailModals() {
  closeClientNotificationsModal();
  closeNotificationDetail();
}

function navigateFromClientNotification(notification) {
  const orderId = extractOrderIdFromNotificationMessage(notification?.message);

  if (!orderId) {
    openNotificationDetail(notification);
    return;
  }

  const targetPath = "./client-orders.html";
  const params = new URLSearchParams(window.location.search);
  params.set("orderId", String(orderId));
  params.set("fromNotification", "1");
  const targetUrl = `${targetPath}?${params.toString()}`;

  closeClientNotificationAndDetailModals();

  if (window.location.pathname.endsWith("/client-orders.html")) {
    const order = clientOrdersCache.find(item => Number(item.id) === Number(orderId));
    if (order) {
      openClientOrderDetail(orderId);
      history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
      return;
    }
  }

  window.location.href = targetUrl;
}

async function renderClientDashboard() {
  if (!document.getElementById("client-name")) return;

  const user = await getClientSessionUser();
  if (!user) return;

  const welcome = document.getElementById("client-name");

  if (welcome) {
    welcome.textContent = user.name;
  }

  try {
    const [orders, notifications] = await Promise.all([apiRequest("/orders/my"), apiRequest("/notifications")]);
    clientNotificationsCache = notifications;
    renderClientStats(orders, notifications);
    renderClientDashboardHighlights(orders, notifications);
    syncClientNotificationsButton(notifications);
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

  const categories = Array.isArray(options.categories) && options.categories.length
    ? options.categories
        .map(categoryItem => String(categoryItem?.name || "").trim())
        .filter(Boolean)
    : [...new Set(products.map(product => String(product.category_name || "").trim()).filter(Boolean))];
  const previousCategory = category?.value || "";

  if (category) {
    const defaultLabel = category.dataset.defaultLabel || category.options[0]?.textContent || "Toutes les categories";
    category.dataset.defaultLabel = defaultLabel;
    category.innerHTML =
      `<option value="">${defaultLabel}</option>` +
      categories.map(name => `<option value="${name}">${name}</option>`).join("");
    category.value = categories.includes(previousCategory) ? previousCategory : "";
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

  if (chips) {
    chips.innerHTML = `
      <button class="category-chip ${category?.value ? "" : "active"}" type="button" data-category-chip="">Tous</button>
      ${categories
        .map(
          name => `<button class="category-chip ${category?.value === name ? "active" : ""}" type="button" data-category-chip="${name}">${name}</button>`
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
          const matchesCategory = !selectedCategory || String(product.category_name || "").trim() === selectedCategory;
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
                  onerror="handleProductImageError(this, '${String(product.name || "").replace(/'/g, "\\'")}', '')"
                />
                <div class="product-meta">
                  <div class="product-card-head">
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

  if (search) {
    search.oninput = draw;
  }
  if (category) {
    category.onchange = () => {
      syncActiveChip(category.value || "");
      draw();
    };
  }
  if (sort) {
    sort.onchange = draw;
  }
  updateCartSummary();
  draw();
}

function renderNotifications(container, notifications) {
  if (!container) return;

  container.innerHTML = notifications.length
    ? notifications
        .map(
          notification => `
            <button
              class="notification-item notification-item-button"
              type="button"
              data-notification-id="${notification.id}"
              data-notification-status="${notification.is_read ? "Lu" : "Nouveau"}"
              data-notification-message="${encodeURIComponent(notification.message || "")}"
              data-notification-date="${encodeURIComponent(formatTimestamp(notification.created_at))}">
              <strong>${notification.is_read ? "Lu" : "Nouveau"}</strong>
              <span>${notification.message}</span>
              <small>${formatTimestamp(notification.created_at)}</small>
            </button>
          `
        )
        .join("")
    : `<div class="empty-state"><p>Aucune notification pour l'instant.</p></div>`;

  container.querySelectorAll(".notification-item-button").forEach(button => {
    button.addEventListener("click", async () => {
      const notificationId = Number(button.dataset.notificationId);
      const notification = {
        id: notificationId,
        status: button.dataset.notificationStatus,
        message: decodeURIComponent(button.dataset.notificationMessage || ""),
        createdAtLabel: decodeURIComponent(button.dataset.notificationDate || "")
      };
      await markClientNotificationAsRead(notificationId, button);
      navigateFromClientNotification(notification);
    });
  });
}

function ensureClientNotificationsModal() {
  let modal = document.getElementById("client-notifications-modal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "client-notifications-modal";
  modal.className = "admin-modal hidden";
  modal.innerHTML = `
    <div class="admin-modal-backdrop" data-client-notification-close></div>
    <div class="admin-modal-card notification-modal-card">
      <div class="admin-modal-head">
        <div>
          <p class="admin-eyebrow">Notifications client</p>
          <h2>Messages recus</h2>
        </div>
        <button class="btn-light" type="button" data-client-notification-close>Fermer</button>
      </div>
      <div id="client-notifications-list" class="notification-detail-stack"></div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.querySelectorAll("[data-client-notification-close]").forEach(element => {
    element.addEventListener("click", closeClientNotificationsModal);
  });

  return modal;
}

function closeClientNotificationsModal() {
  const modal = document.getElementById("client-notifications-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function renderClientNotificationsModalList() {
  const container = document.getElementById("client-notifications-list");
  if (!container) return;
  renderNotifications(container, clientNotificationsCache);
}

function openClientNotificationsModal() {
  ensureClientNotificationsModal();
  renderClientNotificationsModalList();
  const modal = document.getElementById("client-notifications-modal");
  if (!modal) return;
  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function syncClientNotificationsButton(notifications = clientNotificationsCache) {
  const count = document.getElementById("client-notification-count");
  if (count) {
    count.textContent = String(notifications.filter(notification => !notification.is_read).length || 0);
  }
}

async function markClientNotificationAsRead(notificationId, button) {
  if (!notificationId || button?.dataset.notificationRead === "true") return;

  try {
    await apiRequest(`/notifications/${notificationId}/read`, {
      method: "PATCH"
    });

    if (button) {
      button.dataset.notificationRead = "true";
      button.dataset.notificationStatus = "Lu";
      const label = button.querySelector("strong");
      if (label) label.textContent = "Lu";
    }
    clientNotificationsCache = clientNotificationsCache.map(notification =>
      Number(notification.id) === Number(notificationId) ? { ...notification, is_read: true } : notification
    );
    syncClientNotificationsButton();
  } catch (error) {
    // Keep the detail flow usable even if the read flag update fails.
  }
}

function ensureNotificationModal() {
  let modal = document.getElementById("notification-detail-modal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "notification-detail-modal";
  modal.className = "admin-modal hidden";
  modal.innerHTML = `
    <div class="admin-modal-backdrop" data-notification-close></div>
    <div class="admin-modal-card notification-modal-card">
      <div class="admin-modal-head">
        <div>
          <p class="admin-eyebrow">Notification</p>
          <h2 id="notification-detail-title">Detail de la notification</h2>
        </div>
        <button class="btn-light" type="button" data-notification-close>Fermer</button>
      </div>
      <div class="notification-detail-stack">
        <div class="client-meta-item">
          <small>Etat</small>
          <strong id="notification-detail-status">Nouveau</strong>
        </div>
        <div class="client-meta-item">
          <small>Recu le</small>
          <strong id="notification-detail-date">-</strong>
        </div>
        <div class="client-meta-item notification-detail-message-box">
          <small>Message</small>
          <strong id="notification-detail-message">-</strong>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelectorAll("[data-notification-close]").forEach(element => {
    element.addEventListener("click", closeNotificationDetail);
  });

  return modal;
}

function openNotificationDetail(notification) {
  const modal = ensureNotificationModal();
  const statusEl = document.getElementById("notification-detail-status");
  const dateEl = document.getElementById("notification-detail-date");
  const messageEl = document.getElementById("notification-detail-message");

  if (statusEl) statusEl.textContent = notification.status || "Notification";
  if (dateEl) dateEl.textContent = notification.createdAtLabel || "-";
  if (messageEl) messageEl.textContent = notification.message || "Aucun detail disponible.";

  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeNotificationDetail() {
  const modal = document.getElementById("notification-detail-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

async function renderClientOrdersPage() {
  const container = document.getElementById("orders-list");
  if (!container || document.getElementById("client-name")) return;

  const detailModal = document.getElementById("client-order-detail-modal");
  if (detailModal && !detailModal.classList.contains("hidden")) {
    return;
  }

  const user = await getClientSessionUser();
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

  const user = await getClientSessionUser();
  if (!user) return;

    try {
      const catalog = await apiRequest("/products");
      renderCatalog(catalog.products, {
        categories: catalog.categories,
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

        if (order.delivery_status === "delivered") {
          return {
            badgeClass: "confirmed",
            badgeText: "Livree",
            helper: "Le livreur a marque la commande comme livree avec signature recue a la remise."
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
    <div class="client-payment-method-grid">
      <div class="client-payment-method-card">
        <strong>MonCash</strong>
        <span>Rapide pour les paiements mobile.</span>
      </div>
      <div class="client-payment-method-card">
        <strong>NatCash</strong>
        <span>Pratique si tu utilises deja NatCash.</span>
      </div>
    </div>
  `;

  return `
    ${mobileMethods}
    <div class="client-bank-list">
      ${bankAccounts
        .map(
          account => `
            <div class="client-bank-item client-payment-account-card">
              <div class="client-payment-account-head">
                <strong>${account.bank_name}</strong>
                <span class="badge">${account.account_type || "Paiement"}</span>
              </div>
              <div class="client-payment-account-meta">
                <span>${account.account_name}</span>
                <small class="client-payment-account-number">${account.account_number}</small>
              </div>
              <div class="client-payment-account-actions">
                <button class="client-copy-button" type="button" data-copy-value="${account.account_number}" data-copy-label="Numero de compte">
                  Copier le numero
                </button>
                <button class="client-copy-button" type="button" data-copy-value="${account.account_name}" data-copy-label="Nom du compte">
                  Copier le nom
                </button>
              </div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function bindPaymentCopyButtons(root = document) {
  root.querySelectorAll("[data-copy-value]").forEach(button => {
    if (button.dataset.boundCopy === "true") return;
    button.dataset.boundCopy = "true";
    button.addEventListener("click", async () => {
      const value = button.dataset.copyValue || "";
      const label = button.dataset.copyLabel || "Information";

      try {
        await navigator.clipboard.writeText(value);
        const originalText = button.textContent.trim();
        button.textContent = `${label} copie`;
        window.setTimeout(() => {
          button.textContent = originalText;
        }, 1600);
      } catch (error) {
        button.textContent = "Copie impossible";
      }
    });
  });
}

function paymentMethodHelperCopy(method) {
  const helpers = {
    moncash: {
      title: "MonCash selectionne",
      text: "Regle avec MonCash, puis colle la reference exacte avant d'envoyer ta capture."
    },
    natcash: {
      title: "NatCash selectionne",
      text: "Regle avec NatCash, puis colle la reference finale avant d'envoyer ta preuve."
    },
    bank_transfer: {
      title: "Virement bancaire selectionne",
      text: "Utilise un compte Point Chaud, puis ajoute la reference du depot ou du virement."
    }
  };

  return helpers[method] || helpers.moncash;
}

function renderPaymentMethodDetails(method, bankAccounts = []) {
  if (method === "bank_transfer") {
    if (!bankAccounts.length) {
      return `
        <div class="client-payment-detail-card">
          <strong>Comptes bancaires</strong>
          <p>Les coordonnees bancaires seront ajoutees prochainement.</p>
        </div>
      `;
    }

    return bankAccounts
      .map(
        account => `
          <div class="client-payment-detail-card">
            <div class="client-payment-detail-head">
              <strong>${account.bank_name}</strong>
              <span class="badge">${account.account_type || "Paiement"}</span>
            </div>
            <p>Titulaire: ${account.account_name}</p>
            <div class="client-payment-detail-number">${account.account_number}</div>
            <div class="client-payment-account-actions">
              <button class="client-copy-button" type="button" data-copy-value="${account.account_number}" data-copy-label="Numero de compte">
                Copier le numero
              </button>
            </div>
          </div>
        `
      )
      .join("");
  }

  const labels = {
    moncash: {
      title: "Paiement MonCash",
      text: "Une fois le paiement envoye, recopie la reference affichee dans le formulaire."
    },
    natcash: {
      title: "Paiement NatCash",
      text: "Une fois le transfert termine, recopie la reference finale dans le formulaire."
    }
  };

  const selected = labels[method] || labels.moncash;
  return `
    <div class="client-payment-detail-card">
      <strong>${selected.title}</strong>
      <p>${selected.text}</p>
    </div>
  `;
}

function bindPaymentMethodSelectors(root = document) {
  root.querySelectorAll(".client-payment-flow").forEach(flow => {
    if (flow.dataset.boundPaymentFlow === "true") return;
    flow.dataset.boundPaymentFlow = "true";

    const hiddenInput = flow.querySelector('input[name="payment_method"]');
    const helperBox = flow.querySelector("[data-payment-helper]");
    const detailsBox = flow.querySelector("[data-payment-details]");
    const proofForm = flow.querySelector(".client-proof-form, #payment-form");
    const buttons = flow.querySelectorAll("[data-payment-method-choice]");
    let bankAccounts = [];

    try {
      bankAccounts = JSON.parse(flow.dataset.bankAccounts || "[]");
    } catch (error) {
      bankAccounts = [];
    }

    const applyMethod = method => {
      if (hiddenInput) {
        hiddenInput.value = method;
      }

      buttons.forEach(button => {
        button.classList.toggle("active", button.dataset.paymentMethodChoice === method);
      });

      if (helperBox) {
        const helper = paymentMethodHelperCopy(method);
        helper.innerHTML = `<strong>${helper.title}</strong><small>${helper.text}</small>`;
      }

      if (detailsBox) {
        detailsBox.innerHTML = renderPaymentMethodDetails(method, bankAccounts);
        detailsBox.hidden = false;
        bindPaymentCopyButtons(detailsBox);
      }

      if (proofForm) {
        proofForm.hidden = false;
      }
    };

    buttons.forEach(button => {
      button.addEventListener("click", () => {
        applyMethod(button.dataset.paymentMethodChoice);
      });
    });

    const initialMethod = hiddenInput?.value || "";
    if (initialMethod && buttons.length === 1) {
      applyMethod(initialMethod);
    }
  });
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
                </div>

                <div class="client-payment-flow stack" data-bank-accounts='${JSON.stringify(latestClientBankAccounts || []).replace(/'/g, "&apos;")}'>
                    <div class="client-payment-selector">
                      <button class="client-payment-option" type="button" data-payment-method-choice="moncash">
                        <strong>MonCash</strong>
                        <span>Mobile money</span>
                      </button>
                      <button class="client-payment-option" type="button" data-payment-method-choice="natcash">
                        <strong>NatCash</strong>
                        <span>Transfert mobile</span>
                      </button>
                      <button class="client-payment-option" type="button" data-payment-method-choice="bank_transfer">
                        <strong>Virement bancaire</strong>
                        <span>Depot ou virement</span>
                      </button>
                      </div>

                      <div class="client-payment-stage" data-payment-helper>
                        <strong>1. Choisis une methode</strong>
                        <small>Le formulaire s'affichera juste apres.</small>
                      </div>

                      <div class="stack-sm" data-payment-details hidden></div>

                      <form class="client-proof-form stack client-payment-form-card" data-order-id="${order.id}" enctype="multipart/form-data" hidden>
                        <div class="client-payment-form-head">
                          <span class="client-payment-step-chip">Etape 2</span>
                          <strong>Envoyer la preuve</strong>
                        </div>
                        <input name="payment_method" type="hidden" value="" />
                        <label>
                          Reference de transaction
                          <input name="transaction_reference" placeholder="Entre la reference du paiement choisi" required />
                      </label>
                      <label>
                        Preuve de paiement
                        <input name="proof" type="file" accept=".png,.jpg,.jpeg,.pdf" required />
                      </label>
                      <div class="client-payment-proof-checklist">
                        <span>Montant exact.</span>
                        <span>Reference correcte.</span>
                        <span>Preuve lisible.</span>
                      </div>
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
  bindPaymentCopyButtons(modal);
  bindPaymentMethodSelectors(modal);
  bindClientPaymentForms();
}

function closeClientOrderDetail() {
  const modal = document.getElementById("client-order-detail-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");

  const params = new URLSearchParams(window.location.search);
  if (params.has("orderId") || params.has("fromNotification")) {
    params.delete("orderId");
    params.delete("fromNotification");
    history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`.replace(/\?$/, ""));
  }
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
        ["Pretes / confirmees", readyOrders, "QR, livraison en preparation ou confirmation client en attente"],
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
          <p>Affiche seulement les commandes qui demandent encore une action ou un suivi.</p>
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
      <details class="client-archive-shell">
        <summary class="client-archive-summary">
          <div>
            <strong>Archives client</strong>
            <small>${archivedOrders.length} completee(s) • ${rejectedOrders.length} refusee(s)</small>
          </div>
          <span class="client-archive-toggle" aria-hidden="true"></span>
        </summary>

        <div class="client-archive-content">
          <section class="client-archive-group">
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

          <section class="client-archive-group">
            <div class="section-head">
              <div>
                <h2>Commandes refusees</h2>
                <p>Ces commandes sont gardees ici pour historique et n'attendent aucun paiement.</p>
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
        </div>
      </details>
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

  const params = new URLSearchParams(window.location.search);
  const orderId = Number(params.get("orderId"));
  if (orderId) {
    const targetOrder = orders.find(order => Number(order.id) === orderId);
    if (targetOrder) {
      openClientOrderDetail(orderId);
      params.delete("fromNotification");
      history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`.replace(/\?$/, ""));
    }
  }
}

function bindClientPaymentForms() {
  document.querySelectorAll(".client-proof-form").forEach(form => {
    if (form.dataset.boundProofForm === "true") return;
    form.dataset.boundProofForm = "true";

    form.addEventListener("submit", async event => {
      event.preventDefault();

      const orderId = form.dataset.orderId;
      const selectedMethod = form.querySelector('input[name="payment_method"]')?.value;
      if (!selectedMethod) {
        showMessage(`proof-message-${orderId}`, "error", "Choisis d'abord une methode de paiement.");
        return;
      }

      const formData = new FormData(form);

      try {
        const data = await apiRequest(`/payments/${orderId}/proof`, {
          method: "POST",
          body: formData
        });

        showMessage(`proof-message-${orderId}`, "success", data.message);
        setTimeout(() => {
          closeClientOrderDetail();
          renderClientOrdersPage();
        }, 700);
      } catch (error) {
        showMessage(`proof-message-${orderId}`, "error", error.message);
      }
    });
  });
}

async function handleCheckoutOrderSubmit(event) {
  event?.preventDefault?.();

  const orderForm = document.getElementById("checkout-order-form");
  const locationSelect = document.getElementById("location_id");
  const orderTypeSelect = document.getElementById("order_type");
  const deliveryAddressInput = document.getElementById("delivery_address");
  const pickupDateInput = orderForm?.elements?.pickup_date;
  const pickupTimeInput = orderForm?.elements?.pickup_time;

  if (!orderForm) {
    return false;
  }

  syncCheckoutScheduleConstraints(pickupDateInput, pickupTimeInput);

  const user = await getClientSessionUser();
  if (!user) {
    return false;
  }

  if (!orderForm.reportValidity()) {
    return false;
  }

  const cart = getCart();
  const selectedLocationId = Number(locationSelect?.value || 0);

  if (!cart.length) {
    showMessage("checkout-message", "error", "Ajoute d'abord au moins un produit dans le panier.");
    return false;
  }

  if (!selectedLocationId) {
    showMessage("checkout-message", "error", "Choisis une succursale avant d'envoyer la commande.");
    return false;
  }

  if (orderTypeSelect?.value === "delivery" && !String(deliveryAddressInput?.value || "").trim()) {
    showMessage("checkout-message", "error", "L'adresse de livraison est obligatoire pour une commande en livraison.");
    return false;
  }

  try {
    const catalog = await apiRequest("/products");
    const productMap = new Map((catalog.products || []).map(product => [Number(product.id), product]));
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
      return false;
    }

    const formData = new FormData(orderForm);
    const payload = Object.fromEntries(formData.entries());
    payload.items = cart.map(item => ({
      product_id: item.product_id,
      quantity: Number(item.quantity)
    }));

    const data = await apiRequest("/orders", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    saveCart([]);
    showMessage("checkout-message", "success", data.message);
    setTimeout(() => {
      window.location.href = "/dashboard-client.html";
    }, 900);
  } catch (error) {
    showMessage("checkout-message", "error", error.message);
  }

  return false;
}

function submitCheckoutOrderForm(event) {
  event?.preventDefault?.();
  void handleCheckoutOrderSubmit(event);
  return false;
}

async function renderCheckoutPage() {
  const hasCheckoutContent =
    document.getElementById("checkout-order-form") || document.getElementById("payment-form");

  if (!hasCheckoutContent) return;

  const user = await getClientSessionUser();
  if (!user) return;

  const orderId = new URLSearchParams(window.location.search).get("orderId");
  const form = document.getElementById("payment-form");
  const locationSelect = document.getElementById("location_id");
  const orderForm = document.getElementById("checkout-order-form");
  const cartPreview = document.getElementById("checkout-cart-preview");
  const orderTypeSelect = document.getElementById("order_type");
  const deliveryFields = document.getElementById("delivery-fields");
  const deliveryAddressInput = document.getElementById("delivery_address");
  const pickupDateInput = orderForm?.elements?.pickup_date;
  const pickupTimeInput = orderForm?.elements?.pickup_time;
  const deliveryFeePreview = document.getElementById("delivery-fee-preview");
  const locationStockPreview = document.getElementById("checkout-location-stock-preview");
  const paymentTargetCopy = document.getElementById("payment-order-target-copy");
  const paymentOrderTotal = document.getElementById("payment-order-total");
  const paymentOrderSchedule = document.getElementById("payment-order-schedule");
  const paymentProofInput = document.getElementById("payment-proof-input");
  const paymentProofFileName = document.getElementById("payment-proof-file-name");
  let checkoutCatalog = null;

  const renderPaymentTarget = order => {
    if (!paymentTargetCopy || !paymentOrderTotal || !paymentOrderSchedule) return;

    if (!order) {
      paymentTargetCopy.textContent = "Aucune commande de paiement n'a encore ete choisie.";
      paymentOrderTotal.textContent = "Le total exact s'affichera ici des qu'une commande sera ciblee.";
      paymentOrderSchedule.textContent = "Retrait ou livraison, puis heure prevue.";
      return;
    }

    paymentTargetCopy.textContent =
      order.order_type === "delivery"
        ? `Commande livraison pour ${order.customer_name} - ${order.delivery_address || "adresse a confirmer"}.`
        : `Commande retrait a ${order.location_name} pour ${order.customer_name}.`;
    paymentOrderTotal.textContent = `${formatMoney(order.total)} a regler avant verification du staff.`;
    paymentOrderSchedule.textContent = `${order.order_type === "delivery" ? "Livraison" : "Retrait"} prevu(e) le ${formatDateTime(order.pickup_date, order.pickup_time)}.`;
  };

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
      const locations = Array.isArray(catalog.locations) ? catalog.locations : [];

      if (!locations.length) {
        if (!locationSelect.options.length) {
          locationSelect.innerHTML = `<option value="">Aucune succursale disponible</option>`;
          locationSelect.disabled = true;
        }
      } else {
        locationSelect.disabled = false;
        locationSelect.innerHTML =
          locations
            .map(location => `<option value="${location.id}">${location.name} - ${location.address}</option>`)
            .join("");

        if (!locationSelect.value && locations[0]) {
          locationSelect.value = String(locations[0].id);
        }
      }
    }

    const deliveryFee = 500;

    const syncDeliveryFields = () => {
      const isDelivery = orderTypeSelect?.value === "delivery";
      if (deliveryFields) {
        deliveryFields.style.display = isDelivery ? "grid" : "none";
      }
      if (deliveryAddressInput) {
        deliveryAddressInput.required = isDelivery;
      }
      if (deliveryFeePreview && locationSelect) {
        deliveryFeePreview.textContent = isDelivery
          ? `Frais de livraison fixes: ${formatMoney(deliveryFee)}.`
          : "Aucun frais de livraison pour un retrait sur place.";
      }
    };

    orderTypeSelect?.addEventListener("change", syncDeliveryFields);
    locationSelect?.addEventListener("change", () => {
      syncDeliveryFields();
      renderCheckoutLocationStock();
    });
    pickupDateInput?.addEventListener("change", () => syncCheckoutScheduleConstraints(pickupDateInput, pickupTimeInput));
    pickupTimeInput?.addEventListener("change", () => syncCheckoutScheduleConstraints(pickupDateInput, pickupTimeInput));
    syncDeliveryFields();
    syncCheckoutScheduleConstraints(pickupDateInput, pickupTimeInput);
    renderCheckoutLocationStock();

    const paymentFlow = document.getElementById("checkout-payment-flow");
    if (paymentFlow) {
      paymentFlow.dataset.bankAccounts = JSON.stringify(catalog.bankAccounts || []);
    }
  } catch (error) {
    if (locationSelect) {
      if (!locationSelect.options.length) {
        locationSelect.innerHTML = `<option value="">Impossible de charger les succursales</option>`;
        locationSelect.disabled = true;
      }
    }
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

  if (paymentProofInput && paymentProofFileName) {
    paymentProofInput.addEventListener("change", () => {
      const file = paymentProofInput.files?.[0];
      paymentProofFileName.textContent = file
        ? `${file.name} - ${Math.max(1, Math.round(file.size / 1024))} Ko`
        : "Aucun fichier choisi pour le moment.";
    });
  }

  bindPaymentMethodSelectors(document);

  if (orderForm) {
    orderForm.onsubmit = submitCheckoutOrderForm;
  }

  if (form && orderId) {
    document.getElementById("order-id").textContent = orderId;

    try {
      const orders = await apiRequest("/orders/my");
      const targetOrder = orders.find(order => String(order.id) === String(orderId));
      renderPaymentTarget(targetOrder);
    } catch (error) {
      renderPaymentTarget(null);
    }

    if (form.dataset.boundCheckoutPaymentForm === "true") {
      return;
    }
    form.dataset.boundCheckoutPaymentForm = "true";

    form.addEventListener("submit", async event => {
      event.preventDefault();

      const selectedMethod = form.querySelector('input[name="payment_method"]')?.value;
      if (!selectedMethod) {
        showMessage("payment-message", "error", "Choisis d'abord une methode de paiement.");
        return;
      }

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
  } else {
    renderPaymentTarget(null);
  }
}

async function renderPublicCatalogPage() {
  if (!document.getElementById("products-grid") || document.getElementById("client-name")) return;

  try {
    const catalog = await apiRequest("/products");
    renderCatalog(catalog.products, {
      categories: catalog.categories
    });
  } catch (error) {
    showMessage("dashboard-message", "error", error.message);
  }
}

async function renderClientProfilePage() {
  if (!document.body.classList.contains("client-body") || document.body.dataset.clientPage !== "profile") return;

  const user = await getClientSessionUser();
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
  const clientNotificationsButton = document.getElementById("client-notifications-button");
  clientNotificationsButton?.addEventListener("click", openClientNotificationsModal);

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

  if (document.getElementById("products-grid")) {
    startLiveRefresh("public-products", renderPublicCatalogPage, 20000);
  }

  if (document.getElementById("client-products-grid")) {
    startLiveRefresh("client-products", renderClientProductsPage, 20000);
  }
});

window.handleCheckoutOrderSubmit = handleCheckoutOrderSubmit;
window.submitCheckoutOrderForm = submitCheckoutOrderForm;
