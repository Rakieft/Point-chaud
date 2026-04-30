const jwt = require("jsonwebtoken");

const generateToken = user =>
  jwt.sign(
    {
      id: user.id,
      role: user.role,
      email: user.email,
      assigned_location_id: user.assigned_location_id || null
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

module.exports = { generateToken };
