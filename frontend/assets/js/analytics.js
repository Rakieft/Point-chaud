const analyticsPalette = ["#ef6a2e", "#c7361f", "#ffb14a"];

function analyticsMoney(value) {
  return formatMoney(value).replace("HTG", "HTG");
}

function renderAnalyticsDonut(data) {
  const donut = document.getElementById("analytics-donut");
  const totalRevenue = document.getElementById("analytics-total-revenue");
  const legend = document.getElementById("analytics-legend");
  if (!donut || !totalRevenue || !legend) return;

  const segments = data.revenue.by_location;
  const gradient = [];
  let current = 0;

  segments.forEach((segment, index) => {
    const percent = Number(segment.percentage || 0);
    const next = current + percent;
    gradient.push(`${analyticsPalette[index]} ${current}% ${next}%`);
    current = next;
  });

  if (!gradient.length) {
    gradient.push("#f4dfd2 0% 100%");
  }

  donut.style.setProperty("--analytics-donut-gradient", `conic-gradient(${gradient.join(", ")})`);
  totalRevenue.textContent = analyticsMoney(data.revenue.total || 0);

  legend.innerHTML = segments
    .map(
      (segment, index) => `
        <article class="analytics-legend-item">
          <div class="analytics-legend-row">
            <span class="analytics-dot" style="background:${analyticsPalette[index]}"></span>
            <strong>${segment.location_name}</strong>
          </div>
          <div class="analytics-legend-metrics">
            <span>${analyticsMoney(segment.revenue)}</span>
            <small>${segment.confirmed_orders} commandes confirmees</small>
            <small>${segment.percentage.toFixed(1)}% du revenu</small>
          </div>
        </article>
      `
    )
    .join("");
}

function renderAnalyticsSummary(data) {
  const container = document.getElementById("analytics-summary-cards");
  if (!container) return;

  const cards = [
    ["Commandes confirmees", data.orders.confirmed_orders_last_30_days, "sur 30 jours"],
    ["Panier moyen", analyticsMoney(data.revenue.average_basket), "par commande confirmee"],
    ["Top succursale", data.revenue.top_location?.location_name || "Aucune", analyticsMoney(data.revenue.top_location?.revenue || 0)]
  ];

  container.innerHTML = cards
    .map(
      ([label, value, text]) => `
        <article class="analytics-summary-card">
          <small>${label}</small>
          <strong>${value}</strong>
          <span>${text}</span>
        </article>
      `
    )
    .join("");
}

function renderAnalyticsUsers(data) {
  const container = document.getElementById("analytics-user-stats");
  if (!container) return;

  const cards = [
    ["Comptes créés", data.users.total_users],
    ["Clients", data.users.total_clients],
    ["Staff", data.users.total_staff],
    ["Nouveaux sur 30 jours", data.users.new_users_last_30_days]
  ];

  container.innerHTML = cards
    .map(
      ([label, value], index) => `
        <article class="admin-stat-card admin-stat-${["orange", "red", "gold", "white"][index]} analytics-reveal-card">
          <small>${label}</small>
          <h2>${value}</h2>
        </article>
      `
    )
    .join("");
}

function renderAnalyticsLocations(data) {
  const container = document.getElementById("analytics-location-cards");
  if (!container) return;

  container.innerHTML = data.revenue.by_location
    .map(
      (segment, index) => `
        <article class="analytics-location-card" style="--analytics-accent:${analyticsPalette[index]}">
          <div class="analytics-location-top">
            <div>
              <small>Succursale</small>
              <h3>${segment.location_name}</h3>
            </div>
            <span class="analytics-pill">${segment.percentage.toFixed(1)}%</span>
          </div>
          <strong>${analyticsMoney(segment.revenue)}</strong>
          <p>${segment.confirmed_orders} commande(s) confirmee(s) sur la fenêtre active.</p>
        </article>
      `
    )
    .join("");
}

function renderAnalyticsInsights(data) {
  const container = document.getElementById("analytics-insights");
  if (!container) return;

  const top = data.revenue.top_location;
  const lowest =
    [...data.revenue.by_location].sort((a, b) => Number(a.revenue) - Number(b.revenue))[0] || null;

  const items = [
    {
      title: "Fenêtre active",
      text: `Les revenus sont calculés sur les ${data.rolling_days} derniers jours, avec renouvellement automatique.`
    },
    {
      title: "Succursale leader",
      text: top ? `${top.location_name} mène actuellement avec ${analyticsMoney(top.revenue)}.` : "Aucune vente confirmée pour le moment."
    },
    {
      title: "Succursale à renforcer",
      text: lowest ? `${lowest.location_name} est actuellement la moins performante avec ${analyticsMoney(lowest.revenue)}.` : "Pas encore de point bas identifié."
    },
    {
      title: "Acquisition clients",
      text: `${data.users.new_users_last_30_days} nouveau(x) compte(s) ont été créés sur la période active.`
    }
  ];

  container.innerHTML = items
    .map(
      item => `
        <article class="admin-link-card analytics-insight-card">
          <strong>${item.title}</strong>
          <p>${item.text}</p>
        </article>
      `
    )
    .join("");
}

async function renderAnalyticsPage() {
  if (!document.body.classList.contains("analytics-body")) return;

  try {
    const user = await loadBackofficeUser();
    if (!user) return;
    if (user.role !== "admin") {
      window.location.href = "./dashboard-admin.html";
      return;
    }

    const data = await apiRequest("/users/analytics");
    const title = document.getElementById("analytics-window-title");
    const copy = document.getElementById("analytics-window-copy");
    const refresh = document.getElementById("analytics-refresh-note");

    if (title) {
      title.textContent = `Analyse consolidée du réseau sur ${data.rolling_days} jours`;
    }
    if (copy) {
      copy.textContent =
        "Le cercle central répartit les revenus confirmés entre Route Frères, Pétion-Ville et Delmas. La lecture se met à jour automatiquement au fil des 30 derniers jours.";
    }
    if (refresh) {
      refresh.textContent = `Mise à jour: ${formatTimestamp(data.generated_at)}`;
    }

    renderAnalyticsSummary(data);
    renderAnalyticsDonut(data);
    renderAnalyticsUsers(data);
    renderAnalyticsLocations(data);
    renderAnalyticsInsights(data);
  } catch (error) {
    showMessage("analytics-message", "error", error.message);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  renderAnalyticsPage();
  startLiveRefresh("analytics-page", renderAnalyticsPage, 20000);
});
