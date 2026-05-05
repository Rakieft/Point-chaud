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

window.API_BASE_URL = API_BASE_URL;
