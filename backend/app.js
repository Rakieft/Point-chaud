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

function parseCorsOrigins(value) {
  return String(value || "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean);
}

const allowedOrigins = parseCorsOrigins(process.env.CORS_ORIGINS);

app.disable("x-powered-by");

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static(uploadsRoot));
app.use("/assets", express.static(path.join(frontendRoot, "assets")));
app.use("/pages", express.static(frontendPagesRoot));

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

app.get("/favicon.ico", (req, res) => {
  res.sendFile(path.join(frontendRoot, "assets", "images", "logo-point.png"));
});

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/users", userRoutes);

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
