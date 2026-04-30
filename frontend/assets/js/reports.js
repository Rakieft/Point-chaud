async function renderReportsPage() {
  try {
    await loadBackofficeUser();
    const data = await apiRequest("/users/reports");
    const container = document.getElementById("reports-grid");

    if (!container) return;

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
  renderReportsPage();
  startLiveRefresh("reports-page", renderReportsPage, 20000);
});
