const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const authRoutes = require("./routes/auth.routes");
const productRoutes = require("./routes/product.routes");
const orderRoutes = require("./routes/order.routes");
const paymentRoutes = require("./routes/payment.routes");
const notificationRoutes = require("./routes/notification.routes");
const userRoutes = require("./routes/user.routes");

const app = express();
const frontendRoot = path.resolve(__dirname, "..", "frontend");
const frontendPagesRoot = path.join(frontendRoot, "pages");
const uploadsRoot = path.join(__dirname, process.env.UPLOAD_PATH || "uploads");
const isProduction = process.env.NODE_ENV === "production";
const appBaseUrl = String(process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 5000}`);

function hasConfiguredValue(value) {
  const normalized = String(value || "").trim();
  return Boolean(normalized) && normalized !== "..." && normalized.toLowerCase() !== "change_me";
}

function parseCorsOrigins(value) {
  return String(value || "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean);
}

const allowedOrigins = parseCorsOrigins(process.env.CORS_ORIGINS);

function buildContentSecurityPolicy() {
  const directives = [
    "default-src 'self' https: data: blob:",
    "base-uri 'self'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline' https:",
    "script-src 'self' 'unsafe-inline' https://accounts.google.com https://appleid.cdn-apple.com",
    "connect-src 'self' https: ws: wss:",
    "frame-src 'self' https://accounts.google.com https://appleid.apple.com https://appleid.cdn-apple.com",
    "object-src 'none'"
  ];

  return directives.join("; ");
}

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("Content-Security-Policy", buildContentSecurityPolicy());
  if (isProduction) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

app.use(
  cors({
    origin(origin, callback) {
      const isFileOrigin = origin === "null";
      if (
        !origin ||
        (!isProduction && isFileOrigin) ||
        !allowedOrigins.length ||
        allowedOrigins.includes(origin)
      ) {
        return callback(null, true);
      }

      return callback(new Error("Origine non autorisee par la configuration CORS"));
    }
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "200kb" }));

app.use("/uploads", express.static(uploadsRoot));
app.use("/assets", express.static(path.join(frontendRoot, "assets")));
app.use("/pages", express.static(frontendPagesRoot));
app.use(express.static(frontendPagesRoot));

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPagesRoot, "index.html"));
});

app.get("/api/health", (req, res) => {
  res.json({
    name: "Point Chaud API",
    status: "online",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/public-config", (req, res) => {
  res.json({
    whatsappNumber: hasConfiguredValue(process.env.WHATSAPP_NUMBER) ? process.env.WHATSAPP_NUMBER : "",
    whatsappMessage: hasConfiguredValue(process.env.WHATSAPP_MESSAGE)
      ? process.env.WHATSAPP_MESSAGE
      : "Bonjour Point Chaud, je veux plus d'informations.",
    instagramUrl: hasConfiguredValue(process.env.INSTAGRAM_URL) ? process.env.INSTAGRAM_URL : "",
    tiktokUrl: hasConfiguredValue(process.env.TIKTOK_URL) ? process.env.TIKTOK_URL : ""
  });
});

app.get("/api/security-config", (req, res) => {
  res.json({
    appBaseUrl,
    corsOrigins: allowedOrigins,
    production: isProduction
  });
});

app.get("/favicon.ico", (req, res) => {
  res.sendFile(path.join(frontendRoot, "assets", "images", "logo-point.png"));
});

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/users", userRoutes);

app.use((error, req, res, next) => {
  if (!error) {
    return next();
  }

  if (error.message?.includes("Origine non autorisee")) {
    return res.status(403).json({ message: "Origine non autorisee" });
  }

  if (error.name === "MulterError") {
    return res.status(400).json({ message: "Fichier refuse ou trop volumineux" });
  }

  if (error.message?.includes("Format non autorise") || error.message?.includes("type de fichier")) {
    return res.status(400).json({ message: error.message });
  }

  return res.status(500).json({ message: "Erreur interne du serveur" });
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ message: "Route introuvable" });
  }

  if (path.extname(req.path)) {
    return res.status(404).send("Page introuvable");
  }

  return res.status(404).sendFile(path.join(frontendPagesRoot, "index.html"));
});

module.exports = app;
