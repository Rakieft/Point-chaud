function nextPageForRole(role) {
  if (role === "client") return "/dashboard-client.html";
  if (role === "driver") return "/dashboard-driver.html";
  return "/dashboard-admin.html";
}

function socialMessageTarget() {
  return "form-message";
}

function verificationPendingUrl(email, previewUrl = "") {
  const params = new URLSearchParams();
  if (email) params.set("email", email);
  if (previewUrl) params.set("preview", previewUrl);
  return `/email-verification-pending.html?${params.toString()}`;
}

function forgotPasswordPageUrl(email = "", previewUrl = "") {
  const params = new URLSearchParams();
  if (email) params.set("email", email);
  if (previewUrl) params.set("preview", previewUrl);
  return `/forgot-password.html?${params.toString()}`;
}

function renderResendPrompt(email) {
  const container = document.getElementById("verification-help");
  if (!container || !email) return;

  container.hidden = false;
  container.innerHTML = `
    <div class="message-box visible info">
      <strong>Email non verifie.</strong>
      <span>Confirme d'abord ton adresse email pour activer ton compte client.</span>
    </div>
    <button id="resend-verification-button" class="btn btn-light" type="button">Renvoyer le lien de verification</button>
  `;

  const button = document.getElementById("resend-verification-button");
  button?.addEventListener("click", async () => {
    try {
      const data = await apiRequest("/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email })
      });
      showMessage(
        "form-message",
        "success",
        data.verificationPreviewUrl
          ? `Lien de verification regenere. Ouvre ensuite le lien de test fourni.`
          : "Un nouveau lien de verification a ete envoye."
      );
      window.location.href = verificationPendingUrl(email, data.verificationPreviewUrl || "");
    } catch (error) {
      showMessage("form-message", "error", error.message);
    }
  });
}

function loadExternalScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }

      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Impossible de charger ${src}`)), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true }
    );
    script.addEventListener("error", () => reject(new Error(`Impossible de charger ${src}`)), { once: true });
    document.head.appendChild(script);
  });
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
      <span class="password-toggle-icon" aria-hidden="true">👁</span>
    `;

    toggle.addEventListener("click", () => {
      const showPassword = input.type === "password";
      input.type = showPassword ? "text" : "password";
      toggle.setAttribute("aria-label", showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe");
      toggle.classList.toggle("is-active", showPassword);
      toggle.querySelector(".password-toggle-icon").textContent = "👁";
    });

    wrapper.appendChild(toggle);
    input.dataset.passwordToggleBound = "true";
  });
}

async function authenticateWithSocial(provider, idToken, name = "") {
  const data = await apiRequest("/auth/social-login", {
    method: "POST",
    body: JSON.stringify({
      provider,
      id_token: idToken,
      name
    })
  });

  saveSession(data);
  window.location.href = nextPageForRole(data.user.role);
}

async function initGoogleAuth(config) {
  const panel = document.getElementById("google-auth-button");
  if (!panel || !config?.enabled || !config.clientId) return;

  await loadExternalScript("https://accounts.google.com/gsi/client");

  panel.innerHTML = "";
  window.google.accounts.id.initialize({
    client_id: config.clientId,
    callback: async response => {
      try {
        await authenticateWithSocial("google", response.credential);
      } catch (error) {
        showMessage(socialMessageTarget(), "error", error.message);
      }
    }
  });

  window.google.accounts.id.renderButton(panel, {
    theme: "outline",
    size: "large",
    shape: "pill",
    text: "continue_with",
    width: 320
  });
}

async function initAppleAuth(config) {
  const button = document.getElementById("apple-auth-button");
  if (!button || !config?.enabled || !config.clientId || !config.redirectUri) return;

  await loadExternalScript("https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js");

  if (!window.AppleID?.auth) return;

  window.AppleID.auth.init({
    clientId: config.clientId,
    scope: "name email",
    redirectURI: config.redirectUri,
    usePopup: true
  });

  button.hidden = false;
  button.addEventListener("click", async () => {
    try {
      const response = await window.AppleID.auth.signIn();
      const fullName = response?.user?.name
        ? `${response.user.name.firstName || ""} ${response.user.name.lastName || ""}`.trim()
        : "";
      await authenticateWithSocial("apple", response.authorization.id_token, fullName);
    } catch (error) {
      if (error?.error === "popup_closed_by_user") return;
      showMessage(socialMessageTarget(), "error", "Connexion Apple interrompue ou non configuree.");
    }
  });
}

async function initSocialAuth() {
  const socialPanel = document.getElementById("social-auth-panel");
  if (!socialPanel) return;

  try {
    const config = await apiRequest("/auth/social-config");
    const hasGoogle = Boolean(config.google?.enabled && config.google.clientId);
    const hasApple = Boolean(config.apple?.enabled && config.apple.clientId && config.apple.redirectUri);

    if (!hasGoogle && !hasApple) {
      socialPanel.hidden = true;
      return;
    }

    socialPanel.hidden = false;

    if (hasGoogle) {
      await initGoogleAuth(config.google);
    } else {
      document.getElementById("google-auth-slot")?.setAttribute("hidden", "hidden");
    }

    if (hasApple) {
      await initAppleAuth(config.apple);
    } else {
      document.getElementById("apple-auth-button")?.setAttribute("hidden", "hidden");
    }
  } catch (error) {
    socialPanel.hidden = true;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initializePasswordToggles();

  const registerForm = document.getElementById("register-form");
  const loginForm = document.getElementById("login-form");
  const pendingCard = document.getElementById("verification-pending-card");
  const verifyCard = document.getElementById("verify-email-card");
  const forgotPasswordForm = document.getElementById("forgot-password-form");
  const resetPasswordCard = document.getElementById("reset-password-card");

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

        window.location.href = verificationPendingUrl(data.email || payload.email, data.verificationPreviewUrl || "");
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
        if (/verifie ton email/i.test(error.message)) {
          renderResendPrompt(payload.email);
        }
      }
    });
  }

  if (pendingCard) {
    const params = new URLSearchParams(window.location.search);
    const email = params.get("email") || "";
    const previewUrl = params.get("preview") || "";
    const emailLabel = document.getElementById("verification-pending-email");
    const previewBox = document.getElementById("verification-preview-box");
    const previewAnchor = document.getElementById("verification-preview-link");
    const resendButton = document.getElementById("verification-pending-resend");

    if (emailLabel) {
      emailLabel.textContent = email || "ton email";
    }

    if (previewUrl && previewBox && previewAnchor) {
      previewBox.hidden = false;
      previewAnchor.href = previewUrl;
      previewAnchor.textContent = previewUrl;
    }

    resendButton?.addEventListener("click", async () => {
      try {
        const data = await apiRequest("/auth/resend-verification", {
          method: "POST",
          body: JSON.stringify({ email })
        });

        if (data.verificationPreviewUrl && previewBox && previewAnchor) {
          previewBox.hidden = false;
          previewAnchor.href = data.verificationPreviewUrl;
          previewAnchor.textContent = data.verificationPreviewUrl;
        }

        showMessage(
          "verification-pending-message",
          "success",
          data.verificationPreviewUrl
            ? "Nouveau lien de verification genere. Utilise le lien de test ci-dessous."
            : "Un nouveau lien de verification a ete envoye."
        );
      } catch (error) {
        showMessage("verification-pending-message", "error", error.message);
      }
    });
  }

  if (forgotPasswordForm) {
    const params = new URLSearchParams(window.location.search);
    const email = params.get("email") || "";
    const previewUrl = params.get("preview") || "";
    const emailInput = forgotPasswordForm.querySelector('input[name="email"]');
    const previewBox = document.getElementById("forgot-password-preview-box");
    const previewAnchor = document.getElementById("forgot-password-preview-link");

    if (emailInput && email) {
      emailInput.value = email;
    }

    if (previewUrl && previewBox && previewAnchor) {
      previewBox.hidden = false;
      previewAnchor.href = previewUrl;
      previewAnchor.textContent = previewUrl;
    }

    forgotPasswordForm.addEventListener("submit", async event => {
      event.preventDefault();

      const formData = new FormData(forgotPasswordForm);
      const payload = Object.fromEntries(formData.entries());

      try {
        const data = await apiRequest("/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify(payload)
        });

        if (data.resetPreviewUrl && previewBox && previewAnchor) {
          previewBox.hidden = false;
          previewAnchor.href = data.resetPreviewUrl;
          previewAnchor.textContent = data.resetPreviewUrl;
        }

        showMessage(
          "forgot-password-message",
          "success",
          data.resetPreviewUrl
            ? "Lien de reinitialisation genere. Utilise le lien de test ci-dessous."
            : data.message || "Si un compte compatible existe, un lien a ete prepare."
        );

        const nextUrl = forgotPasswordPageUrl(payload.email, data.resetPreviewUrl || "");
        window.history.replaceState({}, "", nextUrl);
      } catch (error) {
        showMessage("forgot-password-message", "error", error.message);
      }
    });
  }

  if (verifyCard) {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token") || "";

    if (!token) {
      showMessage("verify-email-message", "error", "Lien de verification incomplet.");
    } else {
      apiRequest("/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ token })
      })
        .then(data => {
          showMessage("verify-email-message", "success", data.message || "Email verifie avec succes.");
          const action = document.getElementById("verify-email-actions");
          if (action) {
            action.hidden = false;
          }
        })
        .catch(error => {
          showMessage("verify-email-message", "error", error.message);
        });
    }
  }

  if (resetPasswordCard) {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token") || "";
    const form = document.getElementById("reset-password-form");
    const actions = document.getElementById("reset-password-actions");

    if (!token) {
      showMessage("reset-password-message", "error", "Lien de reinitialisation incomplet.");
      form?.setAttribute("hidden", "hidden");
    } else {
      apiRequest("/auth/validate-reset-password", {
        method: "POST",
        body: JSON.stringify({ token })
      })
        .then(() => {
          form?.removeAttribute("hidden");
        })
        .catch(error => {
          showMessage("reset-password-message", "error", error.message);
          form?.setAttribute("hidden", "hidden");
        });

      form?.addEventListener("submit", async event => {
        event.preventDefault();

        const formData = new FormData(form);
        const payload = Object.fromEntries(formData.entries());

        if (payload.password !== payload.password_confirm) {
          showMessage("reset-password-message", "error", "Les deux mots de passe doivent etre identiques.");
          return;
        }

        try {
          const data = await apiRequest("/auth/reset-password", {
            method: "POST",
            body: JSON.stringify({
              token,
              password: payload.password
            })
          });

          showMessage("reset-password-message", "success", data.message);
          form.setAttribute("hidden", "hidden");
          actions?.removeAttribute("hidden");
        } catch (error) {
          showMessage("reset-password-message", "error", error.message);
        }
      });
    }
  }

  initSocialAuth();
});
