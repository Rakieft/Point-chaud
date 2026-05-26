function renderProofMaintenance(stats) {
  const panel = document.getElementById("proof-maintenance-panel");
  const grid = document.getElementById("proof-maintenance-grid");
  const button = document.getElementById("run-proof-cleanup-btn");

  if (!panel || !grid || !button) return;

  panel.style.display = "";

  const lastRun = stats.scheduler?.lastRunAt
    ? formatTimestamp(stats.scheduler.lastRunAt)
    : "Aucun nettoyage encore lance";
  const nextRun = stats.scheduler?.nextRunAt ? formatTimestamp(stats.scheduler.nextRunAt) : "A programmer";
  const lastResult = stats.scheduler?.lastResult;

  grid.innerHTML = `
    <article class="admin-product-chip">
      <strong>Commandes actives</strong>
      <span>${stats.activeOrders}</span>
      <small>Jamais supprimees automatiquement.</small>
    </article>
    <article class="admin-product-chip">
      <strong>Commandes eligibles</strong>
      <span>${stats.eligibleOrderCleanup}</span>
      <small>Commandes terminees ou refusees de plus de ${stats.retentionDays} jours.</small>
    </article>
    <article class="admin-product-chip">
      <strong>Preuves eligibles</strong>
      <span>${stats.eligibleProofCleanup}</span>
      <small>Fichiers de paiement qui seront supprimes avec leurs commandes.</small>
    </article>
    <article class="admin-product-chip">
      <strong>Planification auto</strong>
      <span>Toutes les ${stats.intervalHours} h</span>
      <small>Prochaine verification: ${nextRun}</small>
    </article>
    <article class="admin-product-chip">
      <strong>Fichiers presents</strong>
      <span>${stats.filesOnDisk}</span>
      <small>Dossier surveille: ${stats.uploadPath}</small>
    </article>
  `;

  if (lastResult?.error) {
    showMessage("proof-maintenance-message", "error", `Dernier nettoyage: ${lastRun}. Erreur: ${lastResult.error}`);
  } else if (stats.scheduler?.lastRunAt) {
    showMessage(
      "proof-maintenance-message",
      "success",
      `Dernier nettoyage: ${lastRun}. ${lastResult?.deletedOrders || 0} commande(s), ${lastResult?.deletedNotifications || 0} notification(s) et ${lastResult?.filesDeleted || 0} preuve(s) supprimee(s).`
    );
  }

  button.disabled = !!stats.scheduler?.running;
  button.textContent = stats.scheduler?.running
    ? "Nettoyage en cours..."
    : "Nettoyer les commandes archivees maintenant";
}

function getPreviousAuditMonthValue() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Port-au-Prince",
    year: "numeric",
    month: "2-digit"
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map(part => [part.type, part.value]));
  let year = Number(parts.year);
  let month = Number(parts.month) - 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  return `${year}-${String(month).padStart(2, "0")}`;
}

function readSelectedAuditPeriod() {
  const input = document.getElementById("monthly-audit-month");
  const rawValue = input?.value || getPreviousAuditMonthValue();
  const [year, month] = rawValue.split("-").map(Number);
  return { year, month, rawValue };
}

function clearMonthlyAuditMessage() {
  const element = document.getElementById("monthly-audit-message");
  if (!element) return;
  element.className = "message-box";
  element.textContent = "";
}

function renderAuditLocationProductLine(product, index) {
  return `
    <div class="admin-report-line admin-report-line-best admin-report-line-nested">
      <div class="admin-report-rank">#${index + 1}</div>
      <div class="admin-report-line-main">
        <strong>${product.product_name}</strong>
        <small>${product.quantity_sold} vente${Number(product.quantity_sold) > 1 ? "s" : ""}</small>
      </div>
      <div class="admin-report-line-meta">
        <span class="badge">${formatMoney(product.revenue)}</span>
      </div>
    </div>
  `;
}

function renderMonthlyAuditReport(payload, snapshot) {
  const summaryContainer = document.getElementById("monthly-audit-summary-grid");
  const metaContainer = document.getElementById("monthly-audit-meta");
  const listsContainer = document.getElementById("monthly-audit-lists");
  if (!summaryContainer || !metaContainer || !listsContainer || !payload) return;
  summaryContainer.innerHTML = "";

  metaContainer.innerHTML = `
    <article class="admin-report-stable-card">
      <strong>Periode analysee</strong>
      <p>${payload.period.label}</p>
      <small>Scope: ${payload.generated_for}</small>
      <small>${snapshot?.generated_at ? `Derniere generation: ${formatTimestamp(snapshot.generated_at)}` : "Rapport calcule en direct, pas encore archive."}</small>
    </article>
  `;

  listsContainer.innerHTML = "";
}

async function loadMonthlyAuditReport() {
  try {
    const { year, month } = readSelectedAuditPeriod();
    clearMonthlyAuditMessage();
    const data = await apiRequest(`/users/monthly-audit?year=${year}&month=${month}`);
    renderMonthlyAuditReport(data.report, data.snapshot);
  } catch (error) {
    showMessage("monthly-audit-message", "error", error.message);
  }
}

async function generateMonthlyAuditReport() {
  const button = document.getElementById("generate-monthly-audit-btn");
  try {
    if (button) button.disabled = true;
    const { year, month } = readSelectedAuditPeriod();
    const data = await apiRequest("/users/monthly-audit/generate", {
      method: "POST",
      body: JSON.stringify({ year, month })
    });
    showMessage("monthly-audit-message", "success", data.message);
    renderMonthlyAuditReport(data.report, data.snapshot);
  } catch (error) {
    showMessage("monthly-audit-message", "error", error.message);
  } finally {
    if (button) button.disabled = false;
  }
}

async function downloadMonthlyAuditPdf() {
  const button = document.getElementById("download-monthly-audit-pdf-btn");
  try {
    if (button) button.disabled = true;
    const { year, month } = readSelectedAuditPeriod();
    const response = await fetch(`${API_BASE_URL}/users/monthly-audit/export.pdf?year=${year}&month=${month}`, {
      headers: storage.token ? { Authorization: `Bearer ${storage.token}` } : {},
      cache: "no-store"
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || "Impossible de telecharger le rapport");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit-${year}-${String(month).padStart(2, "0")}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showMessage("monthly-audit-message", "success", "Le rapport PDF a bien ete telecharge.");
  } catch (error) {
    showMessage("monthly-audit-message", "error", error.message);
  } finally {
    if (button) button.disabled = false;
  }
}

function populateReportsLocationFilter(reports) {
  const select = document.getElementById("reports-location-filter");
  if (!select) return;

  const previousValue = select.value || "";
  select.innerHTML =
    `<option value="">Toutes les succursales</option>` +
    reports.map(report => `<option value="${report.location_name}">${report.location_name}</option>`).join("");
  select.value = reports.some(report => report.location_name === previousValue) ? previousValue : "";
}

function renderReportsSummary(reports) {
  const container = document.getElementById("reports-summary-grid");
  if (!container) return;

  const branchesWithSales = reports.filter(report => report.has_sales).length;
  const totalBestSellers = reports.reduce((sum, report) => sum + report.best_sellers.length, 0);
  const totalLowSellers = reports.reduce((sum, report) => sum + report.low_sellers.length, 0);
  const totalLowStock = reports.reduce((sum, report) => sum + report.low_stock.length, 0);

  container.innerHTML = [
    ["Succursales analysees", reports.length, "Rapports visibles a l'ecran"],
    ["Succursales actives", branchesWithSales, "Succursales avec au moins une vente"],
    ["Produits en tete", totalBestSellers, "Produits reellement vendus et en progression"],
    ["Produits a relancer", totalLowSellers, "Produits vendus mais encore peu performants"],
    ["Alertes stock", totalLowStock, "Produits proches de la rupture"]
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

function filterReports(reports) {
  const locationValue = document.getElementById("reports-location-filter")?.value || "";
  const focusValue = document.getElementById("reports-focus-filter")?.value || "";

  return reports
    .filter(report => !locationValue || report.location_name === locationValue)
    .map(report => ({
      ...report,
      best_sellers: focusValue && focusValue !== "best" ? report.best_sellers.slice(0, 3) : report.best_sellers,
      low_sellers: focusValue && focusValue !== "low" ? report.low_sellers.slice(0, 3) : report.low_sellers,
      low_stock: focusValue && focusValue !== "stock" ? report.low_stock.slice(0, 3) : report.low_stock
    }));
}

function getBranchHeadline(report) {
  const topProduct = report.best_sellers[0];
  if (topProduct) {
    return `${topProduct.product_name} domine actuellement les ventes de cette succursale.`;
  }
  if (report.low_stock.length) {
    return "Cette succursale merite une attention sur les niveaux de stock.";
  }
  return "Aucune vente n'a encore ete enregistree pour cette succursale.";
}

function renderReportLine(product, rank, tone = "neutral") {
  return `
    <div class="admin-report-line admin-report-line-${tone}">
      <div class="admin-report-rank">#${rank}</div>
      <div class="admin-report-line-main">
        <strong>${product.product_name}</strong>
        <small>${product.quantity_sold} vente${Number(product.quantity_sold) > 1 ? "s" : ""} enregistree${Number(product.quantity_sold) > 1 ? "s" : ""}</small>
      </div>
      <div class="admin-report-line-meta">
        <span class="product-stock-badge ${Number(product.stock || 0) <= 5 ? "low" : "ok"}">
          Stock: ${product.stock}
        </span>
      </div>
    </div>
  `;
}

async function runProofCleanupNow() {
  const button = document.getElementById("run-proof-cleanup-btn");

  try {
    if (button) button.disabled = true;
    showMessage("proof-maintenance-message", "success", "Nettoyage des commandes archivees en cours...");
    const data = await apiRequest("/users/proof-maintenance/run", { method: "POST" });
    showMessage("proof-maintenance-message", "success", data.message);
    await renderReportsPage();
  } catch (error) {
    showMessage("proof-maintenance-message", "error", error.message);
  } finally {
    if (button) button.disabled = false;
  }
}

async function renderReportsPage() {
  try {
    const user = await loadBackofficeUser();
    const data = await apiRequest("/users/reports");
    const container = document.getElementById("reports-grid");

    if (!container) return;

    if (user?.role === "admin") {
      const maintenance = await apiRequest("/users/proof-maintenance");
      renderProofMaintenance(maintenance);
    }

    populateReportsLocationFilter(data.reports);
    const visibleReports = filterReports(data.reports);
    renderReportsSummary(visibleReports);
    await loadMonthlyAuditReport();

    if (!visibleReports.length) {
      container.innerHTML = `<section class="admin-panel"><div class="empty-state"><p>Aucune donnee de vente disponible pour le moment.</p></div></section>`;
      return;
    }

    container.innerHTML = visibleReports
      .map(report => {
        const topProduct = report.best_sellers[0];
        const lowSeller = report.low_sellers[0];
        const lowStockCount = report.low_stock.length;

        return `
          <section class="admin-panel admin-report-branch-card">
            <div class="admin-section-head">
              <div>
                <p class="admin-eyebrow">${report.location_name}</p>
                <h2>Rapport de ventes</h2>
                <p class="muted">${getBranchHeadline(report)}</p>
              </div>
            </div>

            <div class="admin-report-branch-summary">
              <article class="admin-product-chip">
                <strong>Produit leader</strong>
                <span>${topProduct ? topProduct.product_name : "Aucun"}</span>
                <small>${topProduct ? `${topProduct.quantity_sold} vente${Number(topProduct.quantity_sold) > 1 ? "s" : ""}` : "Pas encore de ventes"}</small>
              </article>
              <article class="admin-product-chip">
                <strong>Produit a pousser</strong>
                <span>${lowSeller ? lowSeller.product_name : "Aucun"}</span>
                <small>${lowSeller ? `${lowSeller.quantity_sold} vente${Number(lowSeller.quantity_sold) > 1 ? "s" : ""}` : "Pas de signal faible"}</small>
              </article>
              <article class="admin-product-chip">
                <strong>Alertes stock</strong>
                <span>${lowStockCount}</span>
                <small>${lowStockCount ? "Produits a reapprovisionner" : "Stock stable sur cette succursale"}</small>
              </article>
            </div>

            <div class="admin-report-columns admin-report-columns-compact">
              <article class="admin-report-list">
                <h3>Top 3 meilleures ventes</h3>
                ${
                  report.best_sellers.length
                    ? report.best_sellers
                        .slice(0, 3)
                        .map((product, index) => renderReportLine(product, index + 1, "best"))
                        .join("")
                    : `<div class="empty-state"><p>Aucune meilleure vente a afficher pour le moment.</p></div>`
                }
              </article>

              <article class="admin-report-list">
                <h3>Top 3 produits a relancer</h3>
                ${
                  report.low_sellers.length
                    ? report.low_sellers
                        .slice(0, 3)
                        .map((product, index) => renderReportLine(product, index + 1, "low"))
                        .join("")
                    : `<div class="empty-state"><p>Aucun produit a relancer tant qu'aucune vente n'est enregistree.</p></div>`
                }
              </article>

              <article class="admin-report-list">
                <h3>Etat du stock</h3>
                ${
                  report.low_stock.length
                    ? report.low_stock
                        .slice(0, 3)
                        .map(
                          product => `
                            <div class="admin-report-line admin-report-line-stock">
                              <div class="admin-report-rank">!</div>
                              <div class="admin-report-line-main">
                                <strong>${product.product_name}</strong>
                                <small>Produit a surveiller</small>
                              </div>
                              <div class="admin-report-line-meta">
                                <span class="product-stock-badge low">Stock: ${product.stock}</span>
                                <span class="badge">${product.quantity_sold} vente${Number(product.quantity_sold) > 1 ? "s" : ""}</span>
                              </div>
                            </div>
                          `
                        )
                        .join("")
                    : `
                      <div class="admin-report-stable-card">
                        <strong>Stock stable</strong>
                        <p>Aucune alerte critique pour cette succursale.</p>
                      </div>
                    `
                }
              </article>
            </div>

            <details class="admin-report-details">
              <summary>
                <span class="report-summary-label report-summary-label-closed">Ouvrir l'analyse detaillee</span>
                <span class="report-summary-label report-summary-label-open">Fermer l'analyse detaillee</span>
              </summary>
              <div class="admin-report-columns">
                <article class="admin-report-list">
                  <h3>Meilleures ventes</h3>
                  ${
                    report.best_sellers.length
                      ? report.best_sellers
                          .map((product, index) => renderReportLine(product, index + 1, "best"))
                          .join("")
                      : `<div class="empty-state"><p>Aucune meilleure vente enregistree.</p></div>`
                  }
                </article>

                <article class="admin-report-list">
                  <h3>Moins vendus</h3>
                  ${
                    report.low_sellers.length
                      ? report.low_sellers
                          .map((product, index) => renderReportLine(product, index + 1, "low"))
                          .join("")
                      : `<div class="empty-state"><p>Aucun produit a relancer pour l'instant.</p></div>`
                  }
                </article>

                <article class="admin-report-list">
                  <h3>Stock faible</h3>
                  ${
                    report.low_stock.length
                      ? report.low_stock
                          .map(
                            (product, index) => `
                              <div class="admin-report-line admin-report-line-stock">
                                <div class="admin-report-rank">#${index + 1}</div>
                                <div class="admin-report-line-main">
                                  <strong>${product.product_name}</strong>
                                  <small>Produit en tension</small>
                                </div>
                                <div class="admin-report-line-meta">
                                  <span class="product-stock-badge low">Stock: ${product.stock}</span>
                                  <span class="badge">${product.quantity_sold} vente${Number(product.quantity_sold) > 1 ? "s" : ""}</span>
                                </div>
                              </div>
                            `
                          )
                          .join("")
                      : `<div class="empty-state"><p>Aucun stock critique pour cette succursale.</p></div>`
                  }
                </article>
              </div>
            </details>
          </section>
        `;
      })
      .join("");
  } catch (error) {
    showMessage("reports-message", "error", error.message);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const monthInput = document.getElementById("monthly-audit-month");
  if (monthInput && !monthInput.value) {
    monthInput.value = getPreviousAuditMonthValue();
  }

  document.getElementById("run-proof-cleanup-btn")?.addEventListener("click", runProofCleanupNow);
  document.getElementById("reports-location-filter")?.addEventListener("change", renderReportsPage);
  document.getElementById("reports-focus-filter")?.addEventListener("change", renderReportsPage);
  document.getElementById("monthly-audit-month")?.addEventListener("change", loadMonthlyAuditReport);
  document.getElementById("generate-monthly-audit-btn")?.addEventListener("click", generateMonthlyAuditReport);
  document.getElementById("download-monthly-audit-pdf-btn")?.addEventListener("click", downloadMonthlyAuditPdf);
  renderReportsPage();
  startLiveRefresh("reports-page", renderReportsPage, 20000);
});
