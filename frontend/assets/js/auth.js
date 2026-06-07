function nextPageForRole(role) {
  if (role === "client") return "/dashboard-client.html";
  if (role === "driver") return "/dashboard-driver.html";
  return "/dashboard-admin.html";
}

function initializePasswordToggles(root = document) {
  root.querySelectorAll('input[type="password"]').forEach(input => {
    if (!input.name || input.dataset.passwordToggleBound === "true") return;

    const wrapper = document.createElement("div");
    wrapper.className = "password-input-wrap";
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "password-toggle-btn";
    toggle.setAttribute("aria-label", "Afficher le mot de passe");
    toggle.innerHTML = `
      <span class="password-toggle-icon" aria-hidden="true">Voir</span>
    `;

    toggle.addEventListener("click", () => {
      const showPassword = input.type === "password";
      input.type = showPassword ? "text" : "password";
      toggle.setAttribute("aria-label", showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe");
      toggle.classList.toggle("is-active", showPassword);
      toggle.querySelector(".password-toggle-icon").textContent = showPassword ? "Masquer" : "Voir";
    });

    wrapper.appendChild(toggle);
    input.dataset.passwordToggleBound = "true";
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initializePasswordToggles();

  const registerForm = document.getElementById("register-form");
  const loginForm = document.getElementById("login-form");

  if (registerForm) {
    registerForm.addEventListener("submit", async event => {
      event.preventDefault();

      const formData = new FormData(registerForm);
      const payload = Object.fromEntries(formData.entries());

      try {
        const data = await apiRequest("/auth/register", {
          method: "POST",
          body: JSON.stringify(payload)
        });

        saveSession(data);
        window.location.href = nextPageForRole(data.user.role);
      } catch (error) {
        showMessage("form-message", "error", error.message);
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async event => {
      event.preventDefault();

      const formData = new FormData(loginForm);
      const payload = Object.fromEntries(formData.entries());

      try {
        const data = await apiRequest("/auth/login", {
          method: "POST",
          body: JSON.stringify(payload)
        });

        saveSession(data);
        window.location.href = nextPageForRole(data.user.role);
      } catch (error) {
        showMessage("form-message", "error", error.message);
      }
    });
  }
});
