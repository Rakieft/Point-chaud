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
    <img src="${imagePath}" alt="Aperçu image" loading="lazy" />
    <small>${imagePath}</small>
  `;
}

function getMarketingProductById(productId) {
  return marketingAdminState.products.find(product => Number(product.id) === Number(productId)) || null;
}

function getMarketingProductOptions(selectedProductId = "") {
  const options = ['<option value="">Aucun produit lié</option>'];

  marketingAdminState.products.forEach(product => {
    options.push(
      `<option value="${product.id}" ${Number(selectedProductId) === Number(product.id) ? "selected" : ""}>${product.name} - ${formatMoney(product.price)}</option>`
    );
  });

  return options.join("");
}

function updatePromotionProductSelects() {
  const currentSelect = document.querySelector('#current-promotion-form select[name="product_id"]');
  const upcomingSelect = document.querySelector('#upcoming-promotion-form select[name="product_id"]');

  if (currentSelect) {
    currentSelect.innerHTML = getMarketingProductOptions(marketingAdminState.currentEvent?.product_id || "");
  }

  if (upcomingSelect) {
    const selectedValue = upcomingSelect.dataset.selectedProductId || upcomingSelect.value || "";
    upcomingSelect.innerHTML = getMarketingProductOptions(selectedValue);
    upcomingSelect.value = selectedValue;
  }
}

function renderMarketingSummary() {
  const container = document.getElementById("marketing-summary-grid");
  if (!container) return;

  const activeUpcoming = marketingAdminState.upcomingEvents.filter(event => event.is_active).length;
  const linkedDailySpecials = marketingAdminState.dailySpecials.filter(item => item.product_id).length;

  container.innerHTML = [
    ["Événement principal", marketingAdminState.currentEvent?.title || "Aucun", "Bloc principal affiché côté client"],
    ["Événements à venir", marketingAdminState.upcomingEvents.length, `${activeUpcoming} visible(s) actuellement`],
    ["Plats programmés", linkedDailySpecials, "Jours déjà liés à un vrai produit"],
    ["Produits disponibles", marketingAdminState.products.length, "Catalogue prêt pour les campagnes"]
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

  const currentEvent = marketingAdminState.currentEvent || {};
  form.elements.id.value = currentEvent.id || "";
  form.elements.title.value = currentEvent.title || "";
  form.elements.price_label.value = currentEvent.price_label || "15$";
  form.elements.product_id.innerHTML = getMarketingProductOptions(currentEvent.product_id || "");
  form.elements.product_id.value = currentEvent.product_id || "";
  form.elements.period_label.value = currentEvent.period_label || "";
  form.elements.image.value = currentEvent.image || "";
  updateMarketingImagePreview("current-promotion-image-preview", currentEvent.image || "");
  form.elements.start_date.value = currentEvent.start_date ? String(currentEvent.start_date).slice(0, 10) : "";
  form.elements.end_date.value = currentEvent.end_date ? String(currentEvent.end_date).slice(0, 10) : "";
  form.elements.description.value = currentEvent.description || "";
  form.elements.is_active.checked = currentEvent.is_active !== false;
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
  if (submit) submit.textContent = "Ajouter l'événement";
  if (cancel) cancel.style.display = "none";
}

function renderUpcomingPromotions() {
  const container = document.getElementById("upcoming-promotions-list");
  if (!container) return;

  container.innerHTML = marketingAdminState.upcomingEvents.length
    ? marketingAdminState.upcomingEvents
        .map(
          event => `
            <article class="admin-category-chip marketing-event-chip">
              <div class="stack-sm">
                <strong>${event.title || event.product?.name || "Événement"}</strong>
                <small class="muted">${event.period_label || "Période non précisée"} · ${event.price_label || (event.product ? formatMoney(event.product.price) : "Prix libre")}</small>
                <small>${event.product ? `Produit lié : ${event.product.name}` : "Aucun produit lié"}</small>
                <small>${event.description || "Sans texte court."}</small>
              </div>
              <div class="admin-action-group">
                <span class="status ${event.is_active ? "paid" : "cancelled"}">${event.is_active ? "Actif" : "Inactif"}</span>
                <button class="btn-light" type="button" onclick="editUpcomingPromotion(${event.id})">Modifier</button>
                <button class="admin-btn-danger" type="button" onclick="deleteUpcomingPromotion(${event.id})">Supprimer</button>
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state"><p>Aucun événement à venir pour le moment.</p></div>`;
}

function renderDailySpecials() {
  const container = document.getElementById("daily-specials-grid");
  if (!container) return;

  container.innerHTML = Object.entries(WEEKDAY_LABELS)
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

function buildPreviewCard({
  badge,
  title,
  period,
  price,
  description,
  image,
  variant = "current"
}) {
  return `
    <article class="marketing-preview-card marketing-preview-card-${variant}" style="background-image:
      linear-gradient(135deg, rgba(38, 16, 8, 0.92) 0%, rgba(108, 38, 11, 0.72) 48%, rgba(255, 142, 58, 0.18) 100%),
      url('${image}')">
      <div class="marketing-preview-copy">
        <span class="badge">${badge}</span>
        <small>${period}</small>
        <h3>${title}</h3>
        <strong class="branch-event-price">${price}</strong>
        <p>${description}</p>
      </div>
    </article>
  `;
}

function renderMarketingPreview() {
  const container = document.getElementById("marketing-preview-grid");
  if (!container) return;

  const currentEvent = marketingAdminState.currentEvent || {};
  const upcomingEvent = marketingAdminState.upcomingEvents.find(event => event.is_active) || marketingAdminState.upcomingEvents[0] || {};
  const weekdayKey = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Port-au-Prince",
    weekday: "long"
  })
    .format(new Date())
    .toLowerCase();
  const todaySpecial = marketingAdminState.dailySpecials.find(item => item.weekday === weekdayKey) || marketingAdminState.dailySpecials[0] || {};
  const currentProduct = currentEvent.product || getMarketingProductById(currentEvent.product_id);
  const upcomingProduct = upcomingEvent.product || getMarketingProductById(upcomingEvent.product_id);
  const specialProduct = todaySpecial.product || getMarketingProductById(todaySpecial.product_id);

  const cards = [];

  cards.push(
    buildPreviewCard({
      badge: "Événement du moment",
      title: currentEvent.title || currentProduct?.name || "Aucun événement principal",
      period: currentEvent.period_label || "À afficher côté client",
      price: currentEvent.price_label || (currentProduct ? formatMoney(currentProduct.price) : "15$"),
      description: currentEvent.description || "Ajoute un produit, un prix et un texte court pour alimenter l'accueil et les succursales.",
      image: currentEvent.image || (currentProduct ? resolveProductImage(currentProduct) : "../assets/images/home/burger-week-promo.png"),
      variant: "current"
    })
  );

  cards.push(
    buildPreviewCard({
      badge: "À venir",
      title: upcomingEvent.title || upcomingProduct?.name || "Prépare la prochaine campagne",
      period: upcomingEvent.period_label || "Bientôt",
      price: upcomingEvent.price_label || (upcomingProduct ? formatMoney(upcomingProduct.price) : "15$"),
      description: upcomingEvent.description || "Un aperçu de la prochaine offre visible dans les cartes d'événements.",
      image: upcomingEvent.image || (upcomingProduct ? resolveProductImage(upcomingProduct) : "../assets/images/home/wing-things-promo.png"),
      variant: "upcoming"
    })
  );

  cards.push(`
    <article class="marketing-preview-card marketing-preview-card-dish">
      <div class="marketing-preview-copy">
        <span class="badge">Plat du jour</span>
        <small>${WEEKDAY_LABELS[todaySpecial.weekday] || "Aujourd'hui"}</small>
        <h3>${specialProduct?.name || "Aucun plat programmé"}</h3>
        <strong class="branch-event-price">${specialProduct ? formatMoney(specialProduct.price) : "Prix du jour"}</strong>
        <p>${specialProduct ? "Ce produit remontera automatiquement dans les pages client selon le jour." : "Choisis un produit pour remplir automatiquement la carte du jour."}</p>
      </div>
    </article>
  `);

  container.innerHTML = cards.join("");
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
  renderUpcomingPromotions();
  renderDailySpecials();
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

  try {
    const data = await apiRequest("/products/marketing/admin");
    applyMarketingAdminData(data);
    updatePromotionProductSelects();
    bindPromotionProductAutofill();
  } catch (error) {
    showMessage("marketing-message", "error", error.message);
  }
}

async function handleCurrentPromotionSubmit(event) {
  event.preventDefault();
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
  } catch (error) {
    showMessage("marketing-message", "error", error.message);
  }
}

window.editUpcomingPromotion = function editUpcomingPromotion(id) {
  const form = document.getElementById("upcoming-promotion-form");
  const submit = document.getElementById("upcoming-promotion-submit");
  const cancel = document.getElementById("upcoming-promotion-cancel");
  const currentEvent = marketingAdminState.upcomingEvents.find(item => Number(item.id) === Number(id));
  if (!form || !currentEvent) return;

  form.elements.id.value = currentEvent.id;
  form.elements.title.value = currentEvent.title || "";
  form.elements.price_label.value = currentEvent.price_label || "15$";
  form.elements.product_id.innerHTML = getMarketingProductOptions(currentEvent.product_id || "");
  form.elements.product_id.value = currentEvent.product_id || "";
  form.elements.product_id.dataset.selectedProductId = String(currentEvent.product_id || "");
  form.elements.period_label.value = currentEvent.period_label || "";
  form.elements.sort_order.value = Number(currentEvent.sort_order || 0);
  form.elements.image.value = currentEvent.image || "";
  updateMarketingImagePreview("upcoming-promotion-image-preview", currentEvent.image || "");
  form.elements.start_date.value = currentEvent.start_date ? String(currentEvent.start_date).slice(0, 10) : "";
  form.elements.end_date.value = currentEvent.end_date ? String(currentEvent.end_date).slice(0, 10) : "";
  form.elements.description.value = currentEvent.description || "";
  form.elements.is_active.checked = currentEvent.is_active !== false;
  if (submit) submit.textContent = "Mettre à jour l'événement";
  if (cancel) cancel.style.display = "";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  bindPromotionProductAutofill();
};

window.deleteUpcomingPromotion = async function deleteUpcomingPromotion(id) {
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
  } catch (error) {
    showMessage("marketing-message", "error", error.message);
  }
}

async function handleDailySpecialsSubmit(event) {
  event.preventDefault();

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

  currentForm?.addEventListener("submit", handleCurrentPromotionSubmit);
  upcomingForm?.addEventListener("submit", handleUpcomingPromotionSubmit);
  dailyForm?.addEventListener("submit", handleDailySpecialsSubmit);
  cancelButton?.addEventListener("click", resetUpcomingPromotionForm);
  currentImageFileInput?.addEventListener("change", async event => {
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
