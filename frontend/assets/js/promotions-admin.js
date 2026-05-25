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

function getMarketingProductOptions(selectedProductId = "") {
  const options = [`<option value="">Aucun produit lié</option>`];
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
    ["Événement principal", marketingAdminState.currentEvent?.title || "Aucun", "Bloc principal affiché côté client"],
    ["Événements à venir", marketingAdminState.upcomingEvents.length, `${activeUpcoming} visible(s) actuellement`],
    ["Plats programmés", linkedDailySpecials, "Jours déjà liés à un vrai produit"],
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
  if (submit) submit.textContent = "Ajouter l’événement";
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
                <strong>${event.title}</strong>
                <small class="muted">${event.period_label || "Période non précisée"} • ${event.price_label || "Prix libre"}</small>
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
        <article class="panel marketing-day-card">
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
  if (submit) submit.textContent = "Mettre à jour l’événement";
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

    const data = await apiRequest(editingId ? `/products/marketing/upcoming/${editingId}` : "/products/marketing/upcoming", {
      method: editingId ? "PATCH" : "POST",
      body: JSON.stringify(payload)
    });

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
