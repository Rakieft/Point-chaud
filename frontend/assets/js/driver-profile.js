function fillDriverProfile(user) {
  const form = document.getElementById("driver-profile-form");
  if (!form) return;

  form.name.value = user.name || "";
  form.email.value = user.email || "";
  form.phone.value = user.phone || "";
  form.title.value = user.title || "";
  form.avatar_url.value = user.avatar_url || "";
  form.bio.value = user.bio || "";

  const avatar = document.getElementById("driver-profile-avatar");
  const name = document.getElementById("driver-profile-name");
  const email = document.getElementById("driver-profile-email");
  const phone = document.getElementById("driver-profile-phone");
  const title = document.getElementById("driver-profile-title");
  const branch = document.getElementById("driver-profile-branch");
  const bio = document.getElementById("driver-profile-bio");
  const location = document.getElementById("driver-profile-location");

  if (avatar) avatar.textContent = backofficeInitials(user.name);
  if (name) name.textContent = user.name || "Livreur";
  if (email) email.textContent = user.email || "Email non renseigne";
  if (phone) phone.textContent = user.phone || "Telephone non renseigne";
  if (title) title.textContent = user.title || "Livreur";
  if (branch) branch.textContent = user.assigned_location_name || "Succursale non definie";
  if (bio) bio.textContent = user.bio || "Aucune biographie pour le moment.";
  if (location) location.textContent = user.assigned_location_name || "Succursale non definie";
}

function bindDriverProfileForm() {
  const form = document.getElementById("driver-profile-form");
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
      fillDriverProfile(data.user);
      showMessage("driver-profile-message", "success", data.message);
    } catch (error) {
      showMessage("driver-profile-message", "error", error.message);
    }
  });
}

async function renderDriverProfilePage() {
  try {
    const user = await loadBackofficeUser();
    if (!user || user.role !== "driver") {
      window.location.href = "./staff-profile.html";
      return;
    }

    fillDriverProfile(user);
  } catch (error) {
    showMessage("driver-profile-message", "error", error.message);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  bindDriverProfileForm();
  renderDriverProfilePage();
  startLiveRefresh("driver-profile", renderDriverProfilePage, 20000);
});
