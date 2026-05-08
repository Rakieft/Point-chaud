const db = require("../config/db");
const crypto = require("crypto");
const { hashPassword, comparePassword } = require("../utils/hash");
const { generateToken } = require("../utils/jwt");
const { getScopedUser } = require("../utils/helpers");
const { verifySocialIdentity } = require("../services/social-auth.service");
const { sendVerificationEmail } = require("../services/email.service");

async function getUserById(userId) {
  return getScopedUser(userId);
}

function hasConfiguredValue(value) {
  const normalized = String(value || "").trim();
  return Boolean(normalized) && normalized !== "..." && normalized.toLowerCase() !== "change_me";
}

function buildVerificationTokenSet() {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return { rawToken, tokenHash, expiresAt };
}

exports.register = async (req, res) => {
  const { name, email, password, phone } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: "Nom, email et mot de passe sont obligatoires" });
  }

  try {
    const [existingUsers] = await db.query("SELECT id, role, email_verified FROM users WHERE email = ?", [email]);

    if (existingUsers.length) {
      const existingUser = existingUsers[0];
      const message =
        existingUser.role === "client" && !existingUser.email_verified
          ? "Cet email est deja inscrit, mais il attend encore sa verification. Connecte-toi ou renvoie le lien."
          : "Cet email est deja utilise";
      return res.status(409).json({ message });
    }

    const hashedPassword = await hashPassword(password);
    const { rawToken, tokenHash, expiresAt } = buildVerificationTokenSet();

    const [result] = await db.query(
      `INSERT INTO users
       (name, email, password, phone, role, is_active, email_verified, email_verification_token_hash, email_verification_expires_at)
       VALUES (?, ?, ?, ?, 'client', TRUE, FALSE, ?, ?)`,
      [name, email, hashedPassword, phone || null, tokenHash, expiresAt]
    );

    const delivery = await sendVerificationEmail({
      email,
      name,
      token: rawToken
    });

    res.status(201).json({
      message: "Compte cree avec succes. Verifie maintenant ton email pour activer la connexion.",
      requiresEmailVerification: true,
      email,
      verificationPreviewUrl: delivery.previewUrl || null
    });
  } catch (error) {
    res.status(500).json({ message: "Impossible de creer le compte", error: error.message });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email et mot de passe sont obligatoires" });
  }

  try {
    const [results] = await db.query("SELECT * FROM users WHERE email = ?", [email]);

    if (!results.length) {
      return res.status(404).json({ message: "Utilisateur non trouve" });
    }

    const user = results[0];

    if (!user.is_active) {
      return res.status(403).json({ message: "Ce compte est desactive" });
    }

    if (user.role === "client" && !user.email_verified) {
      return res.status(403).json({
        message: "Verifie ton email avant de te connecter.",
        code: "EMAIL_NOT_VERIFIED",
        email: user.email
      });
    }

    if (!user.password) {
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
      return res.status(401).json({ message: "Mot de passe incorrect" });
    }

    const scopedUser = await getUserById(user.id);

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
  const token = req.body.token || req.query.token;

  if (!token) {
    return res.status(400).json({ message: "Le token de verification est obligatoire" });
  }

  try {
    const tokenHash = crypto.createHash("sha256").update(String(token)).digest("hex");
    const [users] = await db.query(
      `
        SELECT id, email_verified, email_verification_expires_at
        FROM users
        WHERE email_verification_token_hash = ?
        LIMIT 1
      `,
      [tokenHash]
    );

    if (!users.length) {
      return res.status(400).json({ message: "Lien de verification invalide ou deja utilise" });
    }

    const user = users[0];
    if (user.email_verified) {
      return res.json({ message: "Cette adresse email est deja verifiee" });
    }

    if (!user.email_verification_expires_at || new Date(user.email_verification_expires_at).getTime() < Date.now()) {
      return res.status(400).json({ message: "Ce lien de verification a expire" });
    }

    await db.query(
      `
        UPDATE users
        SET email_verified = TRUE,
            email_verified_at = NOW(),
            email_verification_token_hash = NULL,
            email_verification_expires_at = NULL
        WHERE id = ?
      `,
      [user.id]
    );

    return res.json({ message: "Email verifie avec succes. Tu peux maintenant te connecter." });
  } catch (error) {
    return res.status(500).json({ message: "Impossible de verifier cet email", error: error.message });
  }
};

exports.resendVerificationEmail = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "L'email est obligatoire" });
  }

  try {
    const [users] = await db.query(
      "SELECT id, name, email, role, email_verified, is_active FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    if (!users.length) {
      return res.status(404).json({ message: "Aucun compte trouve avec cet email" });
    }

    const user = users[0];

    if (user.role !== "client") {
      return res.status(400).json({ message: "Cette verification est reservee aux comptes clients" });
    }

    if (!user.is_active) {
      return res.status(403).json({ message: "Ce compte est desactive" });
    }

    if (user.email_verified) {
      return res.json({ message: "Cet email est deja verifie" });
    }

    const { rawToken, tokenHash, expiresAt } = buildVerificationTokenSet();
    await db.query(
      `
        UPDATE users
        SET email_verification_token_hash = ?,
            email_verification_expires_at = ?
        WHERE id = ?
      `,
      [tokenHash, expiresAt, user.id]
    );

    const delivery = await sendVerificationEmail({
      email: user.email,
      name: user.name,
      token: rawToken
    });

    return res.json({
      message: "Un nouveau lien de verification a ete envoye.",
      verificationPreviewUrl: delivery.previewUrl || null
    });
  } catch (error) {
    return res.status(500).json({ message: "Impossible de renvoyer le mail de verification", error: error.message });
  }
};
