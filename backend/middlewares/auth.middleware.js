const jwt = require("jsonwebtoken");
const { logSecurityEvent } = require("../services/security-log.service");

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    logSecurityEvent({
      eventType: "missing_bearer_token",
      severity: "warning",
      ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
      details: {
        path: req.path,
        method: req.method
      }
    });
    return res.status(401).json({ message: "Acces refuse" });
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    logSecurityEvent({
      eventType: "invalid_bearer_token",
      severity: "warning",
      ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
      details: {
        path: req.path,
        method: req.method,
        error: error.message
      }
    });
    res.status(401).json({ message: "Token invalide" });
  }
};
