const db = require("../config/db");
const { hashPassword, comparePassword } = require("../utils/hash");
const { generateToken } = require("../utils/jwt");

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
      "INSERT INTO users (name, email, password, phone, role) VALUES (?, ?, ?, ?, 'client')",
      [name, email, hashedPassword, phone || null]
    );

    const [users] = await db.query(
      "SELECT id, name, email, phone, role, created_at FROM users WHERE id = ?",
      [result.insertId]
    );

    const user = users[0];

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
    const isValidPassword = await comparePassword(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ message: "Mot de passe incorrect" });
    }

    res.json({
      message: "Connexion reussie",
      token: generateToken(user),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Impossible de se connecter", error: error.message });
  }
};

exports.me = async (req, res) => {
  try {
    const [results] = await db.query(
      "SELECT id, name, email, phone, role, created_at FROM users WHERE id = ?",
      [req.user.id]
    );

    if (!results.length) {
      return res.status(404).json({ message: "Utilisateur introuvable" });
    }

    res.json(results[0]);
  } catch (error) {
    res.status(500).json({ message: "Impossible de recuperer le profil", error: error.message });
  }
};
