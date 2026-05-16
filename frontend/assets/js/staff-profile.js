let staffListCache = [];
let filteredStaffCache = [];

async function renderStaffProfilePage() {
  try {
    const user = await loadBackofficeUser();
    if (!user) return;

    fillProfileForm(user);

    if (user.role === "admin") {
      document.getElementById("admin-only-staff-section").style.display = "";
      const [staff, catalog] = await Promise.all([apiRequest("/users/staff"), apiRequest("/products")]);
      staffListCache = staff;
      renderStaffSummary(staff);
      renderLocationOptions(catalog.locations);
      applyStaffFilters();
    }
  } catch (error) {
    showMessage("profile-message", "error", error.message);
  }
}

function fillProfileForm(user) {
  const form = document.getElementById("profile-form");
  if (!form) return;
  form.name.value = user.name || "";
  form.phone.value = user.phone || "";
  form.title.value = user.title || "";
  form.avatar_url.value = user.avatar_url || "";
  form.bio.value = user.bio || "";
}

function renderLocationOptions(locations) {
  const select = document.getElementById("staff-location-select");
  const filter = document.getElementById("staff-location-filter");
  if (!select) return;
  select.innerHTML =
    `<option value="">Aucune</option>` +
    locations.map(location => `<option value="${location.id}">${location.name}</option>`).join("");
  if (filter) {
    const previousValue = filter.value || "";
    filter.innerHTML =
      `<option value="">Toutes les succursales</option>` +
      locations.map(location => `<option value="${location.id}">${location.name}</option>`).join("");
    filter.value = locations.some(location => String(location.id) === previousValue) ? previousValue : "";
  }
}

function normalizeStaffValue(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function renderStaffSummary(staff) {
  const container = document.getElementById("staff-summary-grid");
  if (!container) return;

  const admins = staff.filter(member => member.role === "admin").length;
  const managers = staff.filter(member => member.role === "manager").length;
  const drivers = staff.filter(member => member.role === "driver").length;
  const inactive = staff.filter(member => !member.is_active).length;

  container.innerHTML = [
    ["Admins", admins, "Comptes supervision"],
    ["Managers", managers, "Responsables succursales"],
    ["Livreurs", drivers, "Equipe terrain"],
    ["Desactives", inactive, "Comptes inactifs"]
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

function applyStaffFilters() {
  const search = normalizeStaffValue(document.getElementById("staff-search-input")?.value || "");
  const role = document.getElementById("staff-role-filter")?.value || "";
  const location = document.getElementById("staff-location-filter")?.value || "";
  const status = document.getElementById("staff-status-filter")?.value || "";

  filteredStaffCache = staffListCache.filter(member => {
    const searchable = normalizeStaffValue(`${member.name || ""} ${member.email || ""} ${member.title || ""}`);
    const matchesSearch = !search || searchable.includes(search);
    const matchesRole = !role || member.role === role;
    const matchesLocation = !location || String(member.assigned_location_id || "") === String(location);
    const matchesStatus = !status || (status === "active" ? member.is_active : !member.is_active);
    return matchesSearch && matchesRole && matchesLocation && matchesStatus;
  });

  const results = document.getElementById("staff-results-count");
  if (results) {
    results.textContent =
      filteredStaffCache.length === staffListCache.length
        ? `${staffListCache.length} membre${staffListCache.length > 1 ? "s" : ""}`
        : `${filteredStaffCache.length} / ${staffListCache.length} membre${staffListCache.length > 1 ? "s" : ""}`;
  }

  renderStaffTable(filteredStaffCache);
}

function renderStaffTable(staff) {
  const tbody = document.getElementById("staff-table-body");
  if (!tbody) return;

  tbody.innerHTML = staff.length
    ? staff
        .map(
      member => `
        <tr class="admin-mobile-row">
          <td>
            <strong>${member.name}</strong>
            <div><small>${member.email}</small></div>
          </td>
          <td>
            <select onchange="updateStaffRole(${member.id}, this.value)">
              <option value="manager" ${member.role === "manager" ? "selected" : ""}>Manager</option>
              <option value="driver" ${member.role === "driver" ? "selected" : ""}>Livreur</option>
              <option value="admin" ${member.role === "admin" ? "selected" : ""}>Admin</option>
            </select>
          </td>
          <td>
            <select onchange="updateStaffLocation(${member.id}, this.value)">
              <option value="">Aucune</option>
              ${Array.from(document.getElementById("staff-location-select").options)
                .slice(1)
                .map(
                  option => `
                    <option value="${option.value}" ${String(member.assigned_location_id || "") === String(option.value) ? "selected" : ""}>
                      ${option.textContent}
                    </option>
                  `
                )
                .join("")}
            </select>
          </td>
          <td>${member.is_active ? "Actif" : "Desactive"}</td>
          <td>
            <div class="admin-action-group">
              <button class="btn-light" onclick="openStaffEdit(${member.id})">Modifier</button>
              <button class="admin-btn-danger" onclick="deactivateStaff(${member.id})">Desactiver</button>
            </div>
          </td>
        </tr>
      `
        )
        .join("")
    : `
      <tr>
        <td colspan="5" class="admin-table-empty">
          <div class="empty-state"><p>Aucun membre ne correspond aux filtres actuels.</p></div>
        </td>
      </tr>
    `;
}

async function updateStaffRole(staffId, role) {
  const member = staffListCache.find(item => item.id === staffId);
  if (!member) return;

  try {
    await apiRequest(`/users/staff/${staffId}`, {
      method: "PATCH",
      body: JSON.stringify({
        role,
        assigned_location_id: ["manager", "driver"].includes(role) ? member.assigned_location_id : null
      })
    });
    renderStaffProfilePage();
  } catch (error) {
    showMessage("staff-message", "error", error.message);
  }
}

async function updateStaffLocation(staffId, locationId) {
  try {
    await apiRequest(`/users/staff/${staffId}`, {
      method: "PATCH",
      body: JSON.stringify({ assigned_location_id: locationId || null })
    });
    renderStaffProfilePage();
  } catch (error) {
    showMessage("staff-message", "error", error.message);
  }
}

function openStaffEdit(staffId) {
  const member = staffListCache.find(item => item.id === staffId);
  const form = document.getElementById("staff-edit-form");
  const modal = document.getElementById("staff-edit-modal");
  const title = document.getElementById("staff-edit-title");

  if (!member || !form || !modal) return;

  form.staff_id.value = member.id;
  form.name.value = member.name || "";
  form.phone.value = member.phone || "";
  form.title.value = member.title || "";
  form.avatar_url.value = member.avatar_url || "";
  form.bio.value = member.bio || "";

  if (title) {
    title.textContent = `Modifier ${member.name}`;
  }

  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

async function deactivateStaff(staffId) {
  if (!confirm("Confirmer la desactivation de ce compte ?")) return;

  try {
    await apiRequest(`/users/staff/${staffId}`, { method: "DELETE" });
    renderStaffProfilePage();
  } catch (error) {
    showMessage("staff-message", "error", error.message);
  }
}

function closeStaffEdit() {
  const modal = document.getElementById("staff-edit-modal");
  const form = document.getElementById("staff-edit-form");

  if (form) {
    form.reset();
    form.staff_id.value = "";
  }

  if (!modal) return;
  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function bindProfileForm() {
  const form = document.getElementById("profile-form");
  if (!form) return;

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());

    try {
      const data = await apiRequest("/users/me", {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      storage.user = data.user;
      showMessage("profile-message", "success", data.message);
    } catch (error) {
      showMessage("profile-message", "error", error.message);
    }
  });
}

function bindStaffForm() {
  const form = document.getElementById("staff-form");
  if (!form) return;

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());

    try {
      const data = await apiRequest("/auth/staff", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      form.reset();
      showMessage("staff-message", "success", `${data.message}: ${data.user.email}`);
      renderStaffProfilePage();
    } catch (error) {
      showMessage("staff-message", "error", error.message);
    }
  });
}

function bindStaffEditForm() {
  const form = document.getElementById("staff-edit-form");
  if (!form) return;

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const payload = Object.fromEntries(new FormData(form).entries());
    const staffId = payload.staff_id;
    delete payload.staff_id;

    try {
      const data = await apiRequest(`/users/staff/${staffId}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      showMessage("staff-message", "success", data.message);
      closeStaffEdit();
      renderStaffProfilePage();
    } catch (error) {
      showMessage("staff-edit-message", "error", error.message);
    }
  });
}

function bindStaffFilters() {
  const search = document.getElementById("staff-search-input");
  const role = document.getElementById("staff-role-filter");
  const location = document.getElementById("staff-location-filter");
  const status = document.getElementById("staff-status-filter");
  const reset = document.getElementById("staff-reset-filters");

  const redraw = () => applyStaffFilters();

  search?.addEventListener("input", redraw);
  role?.addEventListener("change", redraw);
  location?.addEventListener("change", redraw);
  status?.addEventListener("change", redraw);
  reset?.addEventListener("click", () => {
    if (search) search.value = "";
    if (role) role.value = "";
    if (location) location.value = "";
    if (status) status.value = "";
    redraw();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindProfileForm();
  bindStaffForm();
  bindStaffEditForm();
  bindStaffFilters();
  renderStaffProfilePage();
  startLiveRefresh("staff-profile", renderStaffProfilePage, 20000);
});
