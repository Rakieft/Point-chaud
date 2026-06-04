let staffListCache = [];
let filteredStaffCache = [];
let clientCreditCache = [];
let filteredClientCreditCache = [];
let clientCreditSearchMode = "authorized";
let clientCreditPaymentsCache = [];

function getCreditClientInitials(name) {
  return String(name || "Client")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || "")
    .join("") || "CL";
}

async function renderStaffProfilePage() {
  try {
    const user = await loadBackofficeUser();
    if (!user) return;

    fillProfileForm(user);

    if (user.role === "admin") {
      document.getElementById("admin-only-staff-section").style.display = "";
      document.getElementById("admin-client-credit-section").style.display = "";
      const [staff, catalog, clients] = await Promise.all([
        apiRequest("/users/staff"),
        apiRequest("/products"),
        loadClientCreditProfiles({ authorizedOnly: clientCreditSearchMode !== "search" })
      ]);
      staffListCache = staff;
      clientCreditCache = clients;
      renderStaffSummary(staff);
      renderClientCreditSummary(clients);
      renderLocationOptions(catalog.locations);
      applyStaffFilters();
      applyClientCreditFilters();
    }
  } catch (error) {
    showMessage("profile-message", "error", error.message);
  }
}

async function loadClientCreditProfiles({ authorizedOnly = true, search = "" } = {}) {
  const params = new URLSearchParams();
  if (!authorizedOnly) {
    params.set("enabled_only", "false");
  }
  if (String(search || "").trim()) {
    params.set("search", String(search).trim());
  }

  const query = params.toString();
  return apiRequest(`/users/clients-credit${query ? `?${query}` : ""}`);
}

async function loadClientCreditPaymentHistory(clientId, limit = 20) {
  return apiRequest(`/users/clients-credit/${clientId}/payments?limit=${Number(limit) || 20}`);
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

function renderClientCreditSummary(clients) {
  const container = document.getElementById("client-credit-summary-grid");
  if (!container) return;

  const active = clients.filter(client => client.credit_enabled && client.credit_status === "active").length;
  const suspended = clients.filter(client => client.credit_enabled && client.credit_status === "suspended").length;
  const totalBalance = clients.reduce((sum, client) => sum + Number(client.current_credit_balance || 0), 0);
  const totalLimit = clients.reduce(
    (sum, client) => sum + (client.credit_enabled ? Number(client.credit_limit || 0) : 0),
    0
  );

  container.innerHTML = [
    ["Clients autorises", active, "Peuvent commander a credit"],
    ["Credits suspendus", suspended, "Demandent une verification"],
    ["Solde ouvert", formatMoney(totalBalance), "Dette client actuellement ouverte"],
    ["Limites cumulees", formatMoney(totalLimit), "Plafonds accordes en total"]
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

function applyClientCreditFilters() {
  const search = normalizeStaffValue(document.getElementById("client-credit-search-input")?.value || "");
  const status = document.getElementById("client-credit-status-filter")?.value || "";

  filteredClientCreditCache = clientCreditCache.filter(client => {
    const searchable = normalizeStaffValue(`${client.name || ""} ${client.email || ""} ${client.phone || ""}`);
    const matchesSearch = !search || searchable.includes(search);
    const matchesStatus = !status || String(client.credit_status || "") === status;
    return matchesSearch && matchesStatus;
  });

  const results = document.getElementById("client-credit-results-count");
  if (results) {
    const scopeLabel = clientCreditSearchMode === "search" ? "resultat(s)" : "client(s) a credit";
    results.textContent =
      filteredClientCreditCache.length === clientCreditCache.length
        ? `${clientCreditCache.length} ${scopeLabel}`
        : `${filteredClientCreditCache.length} / ${clientCreditCache.length} ${scopeLabel}`;
  }

  renderClientCreditTable(filteredClientCreditCache);
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

function renderClientCreditTable(clients) {
  const tbody = document.getElementById("client-credit-table-body");
  if (!tbody) return;

  tbody.innerHTML = clients.length
    ? clients
        .map(
          client => `
            <tr class="admin-mobile-row">
              <td>
                <strong>${client.name || "Client"}</strong>
                <div><small>${client.email || "Email non renseigne"}</small></div>
                <div><small>${client.phone || "Telephone non renseigne"}</small></div>
              </td>
              <td>${client.credit_enabled ? client.credit_status || "active" : "Non autorise"}</td>
              <td>${formatMoney(client.credit_limit || 0)}</td>
              <td>${formatMoney(client.current_credit_balance || 0)}</td>
              <td>
                <div class="admin-action-group">
                  <button class="btn-light" type="button" onclick="openClientCreditEdit(${client.id})">Configurer</button>
                </div>
              </td>
            </tr>
          `
        )
        .join("")
    : `
      <tr>
        <td colspan="5" class="admin-table-empty">
          <div class="empty-state"><p>Aucun client ne correspond aux filtres actuels.</p></div>
        </td>
      </tr>
    `;
}

function populateClientCreditProfile(client) {
  const avatar = document.getElementById("client-credit-avatar");
  const name = document.getElementById("client-credit-profile-name");
  const email = document.getElementById("client-credit-profile-email");
  const phone = document.getElementById("client-credit-profile-phone");
  const status = document.getElementById("client-credit-profile-status");
  const limit = document.getElementById("client-credit-profile-limit");
  const balance = document.getElementById("client-credit-profile-balance");
  const available = document.getElementById("client-credit-profile-available");
  const alert = document.getElementById("client-credit-profile-alert");

  if (!client) {
    if (avatar) avatar.textContent = "CL";
    if (name) name.textContent = "Client";
    if (email) email.textContent = "email";
    if (phone) phone.textContent = "Telephone non renseigne";
    if (status) status.textContent = "Inactif";
    if (limit) limit.textContent = formatMoney(0);
    if (balance) balance.textContent = formatMoney(0);
    if (available) available.textContent = formatMoney(0);
    if (alert) alert.innerHTML = "";
    return;
  }

  const creditLimit = Number(client.credit_limit || 0);
  const currentBalance = Number(client.current_credit_balance || 0);
  const remainingAmount = Math.max(0, creditLimit - currentBalance);
  const statusLabel = !client.credit_enabled
    ? "Non autorise"
    : client.credit_status === "active"
      ? "Actif"
      : client.credit_status === "suspended"
        ? "Suspendu"
        : "Inactif";

  if (avatar) avatar.textContent = getCreditClientInitials(client.name);
  if (name) name.textContent = client.name || "Client";
  if (email) email.textContent = client.email || "Email non renseigne";
  if (phone) phone.textContent = client.phone || "Telephone non renseigne";
  if (status) status.textContent = statusLabel;
  if (limit) limit.textContent = formatMoney(creditLimit);
  if (balance) balance.textContent = formatMoney(currentBalance);
  if (available) available.textContent = formatMoney(remainingAmount);
  if (alert) {
    alert.innerHTML = client.credit_enabled
      ? `<strong>${statusLabel}</strong><small>Solde ouvert: ${formatMoney(currentBalance)} sur une limite de ${formatMoney(
          creditLimit
        )}. Disponible restant: ${formatMoney(remainingAmount)}.</small>`
      : `<strong>Client standard</strong><small>Ce client n'utilise pas encore l'option credit. Tu peux l'autoriser si necessaire.</small>`;
  }
}

function renderClientCreditPaymentHistory(payments) {
  const container = document.getElementById("client-credit-payments-history");
  if (!container) return;

  container.innerHTML = payments.length
    ? payments
        .map(
          payment => `
            <article class="admin-credit-history-item">
              <div class="admin-credit-history-main">
                <strong>${formatMoney(payment.amount || 0)}</strong>
                <small>${formatTimestamp(payment.paid_at)}</small>
              </div>
              <div class="admin-credit-history-meta">
                <span>${formatCreditPaymentChannel(payment.payment_channel)}</span>
                <small>${payment.recorded_by_name || "Admin"}</small>
              </div>
              ${payment.note ? `<p>${payment.note}</p>` : ""}
            </article>
          `
        )
        .join("")
    : `<div class="empty-state"><p>Aucun reglement enregistre pour le moment.</p></div>`;
}

function formatCreditPaymentChannel(channel) {
  const mapping = {
    cash: "Cash",
    moncash: "MonCash",
    bank_transfer: "Virement bancaire",
    natcash: "NatCash",
    other: "Autre"
  };

  return mapping[String(channel || "").trim()] || "Reglement";
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

function openClientCreditEdit(clientId) {
  const client = clientCreditCache.find(item => Number(item.id) === Number(clientId));
  const form = document.getElementById("client-credit-form");
  const modal = document.getElementById("client-credit-modal");
  const title = document.getElementById("client-credit-title");
  const message = document.getElementById("client-credit-edit-message");

  if (!client || !form || !modal) return;

  form.client_id.value = client.id;
  form.credit_enabled.value = String(Boolean(client.credit_enabled));
  form.credit_status.value = client.credit_status || (client.credit_enabled ? "active" : "inactive");
  form.credit_limit.value = Number(client.credit_limit || 0);
  form.credit_note.value = client.credit_note || "";
  populateClientCreditProfile(client);
  const paymentForm = document.getElementById("client-credit-payment-form");
  if (paymentForm) {
    paymentForm.reset();
    paymentForm.client_id.value = client.id;
    paymentForm.payment_channel.value = "cash";
  }
  renderClientCreditPaymentHistory([]);

  if (message) message.innerHTML = "";
  if (title) title.textContent = `Credit client - ${client.name || "Client"}`;

  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");

  void (async () => {
    try {
      const data = await loadClientCreditPaymentHistory(client.id);
      clientCreditPaymentsCache = data.payments || [];
      renderClientCreditPaymentHistory(clientCreditPaymentsCache);
    } catch (error) {
      showMessage("client-credit-payment-message", "error", error.message);
    }
  })();
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

function closeClientCreditEdit() {
  const modal = document.getElementById("client-credit-modal");
  const form = document.getElementById("client-credit-form");
  const paymentForm = document.getElementById("client-credit-payment-form");

  if (form) {
    form.reset();
    form.client_id.value = "";
  }
  if (paymentForm) {
    paymentForm.reset();
    paymentForm.client_id.value = "";
  }
  populateClientCreditProfile(null);
  clientCreditPaymentsCache = [];
  renderClientCreditPaymentHistory([]);

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

function bindClientCreditForm() {
  const form = document.getElementById("client-credit-form");
  if (!form) return;

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    const clientId = payload.client_id;
    delete payload.client_id;

    try {
      const data = await apiRequest(`/users/clients-credit/${clientId}`, {
        method: "PATCH",
        body: JSON.stringify({
          credit_enabled: payload.credit_enabled === "true",
          credit_status: payload.credit_status,
          credit_limit: Number(payload.credit_limit || 0),
          credit_note: payload.credit_note
        })
      });
      showMessage("client-credit-message", "success", data.message);
      closeClientCreditEdit();
      renderStaffProfilePage();
    } catch (error) {
      showMessage("client-credit-edit-message", "error", error.message);
    }
  });
}

function bindClientCreditPaymentForm() {
  const form = document.getElementById("client-credit-payment-form");
  if (!form) return;

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    const clientId = payload.client_id;
    delete payload.client_id;

    try {
      const data = await apiRequest(`/users/clients-credit/${clientId}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount: Number(payload.amount || 0),
          payment_channel: payload.payment_channel,
          paid_at: payload.paid_at || null,
          note: payload.note || null
        })
      });

      clientCreditPaymentsCache = data.payments || [];
      renderClientCreditPaymentHistory(clientCreditPaymentsCache);
      showMessage("client-credit-payment-message", "success", data.message);

      const updatedClient = data.client;
      if (updatedClient) {
        clientCreditCache = clientCreditCache.map(client =>
          Number(client.id) === Number(updatedClient.id) ? updatedClient : client
        );
        filteredClientCreditCache = filteredClientCreditCache.map(client =>
          Number(client.id) === Number(updatedClient.id) ? updatedClient : client
        );
        populateClientCreditProfile(updatedClient);
        renderClientCreditSummary(clientCreditCache);
        renderClientCreditTable(filteredClientCreditCache);
      }

      form.reset();
      form.client_id.value = clientId;
      form.payment_channel.value = "cash";
    } catch (error) {
      showMessage("client-credit-payment-message", "error", error.message);
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

function bindClientCreditFilters() {
  const search = document.getElementById("client-credit-search-input");
  const status = document.getElementById("client-credit-status-filter");
  const reset = document.getElementById("client-credit-reset-filters");
  const searchButton = document.getElementById("client-credit-search-button");
  const redraw = () => applyClientCreditFilters();

  status?.addEventListener("change", redraw);
  searchButton?.addEventListener("click", async () => {
    try {
      const rawSearch = String(search?.value || "").trim();
      clientCreditSearchMode = rawSearch ? "search" : "authorized";
      clientCreditCache = await loadClientCreditProfiles({
        authorizedOnly: !rawSearch,
        search: rawSearch
      });
      renderClientCreditSummary(clientCreditCache);
      applyClientCreditFilters();
    } catch (error) {
      showMessage("client-credit-message", "error", error.message);
    }
  });
  search?.addEventListener("keydown", async event => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    searchButton?.click();
  });
  reset?.addEventListener("click", () => {
    if (search) search.value = "";
    if (status) status.value = "";
    clientCreditSearchMode = "authorized";
    void (async () => {
      try {
        clientCreditCache = await loadClientCreditProfiles({ authorizedOnly: true });
        renderClientCreditSummary(clientCreditCache);
        redraw();
      } catch (error) {
        showMessage("client-credit-message", "error", error.message);
      }
    })();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindProfileForm();
  bindStaffForm();
  bindStaffEditForm();
  bindStaffFilters();
  bindClientCreditForm();
  bindClientCreditPaymentForm();
  bindClientCreditFilters();
  renderStaffProfilePage();
  startLiveRefresh("staff-profile", renderStaffProfilePage, 20000);
});

window.openClientCreditEdit = openClientCreditEdit;
window.closeClientCreditEdit = closeClientCreditEdit;
