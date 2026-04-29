document.addEventListener("DOMContentLoaded", () => {
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
        window.location.href = "../pages/dashboard-client.html";
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
        const nextPage =
          data.user.role === "client" ? "../pages/dashboard-client.html" : "../pages/dashboard-admin.html";
        window.location.href = nextPage;
      } catch (error) {
        showMessage("form-message", "error", error.message);
      }
    });
  }
});
