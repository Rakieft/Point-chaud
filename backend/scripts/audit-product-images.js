require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const fs = require("fs/promises");
const path = require("path");
const db = require("../config/db");

const PRODUCT_IMAGES_DIR = path.resolve(__dirname, "..", "..", "frontend", "assets", "images", "products");
const TARGET_MAX_BYTES = 250 * 1024;

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function main() {
  const [products] = await db.query("SELECT id, name, image FROM products ORDER BY id");
  const entries = await fs.readdir(PRODUCT_IMAGES_DIR, { withFileTypes: true }).catch(() => []);
  const files = entries.filter(entry => entry.isFile()).map(entry => entry.name);
  const fileSet = new Set(files.map(file => file.toLowerCase()));

  const report = {
    totalProducts: products.length,
    imagesFolder: PRODUCT_IMAGES_DIR,
    targetRecommendation: "WebP, largeur 600 a 800 px, poids ideal <= 250 KB",
    missingSuggestedImages: [],
    oversizedFiles: [],
    configuredButMissing: [],
    readyProducts: []
  };

  for (const product of products) {
    const suggestedName = `${slugify(product.name)}.webp`;
    const configuredImage = String(product.image || "").trim();

    if (configuredImage) {
      if (!/^https?:\/\//i.test(configuredImage) && !fileSet.has(configuredImage.toLowerCase())) {
        report.configuredButMissing.push({
          id: Number(product.id),
          name: product.name,
          configuredImage
        });
      } else {
        report.readyProducts.push({
          id: Number(product.id),
          name: product.name,
          source: configuredImage
        });
      }
      continue;
    }

    if (!fileSet.has(suggestedName.toLowerCase())) {
      report.missingSuggestedImages.push({
        id: Number(product.id),
        name: product.name,
        suggestedFile: suggestedName
      });
      continue;
    }

    report.readyProducts.push({
      id: Number(product.id),
      name: product.name,
      source: suggestedName
    });
  }

  for (const file of files) {
    const fullPath = path.join(PRODUCT_IMAGES_DIR, file);
    const stats = await fs.stat(fullPath);
    if (stats.size > TARGET_MAX_BYTES) {
      report.oversizedFiles.push({
        file,
        sizeKb: Math.round(stats.size / 1024)
      });
    }
  }

  console.log(JSON.stringify(report, null, 2));
  await db.end();
}

main().catch(async error => {
  console.error("Impossible d'analyser les images produit:", error.message);
  try {
    await db.end();
  } catch {}
  process.exit(1);
});
