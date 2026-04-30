const db = require("../config/db");
const { hashPassword, comparePassword } = require("../utils/hash");
const { generateToken } = require("../utils/jwt");
const { getScopedUser } = require("../utils/helpers");

async function getUserById(userId) {
  return getScopedUser(userId);
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
      "INSERT INTO users (name, email, password, phone, role, is_active) VALUES (?, ?, ?, ?, 'client', TRUE)",
      [name, email, hashedPassword, phone || null]
    );

    const user = await getUserById(result.insertId);

    res.status(201).json({
      message: "Compte cree avec succes",
      token: generateToken(user),
      user
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
        (name, email, password, phone, bio, avatar_url, title, role, assigned_location_id, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
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
