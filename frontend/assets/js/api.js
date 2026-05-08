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
    "Bonjour Point Chaud, je veux plus d'informations."
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
    window.location.href = "../pages/login.html";
    return null;
  }

  if (roles.length && !roles.includes(user.role)) {
    const nextPage =
      user.role === "client"
        ? "../pages/dashboard-client.html"
        : user.role === "driver"
          ? "../pages/dashboard-driver.html"
          : "../pages/dashboard-admin.html";
    window.location.href = nextPage;
    return null;
  }

  return user;
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
  const category = product?.category_name || "Point Chaud";
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
      <text x="44" y="92" fill="#fff4e8" font-family="Segoe UI, Arial, sans-serif" font-size="24" font-weight="700">${category}</text>
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
  window.location.href = "../pages/login.html";
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

function buildWhatsAppUrl() {
  const phone = String(SUPPORT_CONFIG.whatsappNumber || "").replace(/\D/g, "");
  const text = encodeURIComponent(SUPPORT_CONFIG.whatsappMessage || "Bonjour Point Chaud");
  return `https://wa.me/${phone}?text=${text}`;
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

  const cleanedPhone = String(SUPPORT_CONFIG.whatsappNumber || "").replace(/\D/g, "");
  if (!cleanedPhone) {
    return;
  }

  const anchor = document.createElement("a");
  anchor.id = "whatsapp-support-button";
  anchor.className = "whatsapp-support-button";
  anchor.href = buildWhatsAppUrl();
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

  document.body.appendChild(anchor);
}

window.API_BASE_URL = API_BASE_URL;

document.addEventListener("DOMContentLoaded", () => {
  applyTheme(readStoredTheme());
  injectThemeToggle();
  injectWhatsAppSupportButton();
});
