const fs = require("fs");
const path = require("path");
const multer = require("multer");

const uploadsRoot = path.join(__dirname, "..", process.env.UPLOAD_PATH || "uploads");
const allowedScopes = new Set(["products", "promotions", "general"]);

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

ensureDirectory(uploadsRoot);

function getSafeScope(req) {
  const scope = String(req.query.scope || "general").toLowerCase().trim();
  return allowedScopes.has(scope) ? scope : "general";
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const scope = getSafeScope(req);
    const scopeDir = path.join(uploadsRoot, scope);
    ensureDirectory(scopeDir);
    cb(null, scopeDir);
  },
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname || "").toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = [".png", ".jpg", ".jpeg", ".webp"];
  const allowedMimeTypes = {
    ".png": ["image/png"],
    ".jpg": ["image/jpeg"],
    ".jpeg": ["image/jpeg"],
    ".webp": ["image/webp"]
  };

  const extension = path.extname(file.originalname || "").toLowerCase();
  const mimeType = String(file.mimetype || "").toLowerCase();

  if (!allowed.includes(extension)) {
    return cb(new Error("Format non autorise. Utilisez PNG, JPG, JPEG ou WebP."));
  }

  if (!allowedMimeTypes[extension]?.includes(mimeType)) {
    return cb(new Error("Le type de fichier ne correspond pas au format attendu."));
  }

  cb(null, true);
};

module.exports = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 6 * 1024 * 1024
  }
});
