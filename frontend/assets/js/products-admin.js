let adminProductsCatalog = null;

function getCategoryFormElements() {
  const form = document.getElementById("category-form");
  if (!form) return { form: null };

  return {
    form,
    categoryId: form.elements.namedItem("category_id"),
    name: form.elements.namedItem("name"),
    submit: document.getElementById("category-form-submit"),
    cancel: document.getElementById("category-form-cancel")
  };
}

function getProductFormElements() {
  const form = document.getElementById("product-form");
  if (!form) return { form: null };

  return {
    form,
    productId: form.elements.namedItem("product_id"),
    name: form.elements.namedItem("name"),
    description: form.elements.namedItem("description"),
    price: form.elements.namedItem("price"),
    stock: form.elements.namedItem("stock"),
    image: form.elements.namedItem("image"),
    categoryId: form.elements.namedItem("category_id")
  };
}

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

function renderAdminCategoriesList(categories) {
  const container = document.getElementById("admin-categories-list");
  if (!container) return;

  const isAdmin = storage.user?.role === "admin";
  container.innerHTML = categories.length
    ? categories
        .map(
          category => `
            <article class="admin-category-chip">
              <div class="stack-sm">
                <strong>${category.name}</strong>
                <small class="muted">ID categorie: ${category.id}</small>
              </div>
              ${
                isAdmin
                  ? `
                    <div class="admin-action-group">
                      <button class="btn-light" type="button" onclick="editCategory(${category.id})">Modifier</button>
                      <button class="admin-btn-danger" type="button" onclick="deleteCategory(${category.id})">Supprimer</button>
                    </div>
                  `
                  : ""
              }
            </article>
          `
        )
        .join("")
    : `<div class="empty-state"><p>Aucune categorie pour le moment.</p></div>`;
}

function resetCategoryForm() {
  const { form, categoryId, submit, cancel } = getCategoryFormElements();
  if (!form) return;

  form.reset();
  if (categoryId) categoryId.value = "";
  if (submit) submit.textContent = "Ajouter la categorie";
  if (cancel) cancel.style.display = "none";
}

function resetProductForm() {
  const { form, productId } = getProductFormElements();
  const title = document.getElementById("product-form-title");
  if (!form) return;

  form.reset();
  if (productId) {
    productId.value = "";
  }
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
        <tr class="admin-mobile-row">
          <td data-label="Produit">
            <strong>${product.name}</strong>
            <div><small>${product.description || "Sans description"}</small></div>
          </td>
          <td data-label="Categorie">${product.category_name || "Sans categorie"}</td>
          <td data-label="Prix">${formatMoney(product.price)}</td>
          <td data-label="Stock total">${product.stock}</td>
          <td data-label="Par succursale">${(product.location_stocks || []).map(item => `${item.location_name}: ${item.stock}`).join("<br>")}</td>
          <td data-label="Actions">
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
    renderAdminCategoriesList(catalog.categories);
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
  const product = adminProductsCatalog?.products.find(item => Number(item.id) === Number(productId));
  const { form, productId: productIdInput, name, description, price, stock, image, categoryId } =
    getProductFormElements();
  const title = document.getElementById("product-form-title");

  if (!product || !form || storage.user?.role !== "admin") return;

  if (productIdInput) productIdInput.value = product.id;
  if (name) name.value = product.name || "";
  if (description) description.value = product.description || "";
  if (price) price.value = product.price || "";
  if (stock) stock.value = product.stock || 0;
  if (image) image.value = product.image || "";
  if (categoryId) categoryId.value = product.category_id;
  renderLocationStockInputs(adminProductsCatalog?.locations || [], product);

  if (title) {
    title.textContent = `Modifier ${product.name}`;
  }

  form.scrollIntoView({ behavior: "smooth", block: "start" });
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
  const { form, cancel } = getCategoryFormElements();
  if (!form || form.dataset.bound === "true") return;

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (storage.user?.role !== "admin") return;
    const payload = Object.fromEntries(new FormData(form).entries());
    const currentCategoryId = payload.category_id;
    delete payload.category_id;

    try {
      const data = currentCategoryId
        ? await apiRequest(`/products/categories/${currentCategoryId}`, {
            method: "PATCH",
            body: JSON.stringify(payload)
          })
        : await apiRequest("/products/categories", {
            method: "POST",
            body: JSON.stringify(payload)
          });

      showMessage("product-admin-message", "success", data.message);
      await renderAdminProductsPage();
      resetCategoryForm();

      const { categoryId } = getProductFormElements();
      if (categoryId && data.category?.id) {
        categoryId.value = String(data.category.id);
      }
    } catch (error) {
      showMessage("product-admin-message", "error", error.message);
    }
  });

  cancel?.addEventListener("click", resetCategoryForm);
  if (cancel) cancel.style.display = "none";
  form.dataset.bound = "true";
}

function bindProductForm() {
  const { form, productId } = getProductFormElements();
  const cancelBtn = document.getElementById("product-form-cancel");
  if (!form || form.dataset.bound === "true") return;

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (storage.user?.role !== "admin") return;

    const payload = Object.fromEntries(new FormData(form).entries());
    payload.location_stocks = JSON.stringify(
      (adminProductsCatalog?.locations || []).map(location => ({
        location_id: Number(location.id),
        stock: Number(
          form.querySelector(`[data-location-stock-input][data-location-id="${location.id}"]`)?.value || 0
        )
      }))
    );
    const currentProductId = payload.product_id;
    delete payload.product_id;

    try {
      if (currentProductId) {
        const data = await apiRequest(`/products/${currentProductId}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
        showMessage("product-admin-message", "success", data.message);
      } else {
        const data = await apiRequest("/products", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        showMessage("product-admin-message", "success", data.message || "Produit ajoute avec succes");
      }

      resetProductForm();
      await renderAdminProductsPage();
    } catch (error) {
      showMessage("product-admin-message", "error", error.message);
    }
  });

  cancelBtn?.addEventListener("click", resetProductForm);
  form.dataset.bound = "true";
}

window.editProduct = editProduct;
window.deleteProduct = deleteProduct;

function editCategory(categoryId) {
  const category = adminProductsCatalog?.categories.find(item => Number(item.id) === Number(categoryId));
  const { form, categoryId: categoryIdInput, name, submit, cancel } = getCategoryFormElements();
  if (!category || !form || storage.user?.role !== "admin") return;

  if (categoryIdInput) categoryIdInput.value = category.id;
  if (name) name.value = category.name || "";
  if (submit) submit.textContent = `Modifier ${category.name}`;
  if (cancel) cancel.style.display = "";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteCategory(categoryId) {
  if (storage.user?.role !== "admin") return;
  if (!confirm("Supprimer cette categorie si elle est vide ?")) return;

  try {
    const data = await apiRequest(`/products/categories/${categoryId}`, {
      method: "DELETE"
    });
    showMessage("product-admin-message", "success", data.message);
    await renderAdminProductsPage();
    resetCategoryForm();
  } catch (error) {
    showMessage("product-admin-message", "error", error.message);
  }
}

window.editCategory = editCategory;
window.deleteCategory = deleteCategory;

document.addEventListener("DOMContentLoaded", async () => {
  await renderAdminProductsPage();
  bindCategoryForm();
  bindProductForm();
  startLiveRefresh("products-admin", renderAdminProductsPage, 20000);
});
