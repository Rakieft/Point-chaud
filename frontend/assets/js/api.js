const API_BASE_URL = "http://localhost:5000/api";

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
          ? "../pages/deliveries.html"
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
