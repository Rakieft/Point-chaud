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

function buildMarketingPreviewImage(image) {
  const value = String(image || "").trim();
  return value || "../assets/images/home/burger-week-promo.png";
}

function getMarketingProductOptions(selectedProductId = "") {
  const options = [`<option value="">Aucun produit lie</option>`];
  marketingAdminState.products.forEach(product => {
    options.push(
      `<option value="${product.id}" ${Number(selectedProductId) === Number(product.id) ? "selected" : ""}>${product.name} - ${formatMoney(product.price)}</option>`
    );
  });
  return options.join("");
}

function renderMarketingSummary() {
  const container = document.getElementById("marketing-summary-grid");
  if (!container) return;

  const activeUpcoming = marketingAdminState.upcomingEvents.filter(event => event.is_active).length;
  const linkedDailySpecials = marketingAdminState.dailySpecials.filter(item => item.product_id).length;

  container.innerHTML = [
    ["Evenement principal", marketingAdminState.currentEvent?.title || "Aucun", "Bloc principal affiche cote client"],
    ["Evenements a venir", marketingAdminState.upcomingEvents.length, `${activeUpcoming} visible(s) actuellement`],
    ["Plats programmes", linkedDailySpecials, "Jours relies a un vrai produit"],
    ["Produits disponibles", marketingAdminState.products.length, "Catalogue disponible pour les liaisons"]
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

function renderCurrentPromotionPreview() {
  const container = document.getElementById("current-promotion-preview");
  if (!container) return;

  const event = marketingAdminState.currentEvent || {};
  const title = event.title || "Evenement principal a preparer";
  const period = event.period_label || "Periode a definir";
  const description = event.description || "Ajoute un texte court pour donner tout de suite envie au client.";
  const price = event.price_label || "Offre libre";
  const statusLabel = event.is_active === false ? "Brouillon" : "Actif";

  container.innerHTML = `
    <article class="marketing-preview-card" style="background-image:
      linear-gradient(135deg, rgba(44, 18, 10, 0.96), rgba(131, 37, 13, 0.82) 52%, rgba(245, 124, 0, 0.28)),
      url('${buildMarketingPreviewImage(event.image)}')">
      <div class="marketing-preview-copy">
        <span class="badge">${statusLabel}</span>
        <small>${period}</small>
        <h3>${title}</h3>
        <strong>${price}</strong>
        <p>${description}</p>
      </div>
    </article>
  `;
}

function fillCurrentPromotionForm() {
  const form = document.getElementById("current-promotion-form");
  if (!form) return;

  const event = marketingAdminState.currentEvent || {};
  form.elements.id.value = event.id || "";
  form.elements.title.value = event.title || "";
  form.elements.price_label.value = event.price_label || "15$";
  form.elements.period_label.value = event.period_label || "";
  form.elements.image.value = event.image || "";
  form.elements.start_date.value = event.start_date ? String(event.start_date).slice(0, 10) : "";
  form.elements.end_date.value = event.end_date ? String(event.end_date).slice(0, 10) : "";
  form.elements.description.value = event.description || "";
  form.elements.is_active.checked = event.is_active !== false;
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
  form.elements.is_active.checked = true;
  if (submit) submit.textContent = "Ajouter l'evenement";
  if (cancel) cancel.style.display = "none";
}

function renderUpcomingPromotions() {
  const container = document.getElementById("upcoming-promotions-list");
  if (!container) return;

  container.innerHTML = marketingAdminState.upcomingEvents.length
    ? marketingAdminState.upcomingEvents
        .map(
          event => `
            <article class="admin-category-chip marketing-event-chip ${event.is_active ? "is-active" : "is-draft"}">
              <div class="marketing-event-chip-copy stack-sm">
                <div class="toolbar">
                  <strong>${event.title}</strong>
                  <span class="status ${event.is_active ? "paid" : "cancelled"}">${event.is_active ? "Actif" : "Inactif"}</span>
                </div>
                <small class="muted">${event.period_label || "Periode non precisee"} • ${event.price_label || "Prix libre"}</small>
                <small>${event.description || "Sans texte court."}</small>
                <div class="marketing-event-chip-meta">
                  <span>Ordre: ${Number(event.sort_order || 0)}</span>
                  <span>${event.start_date ? `Debut: ${String(event.start_date).slice(0, 10)}` : "Debut libre"}</span>
                  <span>${event.end_date ? `Fin: ${String(event.end_date).slice(0, 10)}` : "Fin libre"}</span>
                </div>
              </div>
              <div class="admin-action-group">
                <button class="btn-light" type="button" onclick="editUpcomingPromotion(${event.id})">Modifier</button>
                <button class="admin-btn-danger" type="button" onclick="deleteUpcomingPromotion(${event.id})">Supprimer</button>
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state"><p>Aucun evenement a venir pour le moment.</p></div>`;
}

function renderMarketingWeekLegend() {
  const container = document.getElementById("marketing-week-legend");
  if (!container) return;

  const activeCount = marketingAdminState.dailySpecials.filter(item => item.is_active !== false).length;
  const linkedCount = marketingAdminState.dailySpecials.filter(item => item.product_id).length;

  container.innerHTML = `
    <article class="marketing-legend-card">
      <strong>Semaine active</strong>
      <span>${activeCount}/7 jours actifs</span>
      <small>${linkedCount} jour(s) relies a un produit reel.</small>
    </article>
    <article class="marketing-legend-card">
      <strong>Conseil</strong>
      <span>Varie les categories</span>
      <small>Melange plats forts, snacks et boissons pour garder la page client vivante.</small>
    </article>
  `;
}

function renderDailySpecials() {
  const container = document.getElementById("daily-specials-grid");
  if (!container) return;

  container.innerHTML = Object.entries(WEEKDAY_LABELS)
    .map(([weekday, label]) => {
      const item = marketingAdminState.dailySpecials.find(entry => entry.weekday === weekday) || {};
      return `
        <article class="panel marketing-day-card">
          <div class="marketing-day-card-head">
            <div class="stack-sm">
              <strong>${label}</strong>
              <small class="muted">${item.product ? `Actuel: ${item.product.name}` : "Aucun produit choisi"}</small>
            </div>
            <span class="status ${item.is_active !== false ? "paid" : "cancelled"}">${item.is_active !== false ? "Actif" : "Pause"}</span>
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

function applyMarketingAdminData(data) {
  marketingAdminState = {
    currentEvent: data.currentEvent || null,
    upcomingEvents: Array.isArray(data.upcomingEvents) ? data.upcomingEvents : [],
    dailySpecials: Array.isArray(data.dailySpecials) ? data.dailySpecials : [],
    products: Array.isArray(data.products) ? data.products : []
  };

  renderMarketingSummary();
  renderCurrentPromotionPreview();
  fillCurrentPromotionForm();
  renderUpcomingPromotions();
  renderMarketingWeekLegend();
  renderDailySpecials();
}

async function loadMarketingAdminPage() {
  const user = await loadBackofficeUser();
  if (!user) return;

  try {
    const data = await apiRequest("/products/marketing/admin");
    applyMarketingAdminData(data);
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
  } catch (error) {
    showMessage("marketing-message", "error", error.message);
  }
}

window.editUpcomingPromotion = function editUpcomingPromotion(id) {
  const form = document.getElementById("upcoming-promotion-form");
  const submit = document.getElementById("upcoming-promotion-submit");
  const cancel = document.getElementById("upcoming-promotion-cancel");
  const event = marketingAdminState.upcomingEvents.find(item => Number(item.id) === Number(id));
  if (!form || !event) return;

  form.elements.id.value = event.id;
  form.elements.title.value = event.title || "";
  form.elements.price_label.value = event.price_label || "15$";
  form.elements.period_label.value = event.period_label || "";
  form.elements.sort_order.value = Number(event.sort_order || 0);
  form.elements.image.value = event.image || "";
  form.elements.start_date.value = event.start_date ? String(event.start_date).slice(0, 10) : "";
  form.elements.end_date.value = event.end_date ? String(event.end_date).slice(0, 10) : "";
  form.elements.description.value = event.description || "";
  form.elements.is_active.checked = event.is_active !== false;
  if (submit) submit.textContent = "Mettre a jour l'evenement";
  if (cancel) cancel.style.display = "";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
};

window.deleteUpcomingPromotion = async function deleteUpcomingPromotion(id) {
  try {
    const data = await apiRequest(`/products/marketing/upcoming/${id}`, { method: "DELETE" });
    showMessage("marketing-message", "success", data.message);
    applyMarketingAdminData({ ...data, products: marketingAdminState.products });
    resetUpcomingPromotionForm();
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
      period_label: form.elements.period_label.value.trim(),
      sort_order: Number(form.elements.sort_order.value || 0),
      image: form.elements.image.value.trim(),
      start_date: form.elements.start_date.value || null,
      end_date: form.elements.end_date.value || null,
      description: form.elements.description.value.trim(),
      is_active: form.elements.is_active.checked
    };

    const data = await apiRequest(
      editingId ? `/products/marketing/upcoming/${editingId}` : "/products/marketing/upcoming",
      {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(payload)
      }
    );

    showMessage("marketing-message", "success", data.message);
    applyMarketingAdminData({ ...data, products: marketingAdminState.products });
    resetUpcomingPromotionForm();
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
  } catch (error) {
    showMessage("marketing-message", "error", error.message);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const currentForm = document.getElementById("current-promotion-form");
  const upcomingForm = document.getElementById("upcoming-promotion-form");
  const dailyForm = document.getElementById("daily-specials-form");
  const cancelButton = document.getElementById("upcoming-promotion-cancel");

  currentForm?.addEventListener("submit", handleCurrentPromotionSubmit);
  upcomingForm?.addEventListener("submit", handleUpcomingPromotionSubmit);
  dailyForm?.addEventListener("submit", handleDailySpecialsSubmit);
  cancelButton?.addEventListener("click", resetUpcomingPromotionForm);

  loadMarketingAdminPage();
});
