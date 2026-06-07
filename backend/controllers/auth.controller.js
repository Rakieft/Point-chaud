const db = require("../config/db");
const { hashPassword, comparePassword } = require("../utils/hash");
const { generateToken } = require("../utils/jwt");
const { getScopedUser } = require("../utils/helpers");
const { verifySocialIdentity } = require("../services/social-auth.service");
const { logSecurityEvent } = require("../services/security-log.service");

async function getUserById(userId) {
  return getScopedUser(userId);
}

function hasConfiguredValue(value) {
  const normalized = String(value || "").trim();
  return Boolean(normalized) && normalized !== "..." && normalized.toLowerCase() !== "change_me";
}

exports.register = async (req, res) => {
  const { name, email, password, phone } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: "Nom, email et mot de passe sont obligatoires" });
  }

  try {
    const [existingUsers] = await db.query("SELECT id FROM users WHERE email = ?", [email]);

    if (existingUsers.length) {
      return res.status(409).json({ message: "Cet email est deja utilise" });
    }

    const hashedPassword = await hashPassword(password);

    const [result] = await db.query(
      `INSERT INTO users
       (name, email, password, phone, role, is_active, email_verified, email_verification_token_hash, email_verification_expires_at)
       VALUES (?, ?, ?, ?, 'client', TRUE, TRUE, NULL, NULL)`,
      [name, email, hashedPassword, phone || null]
    );

    const scopedUser = await getUserById(result.insertId);

    res.status(201).json({
      message: "Compte cree avec succes.",
      token: generateToken(scopedUser),
      user: scopedUser
    });
  } catch (error) {
    res.status(500).json({ message: "Impossible de creer le compte", error: error.message });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const ipAddress = req.ip || req.headers["x-forwarded-for"] || null;

  if (!email || !password) {
    return res.status(400).json({ message: "Email et mot de passe sont obligatoires" });
  }

  try {
    const [results] = await db.query("SELECT * FROM users WHERE email = ?", [email]);

    if (!results.length) {
      await logSecurityEvent({
        eventType: "login_user_not_found",
        severity: "warning",
        email,
        ipAddress
      });
      return res.status(404).json({ message: "Utilisateur non trouve" });
    }

    const user = results[0];

    if (!user.is_active) {
      await logSecurityEvent({
        eventType: "login_disabled_account",
        severity: "warning",
        userId: user.id,
        email: user.email,
        ipAddress
      });
      return res.status(403).json({ message: "Ce compte est desactive" });
    }

    if (!user.password) {
      await logSecurityEvent({
        eventType: "login_social_account_password_attempt",
        severity: "warning",
        userId: user.id,
        email: user.email,
        ipAddress,
        details: {
          provider: user.oauth_provider || null
        }
      });
      return res.status(400).json({
        message:
          user.oauth_provider === "google"
            ? "Ce compte utilise Google. Connecte-toi avec Google."
            : user.oauth_provider === "apple"
              ? "Ce compte utilise Apple. Connecte-toi avec Apple."
              : "Ce compte utilise une autre methode de connexion."
      });
    }

    const isValidPassword = await comparePassword(password, user.password);

    if (!isValidPassword) {
      await logSecurityEvent({
        eventType: "login_invalid_password",
        severity: "warning",
        userId: user.id,
        email: user.email,
        ipAddress
      });
      return res.status(401).json({ message: "Mot de passe incorrect" });
    }

    const scopedUser = await getUserById(user.id);
    await logSecurityEvent({
      eventType: "login_success",
      severity: "info",
      userId: user.id,
      email: user.email,
      ipAddress,
      details: {
        role: user.role
      }
    });

    res.json({
      message: "Connexion reussie",
      token: generateToken(scopedUser),
      user: scopedUser
    });
  } catch (error) {
    res.status(500).json({ message: "Impossible de se connecter", error: error.message });
  }
};

exports.me = async (req, res) => {
  try {
    const user = await getUserById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "Utilisateur introuvable" });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Impossible de recuperer le profil", error: error.message });
  }
};

exports.socialConfig = async (req, res) => {
  res.json({
    google: {
      enabled: hasConfiguredValue(process.env.GOOGLE_CLIENT_ID),
      clientId: process.env.GOOGLE_CLIENT_ID || ""
    },
    apple: {
      enabled: hasConfiguredValue(process.env.APPLE_CLIENT_ID) && hasConfiguredValue(process.env.APPLE_REDIRECT_URI),
      clientId: process.env.APPLE_CLIENT_ID || "",
      redirectUri: process.env.APPLE_REDIRECT_URI || ""
    }
  });
};

exports.socialLogin = async (req, res) => {
  const { provider, id_token: idToken, name } = req.body;

  if (!provider || !idToken) {
    return res.status(400).json({ message: "Le fournisseur et le token social sont obligatoires" });
  }

  try {
    const profile = await verifySocialIdentity(provider, idToken);
    const nextName = name || profile.name || profile.email.split("@")[0];

    let [users] = await db.query(
      "SELECT id, email, is_active, oauth_provider, oauth_subject FROM users WHERE oauth_provider = ? AND oauth_subject = ? LIMIT 1",
      [provider, profile.subject]
    );

    let user = users[0] || null;

    if (!user) {
      [users] = await db.query(
        "SELECT id, email, is_active, oauth_provider, oauth_subject FROM users WHERE email = ? LIMIT 1",
        [profile.email]
      );
      user = users[0] || null;
    }

    if (user) {
      if (!user.is_active) {
        return res.status(403).json({ message: "Ce compte est desactive" });
      }

      await db.query(
        `UPDATE users
         SET name = COALESCE(NULLIF(?, ''), name),
             oauth_provider = COALESCE(oauth_provider, ?),
             oauth_subject = COALESCE(oauth_subject, ?),
             email_verified = ?,
             email_verified_at = CASE WHEN ? THEN COALESCE(email_verified_at, NOW()) ELSE email_verified_at END,
             email_verification_token_hash = NULL,
             email_verification_expires_at = NULL
         WHERE id = ?`,
        [nextName, provider, profile.subject, profile.emailVerified, profile.emailVerified, user.id]
      );
    } else {
      const [result] = await db.query(
        `
          INSERT INTO users
          (name, email, password, phone, bio, avatar_url, title, oauth_provider, oauth_subject, email_verified, email_verified_at, role, assigned_location_id, is_active)
          VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?, 'client', NULL, TRUE)
        `,
        [nextName, profile.email, provider, profile.subject, profile.emailVerified, profile.emailVerified ? new Date() : null]
      );
      user = { id: result.insertId };
    }

    const scopedUser = await getUserById(user.id);

    res.json({
      message: "Connexion sociale reussie",
      token: generateToken(scopedUser),
      user: scopedUser
    });
  } catch (error) {
    res.status(401).json({ message: error.message || "Impossible de verifier la connexion sociale" });
  }
};

exports.createStaff = async (req, res) => {
  const { name, email, password, phone, role, assigned_location_id, bio, title, avatar_url } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: "Nom, email, mot de passe et role sont obligatoires" });
  }

  if (!["admin", "manager", "driver"].includes(role)) {
    return res.status(400).json({ message: "Seuls les roles admin, manager et livreur peuvent etre crees ici" });
  }

  if (["manager", "driver"].includes(role) && !assigned_location_id) {
    return res.status(400).json({ message: "Le point de vente du membre du staff est obligatoire" });
  }

  try {
    const [existingUsers] = await db.query("SELECT id FROM users WHERE email = ?", [email]);

    if (existingUsers.length) {
      return res.status(409).json({ message: "Cet email est deja utilise" });
    }

    const hashedPassword = await hashPassword(password);

    const [result] = await db.query(
      `
        INSERT INTO users
        (name, email, password, phone, bio, avatar_url, title, role, assigned_location_id, is_active, email_verified, email_verified_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, TRUE, NOW())
      `,
      [
        name,
        email,
        hashedPassword,
        phone || null,
        bio || null,
        avatar_url || null,
        title || (role === "manager" ? "Manager de succursale" : role === "driver" ? "Livreur" : "Administrateur"),
        role,
        ["manager", "driver"].includes(role) ? assigned_location_id : null
      ]
    );

    const createdUser = await getUserById(result.insertId);

    res.status(201).json({
      message: `Compte ${role} cree avec succes`,
      user: createdUser
    });
  } catch (error) {
    res.status(500).json({ message: "Impossible de creer ce compte", error: error.message });
  }
};

exports.verifyEmail = async (req, res) => {
  return res.status(410).json({ message: "La verification email est desactivee pour le moment." });
};

exports.resendVerificationEmail = async (req, res) => {
  return res.status(410).json({ message: "La verification email est desactivee pour le moment." });
};

exports.forgotPassword = async (req, res) => {
  return res.status(410).json({ message: "La reinitialisation de mot de passe est desactivee pour le moment." });
};

exports.validatePasswordResetToken = async (req, res) => {
  return res.status(410).json({ message: "La reinitialisation de mot de passe est desactivee pour le moment." });
};

exports.resetPassword = async (req, res) => {
  return res.status(410).json({ message: "La reinitialisation de mot de passe est desactivee pour le moment." });
};
