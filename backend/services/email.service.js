let cachedTransporter = null;
let transporterLoadAttempted = false;

function hasConfiguredValue(value) {
  const normalized = String(value || "").trim();
  return Boolean(normalized) && normalized !== "..." && normalized.toLowerCase() !== "change_me";
}

function getEmailConfig() {
  return {
    provider: (process.env.EMAIL_PROVIDER || "simulation").toLowerCase(),
    from: process.env.EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || "",
    smtpHost: process.env.SMTP_HOST || "",
    smtpPort: Number(process.env.SMTP_PORT || 587),
    smtpSecure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    smtpUser: process.env.SMTP_USER || "",
    smtpPass: process.env.SMTP_PASS || "",
    appBaseUrl: process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 5000}`
  };
}

function getVerificationUrl(token) {
  const config = getEmailConfig();
  return `${String(config.appBaseUrl).replace(/\/$/, "")}/pages/verify-email.html?token=${encodeURIComponent(token)}`;
}

function getPasswordResetUrl(token) {
  const config = getEmailConfig();
  return `${String(config.appBaseUrl).replace(/\/$/, "")}/pages/reset-password.html?token=${encodeURIComponent(token)}`;
}

function getTransporter() {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  if (transporterLoadAttempted) {
    return null;
  }

  transporterLoadAttempted = true;

  try {
    // Optional dependency: install when ready for real email delivery.
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const nodemailer = require("nodemailer");
    const config = getEmailConfig();

    if (!config.smtpHost || !config.smtpPort || !config.smtpUser || !config.smtpPass) {
      return null;
    }

    cachedTransporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass
      }
    });

    return cachedTransporter;
  } catch (error) {
    console.warn("[EMAIL] Module nodemailer non disponible. Mode simulation conserve.");
    return null;
  }
}

async function sendEmail({ to, subject, html, text }) {
  const config = getEmailConfig();
  const previewUrl = text.match(/https?:\/\/\S+/)?.[0] || "";

  if (config.provider !== "smtp") {
    console.log(`[EMAIL simulation] vers ${to}`);
    console.log(`[EMAIL sujet] ${subject}`);
    console.log(text);
    return {
      delivered: false,
      mode: "simulation",
      previewUrl
    };
  }

  const transporter = getTransporter();
  if (!transporter || !config.from) {
    console.log(`[EMAIL simulation] vers ${to}`);
    console.log(`[EMAIL sujet] ${subject}`);
    console.log(text);
    return {
      delivered: false,
      mode: "simulation",
      previewUrl
    };
  }

  await transporter.sendMail({
    from: config.from,
    to,
    subject,
    text,
    html
  });

  return {
    delivered: true,
    mode: "smtp",
    previewUrl
  };
}

async function sendVerificationEmail({ email, name, token }) {
  const verificationUrl = getVerificationUrl(token);
  const safeName = name || "Client";
  const subject = "Confirme ton email - Point Chaud";
  const text = [
    `Bonjour ${safeName},`,
    "",
    "Merci d'avoir cree ton compte Point Chaud.",
    "Confirme maintenant ton adresse email en ouvrant ce lien :",
    verificationUrl,
    "",
    "Ce lien expire dans 24 heures.",
    "Si tu n'es pas a l'origine de cette inscription, ignore simplement ce message."
  ].join("\n");

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;color:#2b1b12;line-height:1.6">
      <h2 style="margin:0 0 16px;color:#b93821">Confirme ton email</h2>
      <p>Bonjour ${safeName},</p>
      <p>Merci d'avoir cree ton compte <strong>Point Chaud</strong>.</p>
      <p>Confirme ton adresse email en cliquant sur le bouton ci-dessous :</p>
      <p style="margin:24px 0">
        <a href="${verificationUrl}" style="background:#b93821;color:#fff;text-decoration:none;padding:14px 22px;border-radius:999px;display:inline-block;font-weight:700">Verifier mon email</a>
      </p>
      <p>Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :</p>
      <p><a href="${verificationUrl}">${verificationUrl}</a></p>
      <p>Ce lien expire dans 24 heures.</p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject,
    text,
    html
  });
}

async function sendPasswordResetEmail({ email, name, token }) {
  const resetUrl = getPasswordResetUrl(token);
  const safeName = name || "Client";
  const resetHours = Number(process.env.PASSWORD_RESET_TOKEN_HOURS || 2);
  const subject = "Reinitialiser ton mot de passe - Point Chaud";
  const text = [
    `Bonjour ${safeName},`,
    "",
    "Une demande de reinitialisation du mot de passe Point Chaud a ete recue.",
    "Si tu es bien a l'origine de cette demande, ouvre ce lien :",
    resetUrl,
    "",
    `Ce lien expire dans ${resetHours} heure${resetHours > 1 ? "s" : ""}.`,
    "Si tu n'as rien demande, ignore simplement ce message."
  ].join("\n");

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;color:#2b1b12;line-height:1.6">
      <h2 style="margin:0 0 16px;color:#b93821">Reinitialiser ton mot de passe</h2>
      <p>Bonjour ${safeName},</p>
      <p>Une demande de reinitialisation du mot de passe <strong>Point Chaud</strong> a ete recue.</p>
      <p>Si tu es bien a l'origine de cette demande, clique sur le bouton ci-dessous :</p>
      <p style="margin:24px 0">
        <a href="${resetUrl}" style="background:#b93821;color:#fff;text-decoration:none;padding:14px 22px;border-radius:999px;display:inline-block;font-weight:700">Choisir un nouveau mot de passe</a>
      </p>
      <p>Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>Ce lien expire dans ${resetHours} heure${resetHours > 1 ? "s" : ""}.</p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject,
    text,
    html
  });
}

function getEmailProviderStatus() {
  const config = getEmailConfig();
  const ready =
    config.provider === "smtp" && Boolean(config.from && config.smtpHost && config.smtpPort && config.smtpUser && config.smtpPass && getTransporter());

  return {
    provider: config.provider,
    ready,
    from: config.from || null,
    appBaseUrl: config.appBaseUrl
  };
}

module.exports = {
  hasConfiguredValue,
  getEmailConfig,
  getVerificationUrl,
  getPasswordResetUrl,
  sendVerificationEmail,
  sendPasswordResetEmail,
  getEmailProviderStatus
};
