const WEEKDAY_LABELS = {
  monday: "Lundi",
  tuesday: "Mardi",
  wednesday: "Mercredi",
  thursday: "Jeudi",
  friday: "Vendredi",
  saturday: "Samedi",
  sunday: "Dimanche"
};

let marketingAdminState = {
  currentEvent: null,
  upcomingEvents: [],
  dailySpecials: [],
  products: []
};
let marketingCanEdit = false;

function updateMarketingImagePreview(previewId, imagePath) {
  const preview = document.getElementById(previewId);
  if (!preview) return;

  if (!imagePath) {
    preview.hidden = true;
    preview.innerHTML = "";
    return;
  }

  preview.hidden = false;
  preview.innerHTML = `
    <img src="${resolveMarketingImagePath(imagePath, imagePath)}" alt="Apercu image" loading="lazy" />
    <small>${imagePath}</small>
  `;
}

function getMarketingProductById(productId) {
  return marketingAdminState.products.find(product => Number(product.id) === Number(productId)) || null;
}

function getMarketingProductOptions(selectedProductId = "") {
  const options = ['<option value="">Aucun produit lie</option>'];
  marketingAdminState.products.forEach(product => {
    options.push(
      `<option value="${product.id}" ${Number(selectedProductId) === Number(product.id) ? "selected" : ""}>${product.name} - ${formatMoney(product.price)}</option>`
    );
  });
  return options.join("");
}

function getPromotionCardImage(eventLike, fallbackImage) {
  if (eventLike?.image) return resolveMarketingImagePath(eventLike.image, fallbackImage);
  if (eventLike?.product) return resolveProductImage(eventLike.product);
  const linkedProduct = getMarketingProductById(eventLike?.product_id);
  if (linkedProduct) return resolveProductImage(linkedProduct);
  return fallbackImage;
}

function formatPromotionPeriod(eventLike) {
  const label = String(eventLike?.period_label || "").trim();
  if (label) return label;
  const start = eventLike?.start_date ? String(eventLike.start_date).slice(0, 10) : "";
  const end = eventLike?.end_date ? String(eventLike.end_date).slice(0, 10) : "";
  if (start && end) return `${start} - ${end}`;
  return "Periode non precisee";
}

function openPromotionModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.remove("hidden");
  document.body.classList.add("admin-menu-open");
}

function closePromotionModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.add("hidden");
  if (!document.querySelector(".admin-modal:not(.hidden)")) {
    document.body.classList.remove("admin-menu-open");
  }
}

function renderMarketingSummary() {
  const container = document.getElementById("marketing-summary-grid");
  if (!container) return;

  const activeUpcoming = marketingAdminState.upcomingEvents.filter(event => event.is_active).length;
  const linkedDailySpecials = marketingAdminState.dailySpecials.filter(item => item.product_id).length;

  container.innerHTML = [
    ["Evenement principal", marketingAdminState.currentEvent?.title || "Aucun", "Bloc principal affiche cote client"],
    ["Evenements a venir", marketingAdminState.upcomingEvents.length, `${activeUpcoming} visible(s)`],
    ["Plats programmes", linkedDailySpecials, "Jours lies a un produit"],
    ["Produits disponibles", marketingAdminState.products.length, "Catalogue pret pour les campagnes"]
  ]
    .map(
      ([label, value, text]) => `
        <article class="admin-product-chip">
          <strong>${label}</strong>
          <span>${value}</span>
          <small>${text}</small>
        </article>
      `
    )
    .join("");
}

function fillCurrentPromotionForm() {
  const form = document.getElementById("current-promotion-form");
  if (!form) return;

  const event = marketingAdminState.currentEvent || {};
  form.elements.id.value = event.id || "";
  form.elements.title.value = event.title || "";
  form.elements.price_label.value = event.price_label || "15$";
  form.elements.product_id.innerHTML = getMarketingProductOptions(event.product_id || "");
  form.elements.product_id.value = event.product_id || "";
  form.elements.period_label.value = event.period_label || "";
  form.elements.image.value = event.image || "";
  form.elements.start_date.value = event.start_date ? String(event.start_date).slice(0, 10) : "";
  form.elements.end_date.value = event.end_date ? String(event.end_date).slice(0, 10) : "";
  form.elements.description.value = event.description || "";
  form.elements.is_active.checked = event.is_active !== false;
  updateMarketingImagePreview("current-promotion-image-preview", event.image || "");
}

function resetUpcomingPromotionForm() {
  const form = document.getElementById("upcoming-promotion-form");
  const submit = document.getElementById("upcoming-promotion-submit");
  const cancel = document.getElementById("upcoming-promotion-cancel");
  if (!form) return;

  form.reset();
  form.elements.id.value = "";
  form.elements.price_label.value = "15$";
  form.elements.sort_order.value = "0";
  form.elements.product_id.innerHTML = getMarketingProductOptions();
  form.elements.product_id.value = "";
  form.elements.product_id.dataset.selectedProductId = "";
  form.elements.is_active.checked = true;
  updateMarketingImagePreview("upcoming-promotion-image-preview", "");
  if (submit) submit.textContent = "Ajouter l'evenement";
  if (cancel) cancel.style.display = "none";
}

function fillUpcomingPromotionForm(eventItem) {
  const form = document.getElementById("upcoming-promotion-form");
  const submit = document.getElementById("upcoming-promotion-submit");
  const cancel = document.getElementById("upcoming-promotion-cancel");
  if (!form || !eventItem) return;

  form.elements.id.value = eventItem.id || "";
  form.elements.title.value = eventItem.title || "";
  form.elements.price_label.value = eventItem.price_label || "15$";
  form.elements.product_id.innerHTML = getMarketingProductOptions(eventItem.product_id || "");
  form.elements.product_id.value = eventItem.product_id || "";
  form.elements.product_id.dataset.selectedProductId = String(eventItem.product_id || "");
  form.elements.period_label.value = eventItem.period_label || "";
  form.elements.sort_order.value = Number(eventItem.sort_order || 0);
  form.elements.image.value = eventItem.image || "";
  form.elements.start_date.value = eventItem.start_date ? String(eventItem.start_date).slice(0, 10) : "";
  form.elements.end_date.value = eventItem.end_date ? String(eventItem.end_date).slice(0, 10) : "";
  form.elements.description.value = eventItem.description || "";
  form.elements.is_active.checked = eventItem.is_active !== false;
  updateMarketingImagePreview("upcoming-promotion-image-preview", eventItem.image || "");
  if (submit) submit.textContent = "Mettre a jour";
  if (cancel) cancel.style.display = "";
}

function renderCurrentPromotionShowcase() {
  const container = document.getElementById("current-promotion-showcase");
  if (!container) return;

  const event = marketingAdminState.currentEvent || {};
  const product = event.product || getMarketingProductById(event.product_id);
  const image = getPromotionCardImage(event, "../assets/images/home/burger-week-promo.png");
  const title = event.title || product?.name || "Aucun evenement";
  const price = event.price_label || (product ? formatMoney(product.price) : "15$");
  const description = event.description || "Ajoute un produit, un prix et une description courte pour l'evenement principal.";
  const period = formatPromotionPeriod(event);
  const active = event.is_active !== false;

  container.innerHTML = `
    <div class="promotion-showcase-visual" style="background-image:url('${image}')">
      <span class="promotion-chip promotion-chip-live">${active ? "EN COURS" : "INACTIF"}</span>
    </div>
    <div class="promotion-showcase-main">
      <span class="promotion-inline-tag">Plat</span>
      <h3>${title}</h3>
      <strong class="promotion-price">${price}</strong>
      <p>${description}</p>
    </div>
    <div class="promotion-showcase-side">
      <div class="promotion-period-block">
        <small>Periode</small>
        <strong>${period}</strong>
      </div>
      <label class="promotion-toggle-row">
        <span>Actif</span>
        <input id="current-promotion-active-toggle" type="checkbox" ${active ? "checked" : ""} ${marketingCanEdit ? "" : "disabled"} />
      </label>
      ${
        marketingCanEdit
          ? `<button class="btn-primary promotion-edit-btn" type="button" onclick="openCurrentPromotionEditor()">Modifier l'evenement</button>`
          : `<div class="admin-report-stable-card"><strong>Lecture seule</strong><p>Consultation ouverte au manager sans modification.</p></div>`
      }
    </div>
  `;

  const toggle = document.getElementById("current-promotion-active-toggle");
  if (toggle && marketingCanEdit) {
    toggle.addEventListener("change", async eventTarget => {
      try {
        const payload = {
          id: event.id || null,
          title,
          price_label: event.price_label || price,
          product_id: event.product_id || product?.id || null,
          period_label: event.period_label || "",
          image: event.image || "",
          start_date: event.start_date || null,
          end_date: event.end_date || null,
          description,
          is_active: Boolean(eventTarget.currentTarget.checked)
        };
        const data = await apiRequest("/products/marketing/current", {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        showMessage("marketing-message", "success", data.message);
        applyMarketingAdminData({ ...data, products: marketingAdminState.products });
      } catch (error) {
        showMessage("marketing-message", "error", error.message);
        eventTarget.currentTarget.checked = active;
      }
    });
  }
}

function renderUpcomingPromotions() {
  const container = document.getElementById("upcoming-promotions-list");
  if (!container) return;

  container.innerHTML = marketingAdminState.upcomingEvents.length
    ? marketingAdminState.upcomingEvents
        .map(event => {
          const image = getPromotionCardImage(event, "../assets/images/home/wing-things-promo.png");
          const title = event.title || event.product?.name || "Evenement";
          const price = event.price_label || (event.product ? formatMoney(event.product.price) : "15$");
          const period = formatPromotionPeriod(event);
          return `
            <article class="promotion-upcoming-row">
              <div class="promotion-upcoming-thumb" style="background-image:url('${image}')"></div>
              <div class="promotion-upcoming-main">
                <span class="promotion-inline-tag">Plat</span>
                <strong>${title}</strong>
              </div>
              <div class="promotion-upcoming-price">${price}</div>
              <div class="promotion-upcoming-period">
                <small>Periode</small>
                <strong>${period}</strong>
              </div>
              <div class="promotion-upcoming-actions">
                <button class="btn-light promotion-icon-btn" type="button" onclick="editUpcomingPromotion(${event.id})">✎</button>
                <button class="admin-btn-danger promotion-icon-btn" type="button" onclick="deleteUpcomingPromotion(${event.id})">🗑</button>
              </div>
            </article>
          `;
        })
        .join("")
    : `<div class="empty-state"><p>Aucun evenement a venir pour le moment.</p></div>`;
}

function buildDailySpecialsFormMarkup() {
  return Object.entries(WEEKDAY_LABELS)
    .map(([weekday, label]) => {
      const item = marketingAdminState.dailySpecials.find(entry => entry.weekday === weekday) || {};
      return `
        <article class="panel marketing-day-card ${item.is_active !== false ? "is-active" : ""}">
          <div class="stack-sm">
            <strong>${label}</strong>
            <small class="muted">${item.product ? `Actuel : ${item.product.name}` : "Aucun produit choisi"}</small>
          </div>
          <input type="hidden" name="weekday" value="${weekday}" />
          <label>
            Produit du jour
            <select data-daily-special-product data-weekday="${weekday}">
              ${getMarketingProductOptions(item.product_id)}
            </select>
          </label>
          <label class="admin-form-inline">
            <input type="checkbox" data-daily-special-active data-weekday="${weekday}" ${item.is_active !== false ? "checked" : ""} />
            Actif ce jour
          </label>
        </article>
      `;
    })
    .join("");
}

function renderDailySpecials() {
  const container = document.getElementById("daily-specials-grid");
  if (!container) return;
  container.innerHTML = buildDailySpecialsFormMarkup();
}

function renderDailySpecialsBoard() {
  const container = document.getElementById("daily-specials-board");
  if (!container) return;
  container.innerHTML = Object.entries(WEEKDAY_LABELS)
    .map(([weekday, label]) => {
      const item = marketingAdminState.dailySpecials.find(entry => entry.weekday === weekday) || {};
      const product = item.product || getMarketingProductById(item.product_id);
      return `
        <article class="promotion-day-cell">
          <strong>${label}</strong>
          <p>${product?.name || "Aucun plat"}</p>
          <span class="status ${item.is_active !== false ? "paid" : "cancelled"}">${item.is_active !== false ? "Actif" : "Inactif"}</span>
        </article>
      `;
    })
    .join("");
}

function renderMarketingPreview() {
  const container = document.getElementById("marketing-preview-grid");
  if (!container) return;

  const event = marketingAdminState.currentEvent || {};
  const product = event.product || getMarketingProductById(event.product_id);
  const image = getPromotionCardImage(event, "../assets/images/home/burger-week-promo.png");
  const title = event.title || product?.name || "Promotion Point Chaud";
  const price = event.price_label || (product ? formatMoney(product.price) : "15$");
  const period = formatPromotionPeriod(event);
  const activeLabel = event.is_active !== false ? "En cours" : "Inactif";

  container.innerHTML = `
    <article class="promotion-preview-card" style="background-image:
      linear-gradient(90deg, rgba(247, 190, 19, 0.94) 0%, rgba(247, 190, 19, 0.82) 38%, rgba(247, 190, 19, 0.14) 68%, rgba(247, 190, 19, 0.04) 100%),
      url('${image}')">
      <div class="promotion-preview-copy">
        <small>Evenement du moment</small>
        <h3>${title}</h3>
        <strong class="promotion-price">${price}</strong>
        <div class="promotion-preview-meta">
          <span>${period}</span>
          <span>${activeLabel}</span>
        </div>
      </div>
    </article>
  `;
}

function applyMarketingReadonlyState() {
  if (marketingCanEdit) return;

  const createUpcomingButton = document.getElementById("open-upcoming-promotion-create");
  const openDailyButton = document.getElementById("open-daily-specials-modal");
  if (createUpcomingButton) createUpcomingButton.hidden = true;
  if (openDailyButton) openDailyButton.hidden = true;

  const currentEditButton = document.querySelector(".promotion-edit-btn");
  if (currentEditButton) currentEditButton.hidden = true;

  const currentToggle = document.getElementById("current-promotion-active-toggle");
  if (currentToggle) currentToggle.disabled = true;

  document.querySelectorAll(".promotion-upcoming-actions").forEach(container => {
    container.innerHTML = `<span class="badge">Lecture seule</span>`;
  });

  document.querySelectorAll(
    "#current-promotion-modal input, #current-promotion-modal textarea, #current-promotion-modal select, #current-promotion-modal button[type='submit'], " +
      "#upcoming-promotion-modal input, #upcoming-promotion-modal textarea, #upcoming-promotion-modal select, #upcoming-promotion-modal button[type='submit'], " +
      "#daily-specials-modal input, #daily-specials-modal textarea, #daily-specials-modal select, #daily-specials-modal button[type='submit']"
  ).forEach(field => {
    field.disabled = true;
  });
}

function applyMarketingAdminData(data) {
  marketingAdminState = {
    currentEvent: data.currentEvent || null,
    upcomingEvents: Array.isArray(data.upcomingEvents) ? data.upcomingEvents : [],
    dailySpecials: Array.isArray(data.dailySpecials) ? data.dailySpecials : [],
    products: Array.isArray(data.products) ? data.products : []
  };

  renderMarketingSummary();
  fillCurrentPromotionForm();
  renderCurrentPromotionShowcase();
  renderUpcomingPromotions();
  renderDailySpecials();
  renderDailySpecialsBoard();
  renderMarketingPreview();
}

function autofillPromotionFromProduct(form, productId) {
  if (!form || !productId) return;
  const product = getMarketingProductById(productId);
  if (!product) return;

  if (!form.elements.title.value.trim()) {
    form.elements.title.value = product.name || "";
  }
  if (!form.elements.price_label.value.trim()) {
    form.elements.price_label.value = formatMoney(product.price);
  }
  if (!form.elements.image.value.trim() && product.image) {
    form.elements.image.value = product.image;
  }
}

function bindPromotionProductAutofill() {
  document
    .querySelectorAll('#current-promotion-form select[name="product_id"], #upcoming-promotion-form select[name="product_id"]')
    .forEach(select => {
      if (select.dataset.bound === "true") return;
      select.dataset.bound = "true";
      select.addEventListener("change", event => {
        autofillPromotionFromProduct(event.currentTarget.form, event.currentTarget.value);
      });
    });
}

async function loadMarketingAdminPage() {
  const user = await loadBackofficeUser();
  if (!user) return;
  marketingCanEdit = user.role === "admin";

  try {
    const data = await apiRequest("/products/marketing/admin");
    applyMarketingAdminData(data);
    bindPromotionProductAutofill();
    applyMarketingReadonlyState();
  } catch (error) {
    showMessage("marketing-message", "error", error.message);
  }
}

async function handleCurrentPromotionSubmit(event) {
  event.preventDefault();
  if (!marketingCanEdit) return;
  const form = event.currentTarget;

  try {
    const payload = {
      id: form.elements.id.value || null,
      title: form.elements.title.value.trim(),
      price_label: form.elements.price_label.value.trim(),
      product_id: form.elements.product_id.value || null,
      period_label: form.elements.period_label.value.trim(),
      image: form.elements.image.value.trim(),
      start_date: form.elements.start_date.value || null,
      end_date: form.elements.end_date.value || null,
      description: form.elements.description.value.trim(),
      is_active: form.elements.is_active.checked
    };

    const data = await apiRequest("/products/marketing/current", {
      method: "PUT",
      body: JSON.stringify(payload)
    });

    showMessage("marketing-message", "success", data.message);
    applyMarketingAdminData({ ...data, products: marketingAdminState.products });
    bindPromotionProductAutofill();
    closePromotionModal("current-promotion-modal");
  } catch (error) {
    showMessage("marketing-message", "error", error.message);
  }
}

window.openCurrentPromotionEditor = function openCurrentPromotionEditor() {
  if (!marketingCanEdit) return;
  fillCurrentPromotionForm();
  openPromotionModal("current-promotion-modal");
};

window.editUpcomingPromotion = function editUpcomingPromotion(id) {
  if (!marketingCanEdit) return;
  const eventItem = marketingAdminState.upcomingEvents.find(item => Number(item.id) === Number(id));
  if (!eventItem) return;
  fillUpcomingPromotionForm(eventItem);
  bindPromotionProductAutofill();
  openPromotionModal("upcoming-promotion-modal");
};

window.deleteUpcomingPromotion = async function deleteUpcomingPromotion(id) {
  if (!marketingCanEdit) return;
  try {
    const data = await apiRequest(`/products/marketing/upcoming/${id}`, { method: "DELETE" });
    showMessage("marketing-message", "success", data.message);
    applyMarketingAdminData({ ...data, products: marketingAdminState.products });
    resetUpcomingPromotionForm();
    bindPromotionProductAutofill();
  } catch (error) {
    showMessage("marketing-message", "error", error.message);
  }
};

async function handleUpcomingPromotionSubmit(event) {
  event.preventDefault();
  if (!marketingCanEdit) return;
  const form = event.currentTarget;
  const editingId = form.elements.id.value;

  try {
    const payload = {
      title: form.elements.title.value.trim(),
      price_label: form.elements.price_label.value.trim(),
      product_id: form.elements.product_id.value || null,
      period_label: form.elements.period_label.value.trim(),
      sort_order: Number(form.elements.sort_order.value || 0),
      image: form.elements.image.value.trim(),
      start_date: form.elements.start_date.value || null,
      end_date: form.elements.end_date.value || null,
      description: form.elements.description.value.trim(),
      is_active: form.elements.is_active.checked
    };

    const data = await apiRequest(editingId ? `/products/marketing/upcoming/${editingId}` : "/products/marketing/upcoming", {
      method: editingId ? "PATCH" : "POST",
      body: JSON.stringify(payload)
    });

    showMessage("marketing-message", "success", data.message);
    applyMarketingAdminData({ ...data, products: marketingAdminState.products });
    resetUpcomingPromotionForm();
    bindPromotionProductAutofill();
    closePromotionModal("upcoming-promotion-modal");
  } catch (error) {
    showMessage("marketing-message", "error", error.message);
  }
}

async function handleDailySpecialsSubmit(event) {
  event.preventDefault();
  if (!marketingCanEdit) return;

  try {
    const entries = Object.keys(WEEKDAY_LABELS).map(weekday => ({
      weekday,
      product_id: document.querySelector(`[data-daily-special-product][data-weekday="${weekday}"]`)?.value || "",
      is_active: Boolean(document.querySelector(`[data-daily-special-active][data-weekday="${weekday}"]`)?.checked)
    }));

    const data = await apiRequest("/products/marketing/daily-specials", {
      method: "PUT",
      body: JSON.stringify({ entries })
    });

    showMessage("marketing-message", "success", data.message);
    applyMarketingAdminData({ ...data, products: marketingAdminState.products });
    bindPromotionProductAutofill();
    closePromotionModal("daily-specials-modal");
  } catch (error) {
    showMessage("marketing-message", "error", error.message);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const currentForm = document.getElementById("current-promotion-form");
  const upcomingForm = document.getElementById("upcoming-promotion-form");
  const dailyForm = document.getElementById("daily-specials-form");
  const cancelButton = document.getElementById("upcoming-promotion-cancel");
  const currentImageFileInput = document.getElementById("current-promotion-image-file");
  const upcomingImageFileInput = document.getElementById("upcoming-promotion-image-file");
  const createUpcomingButton = document.getElementById("open-upcoming-promotion-create");
  const openDailyButton = document.getElementById("open-daily-specials-modal");

  currentForm?.addEventListener("submit", handleCurrentPromotionSubmit);
  upcomingForm?.addEventListener("submit", handleUpcomingPromotionSubmit);
  dailyForm?.addEventListener("submit", handleDailySpecialsSubmit);
  cancelButton?.addEventListener("click", () => {
    resetUpcomingPromotionForm();
    closePromotionModal("upcoming-promotion-modal");
  });
  createUpcomingButton?.addEventListener("click", () => {
    if (!marketingCanEdit) return;
    resetUpcomingPromotionForm();
    openPromotionModal("upcoming-promotion-modal");
  });
  openDailyButton?.addEventListener("click", () => {
    if (!marketingCanEdit) return;
    openPromotionModal("daily-specials-modal");
  });
  document.querySelectorAll("[data-close-modal]").forEach(button => {
    button.addEventListener("click", () => closePromotionModal(button.getAttribute("data-close-modal")));
  });

  currentImageFileInput?.addEventListener("change", async event => {
    if (!marketingCanEdit) return;
    const file = event.currentTarget.files?.[0];
    if (!file || !currentForm) return;
    try {
      const data = await uploadAdminImageFile(file, "promotions");
      currentForm.elements.image.value = data.imagePath || "";
      updateMarketingImagePreview("current-promotion-image-preview", data.imagePath || "");
      showMessage("marketing-message", "success", data.message);
    } catch (error) {
      showMessage("marketing-message", "error", error.message);
    } finally {
      event.currentTarget.value = "";
    }
  });

  upcomingImageFileInput?.addEventListener("change", async event => {
    if (!marketingCanEdit) return;
    const file = event.currentTarget.files?.[0];
    if (!file || !upcomingForm) return;
    try {
      const data = await uploadAdminImageFile(file, "promotions");
      upcomingForm.elements.image.value = data.imagePath || "";
      updateMarketingImagePreview("upcoming-promotion-image-preview", data.imagePath || "");
      showMessage("marketing-message", "success", data.message);
    } catch (error) {
      showMessage("marketing-message", "error", error.message);
    } finally {
      event.currentTarget.value = "";
    }
  });

  loadMarketingAdminPage();
});
