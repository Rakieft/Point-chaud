const THEME_STORAGE_KEY = "pointchaud_theme";

function readStoredTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) || "light";
  } catch (error) {
    return "light";
  }
}

function applyTheme(theme) {
  const safeTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", safeTheme);
  document.documentElement.style.colorScheme = safeTheme;

  try {
    localStorage.setItem(THEME_STORAGE_KEY, safeTheme);
  } catch (error) {
    // Ignore storage errors and keep the theme applied in memory.
  }

  const toggle = document.getElementById("theme-toggle-button");
  if (toggle) {
    toggle.dataset.theme = safeTheme;
    toggle.setAttribute("aria-label", safeTheme === "dark" ? "Activer le mode clair" : "Activer le mode sombre");
    toggle.innerHTML =
      safeTheme === "dark"
        ? `<span class="theme-toggle-icon" aria-hidden="true">☀</span><span class="theme-toggle-copy">Mode clair</span>`
        : `<span class="theme-toggle-icon" aria-hidden="true">☾</span><span class="theme-toggle-copy">Mode sombre</span>`;
  }
}

applyTheme(readStoredTheme());

function resolveApiBaseUrl() {
  const runtimeOverride = window.POINT_CHAUD_API_BASE_URL || document.documentElement.dataset.apiBaseUrl;
  if (runtimeOverride) {
    return String(runtimeOverride).replace(/\/$/, "");
  }

  if (window.location.protocol === "file:") {
    return "http://localhost:5000/api";
  }

  const host = window.location.hostname;
  const port = window.location.port;
  const isLocalPreviewHost = ["127.0.0.1", "localhost"].includes(host);
  const isFrontendPreviewPort = ["5500", "5501", "5502", "5503"].includes(port);

  if (isLocalPreviewHost && isFrontendPreviewPort) {
    return "http://localhost:5000/api";
  }

  return `${window.location.origin}/api`;
}

const API_BASE_URL = resolveApiBaseUrl();
const SUPPORT_CONFIG = {
  whatsappNumber:
    window.POINT_CHAUD_WHATSAPP_NUMBER ||
    document.documentElement.dataset.whatsappNumber ||
    "50900000000",
  whatsappMessage:
    window.POINT_CHAUD_WHATSAPP_MESSAGE ||
    document.documentElement.dataset.whatsappMessage ||
    "Bonjour Point Chaud, je veux plus d'informations.",
  whatsappBranches: {
    route_freres: "",
    petion_ville: "",
    delmas: ""
  },
  instagramUrl: window.POINT_CHAUD_INSTAGRAM_URL || document.documentElement.dataset.instagramUrl || "",
  tiktokUrl: window.POINT_CHAUD_TIKTOK_URL || document.documentElement.dataset.tiktokUrl || ""
};
let publicConfigPromise = null;

const storage = {
  get token() {
    return localStorage.getItem("pointchaud_token");
  },
  set token(value) {
    if (!value) {
      localStorage.removeItem("pointchaud_token");
      return;
    }

    localStorage.setItem("pointchaud_token", value);
  },
  get user() {
    const value = localStorage.getItem("pointchaud_user");
    return value ? JSON.parse(value) : null;
  },
  set user(value) {
    if (!value) {
      localStorage.removeItem("pointchaud_user");
      return;
    }

    localStorage.setItem("pointchaud_user", JSON.stringify(value));
  }
};

const liveRefreshRegistry = new Map();

async function apiRequest(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const isFormData = options.body instanceof FormData;

  if (!isFormData) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  if (storage.token) {
    headers.Authorization = `Bearer ${storage.token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    cache: "no-store"
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Une erreur est survenue");
  }

  return data;
}

async function uploadAdminImageFile(file, scope = "general") {
  const formData = new FormData();
  formData.append("image", file);
  return apiRequest(`/products/upload-image?scope=${encodeURIComponent(scope)}`, {
    method: "POST",
    body: formData
  });
}

function stopLiveRefresh(key) {
  const current = liveRefreshRegistry.get(key);
  if (!current) return;
  clearInterval(current.intervalId);
  liveRefreshRegistry.delete(key);
}

function startLiveRefresh(key, callback, intervalMs = 15000) {
  stopLiveRefresh(key);

  const run = async () => {
    if (document.hidden) return;
    await callback();
  };

  const intervalId = window.setInterval(run, intervalMs);
  liveRefreshRegistry.set(key, { intervalId, callback, intervalMs });
  return run;
}

function saveSession(data) {
  storage.token = data.token;
  storage.user = data.user;
}

function clearSession() {
  storage.token = null;
  storage.user = null;
}

function requireAuth(roles = []) {
  const user = storage.user;

  if (!user || !storage.token) {
    window.location.href = "/login.html";
    return null;
  }

  if (roles.length && !roles.includes(user.role)) {
    const nextPage =
      user.role === "client"
        ? "/dashboard-client.html"
        : user.role === "driver"
          ? "/dashboard-driver.html"
          : "/dashboard-admin.html";
    window.location.href = nextPage;
    return null;
  }

  return user;
}

function guardGuestCartLinks(root = document) {
  root.querySelectorAll('a[href$="cart.html"], a[href$="/cart.html"]').forEach(link => {
    if (link.dataset.cartGuardBound === "true") return;
    link.dataset.cartGuardBound = "true";

    link.addEventListener("click", event => {
      const user = storage.user;
      if (user?.role === "client" && storage.token) return;

      event.preventDefault();
      window.location.href = "/login.html";
    });
  });
}

function formatMoney(value) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "HTG",
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function formatDateValue(date) {
  if (!date) return "";

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return String(date);
  }

  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "America/Port-au-Prince",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(parsed);
}

function formatTimeValue(time) {
  if (!time) return "";

  const clean = String(time).slice(0, 5);
  if (/^\d{2}:\d{2}$/.test(clean)) {
    return clean;
  }

  const parsed = new Date(time);
  if (Number.isNaN(parsed.getTime())) {
    return String(time).slice(0, 5);
  }

  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "America/Port-au-Prince",
    hour: "2-digit",
    minute: "2-digit"
  }).format(parsed);
}

function formatTimestamp(value) {
  if (!value) return "";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "America/Port-au-Prince",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(parsed);
}

function formatDateTime(date, time) {
  const dateLabel = formatDateValue(date);
  const timeLabel = formatTimeValue(time);
  return `${dateLabel || ""}${dateLabel && timeLabel ? " a " : ""}${timeLabel || ""}`;
}

function slugifyText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function buildProductPlaceholder(product) {
  const name = product?.name || "Produit";
  const primary = "#b93821";
  const secondary = "#ef6b2f";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${primary}" />
          <stop offset="100%" stop-color="${secondary}" />
        </linearGradient>
      </defs>
      <rect width="640" height="420" rx="36" fill="url(#g)" />
      <circle cx="520" cy="92" r="78" fill="rgba(255,255,255,0.12)" />
      <circle cx="118" cy="330" r="92" fill="rgba(255,255,255,0.08)" />
      <text x="44" y="188" fill="#ffffff" font-family="Segoe UI, Arial, sans-serif" font-size="42" font-weight="800">${name}</text>
      <text x="44" y="248" fill="#fff4e8" font-family="Segoe UI, Arial, sans-serif" font-size="24">Apercu produit Point Chaud</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function resolveProductImage(product) {
  const image = String(product?.image || "").trim();

  if (image) {
    if (/^(https?:)?\/\//i.test(image) || image.startsWith("data:") || image.startsWith("../")) {
      return image;
    }

    if (image.startsWith("/")) {
      return image;
    }

    return `../assets/images/products/${image}`;
  }

  const slug = slugifyText(product?.name || "");
  return slug ? `../assets/images/products/${slug}.webp` : buildProductPlaceholder(product);
}

function resolveMarketingImagePath(imagePath, fallbackImage = "") {
  const image = String(imagePath || "").trim();
  if (!image) return fallbackImage;

  if (/^(https?:)?\/\//i.test(image) || image.startsWith("data:") || image.startsWith("../")) {
    return image;
  }

  if (image.startsWith("/")) {
    return image;
  }

  if (image.startsWith("uploads/")) {
    return `/${image}`;
  }

  if (/\.(png|jpe?g|webp|gif|svg)$/i.test(image)) {
    return `../assets/images/home/${image}`;
  }

  return fallbackImage || image;
}

function handleProductImageError(imageElement, productName, categoryName) {
  if (!imageElement || imageElement.dataset.fallbackApplied === "true") {
    return;
  }

  const currentSrc = imageElement.getAttribute("src") || "";
  if (currentSrc.endsWith(".webp")) {
    imageElement.src = currentSrc.replace(/\.webp$/i, ".jpg");
    return;
  }

  if (currentSrc.endsWith(".jpg")) {
    imageElement.src = currentSrc.replace(/\.jpg$/i, ".png");
    return;
  }

  imageElement.dataset.fallbackApplied = "true";
  imageElement.src = buildProductPlaceholder({ name: productName, category_name: categoryName });
}

function getCart() {
  return JSON.parse(localStorage.getItem("pointchaud_cart") || "[]");
}

function saveCart(items) {
  localStorage.setItem("pointchaud_cart", JSON.stringify(items));
}

function showMessage(targetId, type, message) {
  const element = document.getElementById(targetId);

  if (!element) {
    return;
  }

  element.className = `message-box visible ${type}`;
  element.textContent = message;
}

function logout() {
  clearSession();
  window.location.href = "/login.html";
}

function injectThemeToggle() {
  if (document.getElementById("theme-toggle-button")) {
    applyTheme(readStoredTheme());
    return;
  }

  const button = document.createElement("button");
  button.id = "theme-toggle-button";
  button.className = "theme-toggle-button";
  button.type = "button";
  button.addEventListener("click", () => {
    const nextTheme = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
  });

  document.body.appendChild(button);
  applyTheme(readStoredTheme());
}

function currentPageName() {
  return String(window.location.pathname || "")
    .split("/")
    .pop()
    .toLowerCase();
}

function shouldShowWhatsAppSupport() {
  const allowedPages = new Set([
    "index.html",
    "succursales.html",
    "products.html",
    "login.html",
    "register.html",
    "dashboard-client.html",
    "client-products.html",
    "client-cart.html",
    "client-orders.html",
    "client-profile.html",
    "checkout.html",
    "cart.html"
  ]);

  return allowedPages.has(currentPageName());
}

function buildWhatsAppUrl(phoneNumber = SUPPORT_CONFIG.whatsappNumber, message = SUPPORT_CONFIG.whatsappMessage) {
  const phone = String(phoneNumber || "").replace(/\D/g, "");
  const text = encodeURIComponent(message || "Bonjour Point Chaud");
  return `https://wa.me/${phone}?text=${text}`;
}

function normalizeBranchKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const WHATSAPP_BRANCH_OPTIONS = [
  { key: "route_freres", label: "Route Freres" },
  { key: "petion_ville", label: "Petion-Ville" },
  { key: "delmas", label: "Delmas" }
];

function getPreferredWhatsAppBranchKey() {
  const storedName = localStorage.getItem("pointchaud_selected_location_name") || "";
  const normalized = normalizeBranchKey(storedName);
  return WHATSAPP_BRANCH_OPTIONS.some(option => option.key === normalized) ? normalized : "";
}

function getBranchWhatsAppNumber(branchKey) {
  const branchNumber = SUPPORT_CONFIG.whatsappBranches?.[branchKey];
  const cleanedBranchNumber = String(branchNumber || "").replace(/\D/g, "");
  if (cleanedBranchNumber) return cleanedBranchNumber;
  return String(SUPPORT_CONFIG.whatsappNumber || "").replace(/\D/g, "");
}

function buildBranchWhatsAppMessage(branchLabel) {
  const base = String(SUPPORT_CONFIG.whatsappMessage || "Bonjour Point Chaud, je veux plus d'informations.").trim();
  return `${base} Succursale: ${branchLabel}.`;
}

function hasAnyWhatsAppChannel() {
  const generic = String(SUPPORT_CONFIG.whatsappNumber || "").replace(/\D/g, "");
  if (generic) return true;

  return WHATSAPP_BRANCH_OPTIONS.some(option =>
    Boolean(String(SUPPORT_CONFIG.whatsappBranches?.[option.key] || "").replace(/\D/g, ""))
  );
}

function ensureWhatsAppBranchPopover() {
  let popover = document.getElementById("whatsapp-branch-popover");
  if (popover) return popover;

  popover = document.createElement("div");
  popover.id = "whatsapp-branch-popover";
  popover.className = "whatsapp-branch-popover hidden";
  popover.innerHTML = `
    <div class="whatsapp-branch-popover-head">
      <div class="whatsapp-branch-popover-copy">
        <strong>Choisir un point chaud</strong>
        <small>Sélectionne la succursale à contacter.</small>
      </div>
      <button class="whatsapp-branch-popover-close" type="button" data-whatsapp-branch-close aria-label="Fermer">×</button>
    </div>
    <div id="whatsapp-branch-options" class="whatsapp-branch-grid"></div>
  `;

  document.body.appendChild(popover);
  popover.querySelector("[data-whatsapp-branch-close]")?.addEventListener("click", closeWhatsAppBranchModal);

  if (!document.body.dataset.whatsappBranchPopoverBound) {
    document.body.dataset.whatsappBranchPopoverBound = "true";

    document.addEventListener("click", event => {
      const currentPopover = document.getElementById("whatsapp-branch-popover");
      const supportButton = document.getElementById("whatsapp-support-button");
      if (!currentPopover || currentPopover.classList.contains("hidden")) return;
      if (currentPopover.contains(event.target) || supportButton?.contains(event.target)) return;
      closeWhatsAppBranchModal();
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeWhatsAppBranchModal();
      }
    });
  }

  return popover;
}

function closeWhatsAppBranchModal() {
  const popover = document.getElementById("whatsapp-branch-popover");
  if (!popover) return;
  popover.classList.add("hidden");
}

function openWhatsAppBranch(branchKey, branchLabel) {
  const phone = getBranchWhatsAppNumber(branchKey);
  if (!phone) return;
  const url = buildWhatsAppUrl(phone, buildBranchWhatsAppMessage(branchLabel));
  closeWhatsAppBranchModal();
  window.open(url, "_blank", "noopener,noreferrer");
}

function renderWhatsAppBranchOptions() {
  const container = document.getElementById("whatsapp-branch-options");
  if (!container) return;

  const preferredKey = getPreferredWhatsAppBranchKey();
  container.innerHTML = WHATSAPP_BRANCH_OPTIONS.map(option => {
    const hasSpecificNumber = Boolean(String(SUPPORT_CONFIG.whatsappBranches?.[option.key] || "").replace(/\D/g, ""));
    const isPreferred = preferredKey === option.key;
    return `
      <button class="whatsapp-branch-option${isPreferred ? " is-preferred" : ""}" type="button" data-branch-key="${option.key}" data-branch-label="${option.label}">
        <strong>${option.label}</strong>
        <small>${hasSpecificNumber ? "Numero direct" : "Numero general Point Chaud"}</small>
      </button>
    `;
  }).join("");

  container.querySelectorAll(".whatsapp-branch-option").forEach(button => {
    button.addEventListener("click", () => {
      openWhatsAppBranch(button.dataset.branchKey, button.dataset.branchLabel);
    });
  });
}

function openWhatsAppBranchModal(event) {
  event?.preventDefault();
  const modal = ensureWhatsAppBranchPopover();
  renderWhatsAppBranchOptions();
  modal.classList.toggle("hidden");
}

async function loadPublicConfig() {
  if (publicConfigPromise) {
    return publicConfigPromise;
  }

  publicConfigPromise = apiRequest("/public-config")
    .then(config => {
      if (config?.whatsappNumber) {
        SUPPORT_CONFIG.whatsappNumber = config.whatsappNumber;
      }

      if (config?.whatsappMessage) {
        SUPPORT_CONFIG.whatsappMessage = config.whatsappMessage;
      }

      if (config?.whatsappBranches && typeof config.whatsappBranches === "object") {
        SUPPORT_CONFIG.whatsappBranches = {
          route_freres: config.whatsappBranches.route_freres || "",
          petion_ville: config.whatsappBranches.petion_ville || "",
          delmas: config.whatsappBranches.delmas || ""
        };
      }

      if (config?.instagramUrl) {
        SUPPORT_CONFIG.instagramUrl = config.instagramUrl;
      }

      if (config?.tiktokUrl) {
        SUPPORT_CONFIG.tiktokUrl = config.tiktokUrl;
      }

      return SUPPORT_CONFIG;
    })
    .catch(() => SUPPORT_CONFIG);

  return publicConfigPromise;
}

async function injectWhatsAppSupportButton() {
  if (!shouldShowWhatsAppSupport() || document.getElementById("whatsapp-support-button")) {
    return;
  }

  await loadPublicConfig();

  if (!hasAnyWhatsAppChannel()) {
    return;
  }

  const anchor = document.createElement("a");
  anchor.id = "whatsapp-support-button";
  anchor.className = "whatsapp-support-button";
  anchor.href = "#";
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.setAttribute("aria-label", "Discuter avec Point Chaud sur WhatsApp");
  anchor.innerHTML = `
    <span class="whatsapp-support-icon" aria-hidden="true">
      <svg viewBox="0 0 32 32" role="img" focusable="false">
        <path fill="currentColor" d="M19.11 17.39c-.29-.15-1.71-.84-1.98-.93-.26-.1-.46-.15-.65.15-.19.29-.75.93-.92 1.12-.17.2-.34.22-.63.08-.29-.15-1.23-.45-2.35-1.45-.87-.78-1.46-1.75-1.63-2.04-.17-.29-.02-.45.13-.6.13-.13.29-.34.44-.51.15-.17.19-.29.29-.49.1-.2.05-.37-.02-.51-.08-.15-.65-1.57-.89-2.15-.24-.58-.48-.5-.65-.51h-.56c-.2 0-.51.07-.78.37-.27.29-1.02 1-1.02 2.44s1.05 2.84 1.19 3.04c.15.2 2.05 3.13 4.98 4.39.7.3 1.25.48 1.68.61.71.22 1.36.19 1.87.12.57-.08 1.71-.7 1.95-1.38.24-.68.24-1.27.17-1.39-.07-.12-.27-.2-.56-.34Z"/>
        <path fill="currentColor" d="M16.02 3.2c-7.05 0-12.77 5.71-12.77 12.75 0 2.25.59 4.45 1.71 6.38L3.2 28.8l6.63-1.73a12.8 12.8 0 0 0 6.18 1.58h.01c7.04 0 12.77-5.72 12.77-12.76 0-3.41-1.33-6.62-3.74-9.03A12.66 12.66 0 0 0 16.02 3.2Zm0 23.29h-.01a10.6 10.6 0 0 1-5.4-1.48l-.39-.23-3.93 1.03 1.05-3.83-.25-.4a10.56 10.56 0 0 1-1.63-5.66c0-5.83 4.74-10.57 10.58-10.57 2.82 0 5.46 1.09 7.46 3.1a10.5 10.5 0 0 1 3.1 7.47c0 5.84-4.75 10.57-10.58 10.57Z"/>
      </svg>
    </span>
    <span class="whatsapp-support-copy">
      <strong>WhatsApp</strong>
      <small>Discuter avec Point Chaud</small>
    </span>
  `;

  anchor.addEventListener("click", openWhatsAppBranchModal);
  document.body.appendChild(anchor);
}

async function injectIndexSocialLinks() {
  const container = document.getElementById("index-social-links");
  if (!container) return;

  await loadPublicConfig();

  const links = [
    {
      key: "instagramUrl",
      label: "Instagram",
      icon: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="5" ry="5" fill="none" stroke="currentColor" stroke-width="1.9"></rect>
          <circle cx="12" cy="12" r="4.1" fill="none" stroke="currentColor" stroke-width="1.9"></circle>
          <circle cx="17.3" cy="6.7" r="1.1" fill="currentColor"></circle>
        </svg>
      `
    },
    {
      key: "tiktokUrl",
      label: "TikTok",
      icon: `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M14.5 3c.3 1.7 1.3 3.1 2.8 4 .9.5 1.9.8 2.9.8v3.2c-1.4 0-2.8-.3-4-.9v5.8c0 3.1-2.5 5.6-5.6 5.6S5 19 5 15.9s2.5-5.6 5.6-5.6c.3 0 .7 0 1 .1v3.3c-.3-.1-.6-.2-1-.2-1.3 0-2.3 1-2.3 2.3s1 2.3 2.3 2.3 2.3-1 2.3-2.3V3h1.9Z"></path>
        </svg>
      `
    }
  ].filter(link => SUPPORT_CONFIG[link.key]);

  if (!links.length) {
    container.hidden = true;
    return;
  }

  container.hidden = false;
  container.innerHTML = links
    .map(
      link => `
        <a class="social-link" href="${SUPPORT_CONFIG[link.key]}" target="_blank" rel="noopener noreferrer" aria-label="${link.label}">
          <span class="social-link-icon">${link.icon}</span>
          <span>${link.label}</span>
        </a>
      `
    )
    .join("");
}

function getMarketingPromoImage(event, fallbackImage) {
  if (event?.image) return resolveMarketingImagePath(event.image, fallbackImage);
  if (event?.product) return resolveProductImage(event.product);
  return fallbackImage;
}

function setElementVisibility(element, visible, displayValue = "") {
  if (!element) return;
  element.hidden = !visible;
  element.style.display = visible ? displayValue : "none";
}

async function renderHomepagePromotions() {
  const section = document.getElementById("promotions");
  const currentCard = document.getElementById("home-current-promo-card");
  const upcomingCard = document.getElementById("home-upcoming-promo-card");
  const currentTitle = document.getElementById("home-current-promo-title");
  const upcomingTitle = document.getElementById("home-upcoming-promo-title");
  if (!currentTitle || !upcomingTitle || !currentCard || !upcomingCard || !section) return;

  try {
    const data = await apiRequest("/products/marketing");
    const currentEvent = data?.currentEvent || null;
    const upcomingEvent = Array.isArray(data?.upcomingEvents)
      ? data.upcomingEvents.find(event => event.is_active) || data.upcomingEvents[0] || null
      : null;
    const hasVisiblePromotion = Boolean(currentEvent || upcomingEvent);

    setElementVisibility(section, hasVisiblePromotion);

    if (currentEvent) {
      setElementVisibility(currentCard, true);
      const currentImage = document.getElementById("home-current-promo-image");
      document.getElementById("home-current-promo-badge").textContent = "Evenement du moment";
      currentTitle.textContent = currentEvent.title || currentEvent.product?.name || "Promotion";
      document.getElementById("home-current-promo-period").textContent = currentEvent.period_label || "En ce moment";
      document.getElementById("home-current-promo-price").textContent =
        currentEvent.price_label || (currentEvent.product ? formatMoney(currentEvent.product.price) : "15$");
      document.getElementById("home-current-promo-description").textContent =
        currentEvent.description || "Retrouve l'offre du moment chez Point Chaud.";
      if (currentImage) {
        currentImage.src = getMarketingPromoImage(currentEvent, "../assets/images/home/burger-week-promo.png");
        currentImage.alt = currentEvent.title || currentEvent.product?.name || "Promotion Point Chaud";
      }
    } else {
      setElementVisibility(currentCard, false);
    }

    if (upcomingEvent) {
      setElementVisibility(upcomingCard, true);
      const upcomingImage = document.getElementById("home-upcoming-promo-image");
      document.getElementById("home-upcoming-promo-badge").textContent = "A venir";
      upcomingTitle.textContent = upcomingEvent.title || upcomingEvent.product?.name || "A venir";
      document.getElementById("home-upcoming-promo-period").textContent = upcomingEvent.period_label || "Bientot";
      document.getElementById("home-upcoming-promo-price").textContent =
        upcomingEvent.price_label || (upcomingEvent.product ? formatMoney(upcomingEvent.product.price) : "15$");
      document.getElementById("home-upcoming-promo-description").textContent =
        upcomingEvent.description || "La prochaine offre sera bientot disponible.";
      if (upcomingImage) {
        upcomingImage.src = getMarketingPromoImage(upcomingEvent, "../assets/images/home/wing-things-promo.png");
        upcomingImage.alt = upcomingEvent.title || upcomingEvent.product?.name || "Prochaine promotion Point Chaud";
      }
    } else {
      setElementVisibility(upcomingCard, false);
    }
  } catch (error) {
    setElementVisibility(section, false);
    setElementVisibility(currentCard, false);
    setElementVisibility(upcomingCard, false);
    console.warn("Promotions accueil indisponibles", error);
  }
}

async function renderHomepageFeaturedProducts() {
  const container = document.getElementById("home-featured-products-grid");
  if (!container) return;

  try {
    const catalog = await apiRequest("/products");
    const products = Array.isArray(catalog?.products) ? catalog.products : [];
    const preferredOrder = [
      "Burger classique",
      "Pate poulet",
      "Pizza fromage",
      "Jus orange",
      "Pain chaud",
      "Poulet frit",
      "Riz + poulet"
    ];

    const rankedProducts = preferredOrder
      .map(name => products.find(product => String(product.name || "").trim().toLowerCase() === name.toLowerCase()))
      .filter(Boolean);

    const fallbackProducts = products.filter(product => !rankedProducts.some(item => Number(item.id) === Number(product.id)));
    const featuredProducts = [...rankedProducts, ...fallbackProducts].slice(0, 5);

    container.innerHTML = featuredProducts
      .map(product => {
        const tagLabel = String(product.category_name || "Vedette");
        const safeName = String(product.name || "").replace(/"/g, "&quot;");
        const safeDescription = String(product.description || "Produit du moment Point Chaud.");

        return `
          <article class="home-product-showcase-card">
            <div class="home-product-visual">
              <img
                src="${resolveProductImage(product)}"
                alt="${safeName}"
                loading="lazy"
                onerror="handleProductImageError(this, '${String(product.name || "").replace(/'/g, "\\'")}', '')" />
            </div>
            <div class="home-product-copy">
              <span class="home-product-tag">${tagLabel}</span>
              <h3>${product.name}</h3>
              <p>${safeDescription}</p>
              <div class="home-product-meta">
                <strong>${formatMoney(product.price)}</strong>
              </div>
            </div>
          </article>
        `;
      })
      .join("");
  } catch (error) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>Produits vedettes indisponibles</h3>
        <p>Le catalogue sera recharge automatiquement des que les donnees seront disponibles.</p>
      </div>
    `;
  }
}

function setupLandingMenuToggle() {
  const toggle = document.getElementById("landing-menu-toggle");
  const nav = document.getElementById("landing-nav");
  if (!toggle || !nav) return;

  const closeMenu = () => {
    nav.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
  };

  toggle.addEventListener("click", () => {
    const nextState = !nav.classList.contains("open");
    nav.classList.toggle("open", nextState);
    toggle.setAttribute("aria-expanded", nextState ? "true" : "false");
  });

  nav.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", closeMenu);
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 640) {
      closeMenu();
    }
  });
}

window.API_BASE_URL = API_BASE_URL;

document.addEventListener("DOMContentLoaded", () => {
  applyTheme(readStoredTheme());
  injectThemeToggle();
  injectWhatsAppSupportButton();
  injectIndexSocialLinks();
  renderHomepagePromotions();
  renderHomepageFeaturedProducts();
  setupLandingMenuToggle();
});
