let adminProductsCatalog = null;

function showAdminProductsView() {
  const publicView = document.getElementById("public-products-view");
  const adminView = document.getElementById("admin-products-view");

  if (publicView) publicView.style.display = "none";
  if (adminView) adminView.style.display = "block";
}

function renderLocationStockInputs(locations, product = null) {
  const container = document.getElementById("product-location-stocks");
  if (!container) return;

  const stocksByLocation = new Map((product?.location_stocks || []).map(item => [Number(item.location_id), Number(item.stock || 0)]));

  container.innerHTML = locations
    .map(
      location => `
        <label>
          ${location.name}
          <input
            type="number"
            min="0"
            data-location-stock-input
            data-location-id="${location.id}"
            value="${stocksByLocation.has(Number(location.id)) ? stocksByLocation.get(Number(location.id)) : 0}" />
        </label>
      `
    )
    .join("");

  const totalInput = document.querySelector('#product-form input[name="stock"]');
  const syncTotal = () => {
    if (!totalInput) return;
    const total = [...container.querySelectorAll("[data-location-stock-input]")].reduce(
      (sum, input) => sum + Number(input.value || 0),
      0
    );
    totalInput.value = total;
  };

  container.querySelectorAll("[data-location-stock-input]").forEach(input => {
    input.addEventListener("input", syncTotal);
  });

  syncTotal();
}

function fillAdminCategoryOptions(categories) {
  const select = document.getElementById("admin-category-select");
  if (!select) return;

  select.innerHTML = categories
    .map(category => `<option value="${category.id}">${category.name}</option>`)
    .join("");
}

function resetProductForm() {
  const form = document.getElementById("product-form");
  const title = document.getElementById("product-form-title");
  if (!form) return;

  form.reset();
  form.product_id.value = "";
  renderLocationStockInputs(adminProductsCatalog?.locations || []);
  if (title) {
    title.textContent = "Nouveau produit";
  }
}

function renderAdminProductsTable(products) {
  const tbody = document.getElementById("admin-products-table-body");
  if (!tbody) return;

  const isAdmin = storage.user?.role === "admin";

  tbody.innerHTML = products
    .map(
      product => `
        <tr>
          <td>
            <strong>${product.name}</strong>
            <div><small>${product.description || "Sans description"}</small></div>
          </td>
          <td>${product.category_name || "Sans categorie"}</td>
          <td>${formatMoney(product.price)}</td>
          <td>${product.stock}</td>
          <td>${(product.location_stocks || []).map(item => `${item.location_name}: ${item.stock}`).join("<br>")}</td>
          <td>
            <div class="admin-action-group">
              ${
                isAdmin
                  ? `
                    <button class="btn-light" onclick="editProduct(${product.id})">Modifier</button>
                    <button class="admin-btn-danger" onclick="deleteProduct(${product.id})">Supprimer</button>
                  `
                  : `<span class="muted">Lecture seule</span>`
              }
            </div>
          </td>
        </tr>
      `
    )
    .join("");
}

async function renderAdminProductsPage() {
  const user = storage.user;
  if (!user || !["admin", "manager"].includes(user.role) || !document.getElementById("admin-products-view")) {
    return;
  }

  showAdminProductsView();
  const profile = await loadBackofficeUser();

  try {
    const catalog = await apiRequest("/products");
    adminProductsCatalog = catalog;
    fillAdminCategoryOptions(catalog.categories);
    renderLocationStockInputs(catalog.locations);
    renderAdminProductsTable(catalog.products);

    const createPanel = document.getElementById("admin-product-create-panel");
    const tableTitle = document.getElementById("products-table-title");

    if (createPanel) {
      createPanel.style.display = profile.role === "admin" ? "" : "none";
    }

    if (tableTitle) {
      tableTitle.textContent =
        profile.role === "admin" ? "Modifier ou supprimer les produits" : "Consulter les produits disponibles";
    }
  } catch (error) {
    showMessage("product-admin-message", "error", error.message);
  }
}

function editProduct(productId) {
  const product = adminProductsCatalog?.products.find(item => item.id === productId);
  const form = document.getElementById("product-form");
  const title = document.getElementById("product-form-title");

  if (!product || !form || storage.user?.role !== "admin") return;

  form.product_id.value = product.id;
  form.name.value = product.name || "";
  form.description.value = product.description || "";
  form.price.value = product.price || "";
  form.stock.value = product.stock || 0;
  form.image.value = product.image || "";
  form.category_id.value = product.category_id;
  renderLocationStockInputs(adminProductsCatalog?.locations || [], product);

  if (title) {
    title.textContent = `Modifier ${product.name}`;
  }
}

async function deleteProduct(productId) {
  if (storage.user?.role !== "admin") return;
  if (!confirm("Supprimer ce produit du catalogue ?")) return;

  try {
    const data = await apiRequest(`/products/${productId}`, {
      method: "DELETE"
    });
    showMessage("product-admin-message", "success", data.message);
    renderAdminProductsPage();
  } catch (error) {
    showMessage("product-admin-message", "error", error.message);
  }
}

function bindCategoryForm() {
  const form = document.getElementById("category-form");
  if (!form || storage.user?.role !== "admin") return;

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());

    try {
      const data = await apiRequest("/products/categories", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      form.reset();
      showMessage("product-admin-message", "success", data.message);
      renderAdminProductsPage();
    } catch (error) {
      showMessage("product-admin-message", "error", error.message);
    }
  });
}

function bindProductForm() {
  const form = document.getElementById("product-form");
  const cancelBtn = document.getElementById("product-form-cancel");
  if (!form || storage.user?.role !== "admin") return;

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.location_stocks = JSON.stringify(
      (adminProductsCatalog?.locations || []).map(location => ({
        location_id: Number(location.id),
        stock: Number(
          form.querySelector(`[data-location-stock-input][data-location-id="${location.id}"]`)?.value || 0
        )
      }))
    );
    const productId = payload.product_id;
    delete payload.product_id;

    try {
      if (productId) {
        const data = await apiRequest(`/products/${productId}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
        showMessage("product-admin-message", "success", data.message);
      } else {
        await apiRequest("/products", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        showMessage("product-admin-message", "success", "Produit ajoute avec succes");
      }

      resetProductForm();
      renderAdminProductsPage();
    } catch (error) {
      showMessage("product-admin-message", "error", error.message);
    }
  });

  cancelBtn?.addEventListener("click", resetProductForm);
}

document.addEventListener("DOMContentLoaded", async () => {
  await renderAdminProductsPage();
  bindCategoryForm();
  bindProductForm();
  startLiveRefresh("products-admin", renderAdminProductsPage, 20000);
});
