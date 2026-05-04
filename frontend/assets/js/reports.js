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
      <strong>Preuves referencees</strong>
      <span>${stats.proofsReferenced}</span>
      <small>Enregistrements lies a des commandes en base.</small>
    </article>
    <article class="admin-product-chip">
      <strong>Eligibles au nettoyage</strong>
      <span>${stats.eligibleCleanup}</span>
      <small>Preuves plus anciennes que ${stats.retentionDays} jours.</small>
    </article>
    <article class="admin-product-chip">
      <strong>Fichiers presents</strong>
      <span>${stats.filesOnDisk}</span>
      <small>Dossier surveille: ${stats.uploadPath}</small>
    </article>
    <article class="admin-product-chip">
      <strong>Planification auto</strong>
      <span>Toutes les ${stats.intervalHours} h</span>
      <small>Prochaine verification: ${nextRun}</small>
    </article>
  `;

  if (lastResult?.error) {
    showMessage("proof-maintenance-message", "error", `Dernier nettoyage: ${lastRun}. Erreur: ${lastResult.error}`);
  } else if (stats.scheduler?.lastRunAt) {
    showMessage(
      "proof-maintenance-message",
      "success",
      `Dernier nettoyage: ${lastRun}. ${lastResult?.cleanedOrders || 0} preuve(s) nettoyee(s).`
    );
  }

  button.disabled = !!stats.scheduler?.running;
  button.textContent = stats.scheduler?.running
    ? "Nettoyage en cours..."
    : "Nettoyer les preuves anciennes maintenant";
}

async function runProofCleanupNow() {
  const button = document.getElementById("run-proof-cleanup-btn");

  try {
    if (button) button.disabled = true;
    showMessage("proof-maintenance-message", "success", "Nettoyage des preuves en cours...");
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

    if (!data.reports.length) {
      container.innerHTML = `<section class="admin-panel"><div class="empty-state"><p>Aucune donnee de vente disponible pour le moment.</p></div></section>`;
      return;
    }

    container.innerHTML = data.reports
      .map(
        report => `
          <section class="admin-panel">
            <div class="admin-section-head">
              <div>
                <p class="admin-eyebrow">${report.location_name}</p>
                <h2>Rapport de ventes</h2>
              </div>
            </div>

            <div class="admin-report-columns">
              <article class="admin-report-list">
                <h3>Meilleures ventes</h3>
                ${
                  report.best_sellers.length
                    ? report.best_sellers
                  .map(
                    product => `
                      <div class="line-item">
                        <strong>${product.product_name}</strong>
                        <span>${product.quantity_sold} ventes</span>
                        <small>Stock actuel: ${product.stock}</small>
                      </div>
                    `
                  )
                  .join("")
                    : `<div class="empty-state"><p>Aucune vente enregistree.</p></div>`
                }
              </article>

              <article class="admin-report-list">
                <h3>Moins vendus</h3>
                ${
                  report.low_sellers.length
                    ? report.low_sellers
                  .map(
                    product => `
                      <div class="line-item">
                        <strong>${product.product_name}</strong>
                        <span>${product.quantity_sold} ventes</span>
                        <small>Stock actuel: ${product.stock}</small>
                      </div>
                    `
                  )
                  .join("")
                    : `<div class="empty-state"><p>Aucune vente enregistree.</p></div>`
                }
              </article>

              <article class="admin-report-list">
                <h3>Stock faible</h3>
                ${
                  report.low_stock.length
                    ? report.low_stock
                        .map(
                          product => `
                            <div class="line-item">
                              <strong>${product.product_name}</strong>
                              <span>${product.stock} en stock</span>
                              <small>${product.quantity_sold} ventes</small>
                            </div>
                          `
                        )
                        .join("")
                    : `<div class="empty-state"><p>Aucun stock critique pour cette succursale.</p></div>`
                }
              </article>
            </div>
          </section>
        `
      )
      .join("");
  } catch (error) {
    showMessage("reports-message", "error", error.message);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("run-proof-cleanup-btn")?.addEventListener("click", runProofCleanupNow);
  renderReportsPage();
  startLiveRefresh("reports-page", renderReportsPage, 20000);
});
