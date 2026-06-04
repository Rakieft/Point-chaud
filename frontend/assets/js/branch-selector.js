const CURRENT_EVENT = {
  badge: "Événement actuel",
  title: "Burger Week",
  period: "En cours cette semaine",
  price: "15$",
  description: "Des burgers plus visibles, plus gourmands et une offre qui pousse naturellement la commande en ligne.",
  image: "../assets/images/home/burger-week-promo.png"
};

const UPCOMING_EVENTS = [
  {
    badge: "Bientôt",
    title: "Wing & Things",
    period: "Vendredi soir",
    price: "15$",
    description: "Wings, frites et boissons pour les commandes de fin de semaine."
  },
  {
    badge: "À venir",
    title: "Midi Express",
    period: "La semaine prochaine",
    price: "15$",
    description: "Offres rapides sur les plats chauds pour booster les pauses déjeuner."
  },
  {
    badge: "À venir",
    title: "Matin Point Chaud",
    period: "Prochain lancement",
    price: "15$",
    description: "Pain chaud, pâtés et boissons chaudes dans une offre petit-déjeuner."
  }
];

const WEEKLY_PRODUCT_PLAN = [
  {
    dayKey: "monday",
    dayLabel: "Lundi",
    title: "Diri lalo",
    fallbackProductName: "Riz + poulet",
    side: "Gombo, viande bien assaisonnée et sauce maison",
    note: "Un grand classique haïtien, généreux et très attendu au déjeuner.",
    standard: "Version normale : portion classique, chaude et équilibrée.",
    premium: "Version premium : plus de viande, plus de sauce et une présentation plus riche."
  },
  {
    dayKey: "tuesday",
    dayLabel: "Mardi",
    title: "Sòs pwa ak diri blan",
    fallbackProductName: "Riz + hareng",
    side: "Hareng, avocat ou viande selon la préparation du jour",
    note: "Une base créole forte qui parle immédiatement au client local.",
    standard: "Version normale : assiette pratique et complète pour le midi.",
    premium: "Version premium : finition plus généreuse et accompagnement renforcé."
  },
  {
    dayKey: "wednesday",
    dayLabel: "Mercredi",
    title: "Legim ak diri",
    fallbackProductName: "Riz + poulet",
    side: "Légumes cuits, viande tendre et belle sauce chaude",
    note: "Un vrai plat haïtien du milieu de semaine, réconfortant et solide.",
    standard: "Version normale : bon volume et service rapide.",
    premium: "Version premium : plus de viande et plus de textures dans l’assiette."
  },
  {
    dayKey: "thursday",
    dayLabel: "Jeudi",
    title: "Diri kole ak poul",
    fallbackProductName: "Riz + poulet",
    side: "Riz bien monté, poulet assaisonné et sauce maison",
    note: "Le genre de proposition qui pousse naturellement à commander encore.",
    standard: "Version normale : classique maison bien maîtrisé.",
    premium: "Version premium : pièce plus belle et rendu plus gourmand."
  },
  {
    dayKey: "friday",
    dayLabel: "Vendredi",
    title: "Griot ak bannann peze",
    fallbackProductName: "Poulet frit",
    side: "Viande frite, pikliz et bananes bien dorées",
    note: "Le vendredi mérite un plat fort, festif et très haïtien.",
    standard: "Version normale : format simple, rapide et gourmand.",
    premium: "Version premium : portion plus large et finition week-end."
  },
  {
    dayKey: "saturday",
    dayLabel: "Samedi",
    title: "Tasso kabrit ak diri dyondyon",
    fallbackProductName: "Riz + poulet",
    side: "Saveur plus premium pour le week-end",
    note: "Une proposition plus haut de gamme pour faire monter le panier.",
    standard: "Version normale : week-end gourmand en format classique.",
    premium: "Version premium : expérience chef, plus dense et plus raffinée."
  },
  {
    dayKey: "sunday",
    dayLabel: "Dimanche",
    title: "Bouillon haïtien",
    fallbackProductName: "Spaghetti",
    side: "Bouillon bien monté, légumes et viande fondante",
    note: "Un dimanche haïtien crédible, chaleureux et très parlant.",
    standard: "Version normale : bol généreux pour la famille.",
    premium: "Version premium : version plus complète avec garniture renforcée."
  }
];

const BRANCH_WEEKDAY_LABELS = {
  monday: "Lundi",
  tuesday: "Mardi",
  wednesday: "Mercredi",
  thursday: "Jeudi",
  friday: "Vendredi",
  saturday: "Samedi",
  sunday: "Dimanche"
};

let branchMarketingPromise = null;
let branchHasActiveCurrentEvent = true;

async function loadBranchMarketingContent() {
  if (branchMarketingPromise) return branchMarketingPromise;

  branchMarketingPromise = apiRequest("/products/marketing")
    .then(data => {
      branchHasActiveCurrentEvent = Boolean(data?.currentEvent);

      if (data?.currentEvent) {
        CURRENT_EVENT.badge = "Événement actuel";
        CURRENT_EVENT.title = data.currentEvent.title || CURRENT_EVENT.title;
        CURRENT_EVENT.period = data.currentEvent.period_label || CURRENT_EVENT.period;
        CURRENT_EVENT.price = data.currentEvent.price_label || CURRENT_EVENT.price;
        CURRENT_EVENT.description = data.currentEvent.description || CURRENT_EVENT.description;
        CURRENT_EVENT.image = getMarketingPromoImage(data.currentEvent, CURRENT_EVENT.image);
      }

      if (Array.isArray(data?.upcomingEvents) && data.upcomingEvents.length) {
        UPCOMING_EVENTS.length = 0;
        UPCOMING_EVENTS.push(
          ...data.upcomingEvents
            .filter(event => event.is_active)
            .map((event, index) => ({
              badge: index === 0 ? "Bientôt" : "À venir",
              title: event.title || "Événement",
              period: event.period_label || "À confirmer",
              price: event.price_label || "15$",
              description: event.description || "Offre en préparation."
            }))
        );
      }

      if (Array.isArray(data?.dailySpecials) && data.dailySpecials.length) {
        WEEKLY_PRODUCT_PLAN.length = 0;
        WEEKLY_PRODUCT_PLAN.push(
          ...data.dailySpecials.map(item => ({
            dayKey: item.weekday,
            dayLabel: BRANCH_WEEKDAY_LABELS[item.weekday] || item.weekday,
            title: item.product?.name || "Plat du jour",
            fallbackProductName: item.product?.name || "Plat du jour",
            product: item.product || null,
            is_active: item.is_active !== false
          }))
        );
      }

      return data;
    })
    .catch(() => null);

  return branchMarketingPromise;
}

function getHaitiWeekdayKey() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Port-au-Prince",
    weekday: "long"
  })
    .format(new Date())
    .toLowerCase();
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim();
}

function countAvailableProductsForLocation(products, locationId) {
  return products.filter(product => {
    const stock =
      product?.location_stocks?.find(item => Number(item.location_id) === Number(locationId))?.stock ?? 0;
    return Number(stock) > 0;
  }).length;
}

function findProductByName(products, name) {
  const normalizedName = normalizeText(name);
  return (
    products.find(product => normalizeText(product.name) === normalizedName) ||
    products.find(product => normalizeText(product.name).includes(normalizedName))
  );
}

function getWeekPlan(products) {
  const weekdayKey = getHaitiWeekdayKey();
  const currentIndex = Math.max(
    0,
    WEEKLY_PRODUCT_PLAN.findIndex(item => item.dayKey === weekdayKey)
  );
  const rotated = [
    ...WEEKLY_PRODUCT_PLAN.slice(currentIndex),
    ...WEEKLY_PRODUCT_PLAN.slice(0, currentIndex)
  ];

  return rotated.map(item => ({
    ...item,
    product: item.product || findProductByName(products, item.fallbackProductName || item.title)
  }));
}

function buildBranchMenuUrl(location) {
  const params = new URLSearchParams({
    location_id: String(location.id)
  });
  return `./products.html?${params.toString()}`;
}

function showClientBranchSelectorView() {
  const sessionUser = storage.user;
  if (!sessionUser || sessionUser.role !== "client") {
    return false;
  }

  const publicShell = document.getElementById("branch-selector-public-shell");
  const clientShell = document.getElementById("branch-selector-client-shell");
  const contentRoot = document.getElementById("branch-selector-main-content");
  const clientMount = document.getElementById("client-branch-selector-mount");
  if (!clientShell || !contentRoot || !clientMount) {
    return false;
  }

  if (publicShell) {
    publicShell.style.display = "none";
  }

  clientShell.style.display = "block";
  clientMount.appendChild(contentRoot);
  document.body.classList.add("client-body");
  document.body.dataset.clientPage = "branches";

  if (typeof window.initClientShell === "function") {
    window.initClientShell();
  }

  return true;
}

function rememberSelectedLocation(location) {
  localStorage.setItem("pointchaud_selected_location_id", String(location.id));
  localStorage.setItem("pointchaud_selected_location_name", String(location.name || ""));
  localStorage.setItem("pointchaud_selected_location_address", String(location.address || ""));
}

function renderBranchCards(locations, products) {
  const container = document.getElementById("branch-selection-grid");
  if (!container) return;

  container.innerHTML = locations
    .map(location => {
      return `
        <article class="branch-card panel">
          <span class="badge">Point chaud</span>
          <h3>${location.name}</h3>
          <p>${location.address || "Adresse à confirmer"}</p>
          <a class="btn btn-primary branch-select-button" href="${buildBranchMenuUrl(location)}" data-location-id="${location.id}">
            Choisir ${location.name}
          </a>
        </article>
      `;
    })
    .join("");

  container.querySelectorAll(".branch-select-button").forEach(button => {
    button.addEventListener("click", () => {
      const location = locations.find(item => Number(item.id) === Number(button.dataset.locationId));
      if (location) {
        rememberSelectedLocation(location);
      }
    });
  });
}

function renderCurrentEvent() {
  const container = document.getElementById("branch-current-event-card");
  if (!container) return;

  if (!branchHasActiveCurrentEvent) {
    container.hidden = true;
    container.innerHTML = "";
    container.style.background = "";
    return;
  }

  container.hidden = false;
  const eventImage = resolveMarketingImagePath(CURRENT_EVENT.image, "../assets/images/home/burger-week-promo.png");

  container.style.background = `
    linear-gradient(96deg, rgba(41, 16, 9, 0.94) 0%, rgba(85, 28, 8, 0.72) 38%, rgba(118, 43, 10, 0.24) 62%, rgba(255, 120, 28, 0.1) 100%),
    url("${eventImage}")
  `;
  container.style.backgroundSize = "cover";
  container.style.backgroundPosition = "center";
  container.style.backgroundRepeat = "no-repeat";

  container.innerHTML = `
    <div class="branch-current-event-copy">
      <span class="badge">${CURRENT_EVENT.badge}</span>
      <small>${CURRENT_EVENT.period}</small>
      <h3>${CURRENT_EVENT.title}</h3>
      <strong class="branch-event-price">${CURRENT_EVENT.price}</strong>
      <p>${CURRENT_EVENT.description}</p>
      <a class="btn btn-light" href="./succursales.html#branch-selection-grid">Choisir une succursale</a>
    </div>
  `;
}

function renderUpcomingEvents() {
  const track = document.getElementById("branch-upcoming-events-track");
  if (!track) return;

  const cards = UPCOMING_EVENTS.map(
    event => `
      <article class="branch-upcoming-event-card">
        <span class="badge">${event.badge}</span>
        <strong>${event.title}</strong>
        <small>${event.period}</small>
        <strong class="branch-event-price">${event.price}</strong>
        <p>${event.description}</p>
      </article>
    `
  ).join("");

  track.innerHTML = `${cards}${cards}`;
}

function renderWeeklyDishes(products) {
  const dishOfTheDayCard = document.getElementById("dish-of-the-day-card");
  const weekGrid = document.getElementById("week-menu-grid");
  if (!dishOfTheDayCard || !weekGrid) return;

  const weekPlan = getWeekPlan(products);
  const todayItem = weekPlan[0];
  const otherDays = weekPlan.slice(1);

  dishOfTheDayCard.innerHTML = todayItem
    ? `
      <div class="simple-dish-card simple-dish-card-featured">
        <div class="simple-dish-card-media">
          <img
            src="${resolveProductImage(todayItem.product || { image: "", name: todayItem.fallbackProductName || todayItem.title })}"
            alt="${todayItem.title}"
            loading="lazy"
            onerror="handleProductImageError(this, '${String(todayItem.title || "").replace(/'/g, "\\'")}', '')" />
        </div>
        <div class="simple-dish-card-copy">
          <span class="badge">Plat du jour</span>
          <small>${todayItem.dayLabel}</small>
          <h3>${todayItem.title}</h3>
          <strong>${todayItem.product ? formatMoney(todayItem.product.price) : "Prix du jour"}</strong>
        </div>
      </div>
    `
    : `<div class="empty-state"><p>Aucun plat du jour n'a pu être préparé.</p></div>`;

  const cards = otherDays
    .map(
      item => `
        <article class="week-menu-card ${item.dayKey === "saturday" || item.dayKey === "sunday" ? "premium" : "standard"}">
          <small>${item.dayLabel}</small>
          <strong>${item.title}</strong>
          <span>${item.product ? formatMoney(item.product.price) : "Prix du jour"}</span>
        </article>
      `
    )
    .join("");

  weekGrid.innerHTML = `
    <div class="week-menu-viewport">
      <div class="week-menu-track">
        ${cards}
        ${cards}
      </div>
    </div>
  `;
}

async function renderBranchSelectorPage() {
  if (!document.body.classList.contains("branch-selector-page")) return;

  try {
    await loadBranchMarketingContent();
    const catalog = await apiRequest("/products");
    const products = Array.isArray(catalog.products) ? catalog.products : [];
    const locations = Array.isArray(catalog.locations) ? catalog.locations : [];

    renderBranchCards(locations, products);
    renderCurrentEvent();
    renderUpcomingEvents();
    renderWeeklyDishes(products);
  } catch (error) {
    const container = document.getElementById("branch-selection-grid");
    if (container) {
      container.innerHTML = `<div class="empty-state"><p>${error.message}</p></div>`;
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  showClientBranchSelectorView();
  renderBranchSelectorPage();
});
