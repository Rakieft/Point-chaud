const db = require("../config/db");

function distributeStock(total, locationIds) {
  const safeTotal = Math.max(0, Number(total || 0));
  const ids = locationIds.map(Number);
  const base = Math.floor(safeTotal / ids.length);
  let remainder = safeTotal % ids.length;

  return ids.map(locationId => {
    const next = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    return {
      location_id: locationId,
      stock: next
    };
  });
}

function normalizeLocationStocks(rawStocks, locations, fallbackTotal = 0) {
  if (Array.isArray(rawStocks) && rawStocks.length) {
    const byLocation = new Map(
      rawStocks.map(item => [Number(item.location_id), Math.max(0, Number(item.stock || 0))])
    );

    return locations.map(location => ({
      location_id: Number(location.id),
      stock: byLocation.has(Number(location.id)) ? byLocation.get(Number(location.id)) : 0
    }));
  }

  if (rawStocks && typeof rawStocks === "object") {
    return locations.map(location => ({
      location_id: Number(location.id),
      stock: Math.max(0, Number(rawStocks[location.id] || rawStocks[String(location.id)] || 0))
    }));
  }

  return distributeStock(fallbackTotal, locations.map(location => location.id));
}

async function getLocations(connection = db) {
  const [locations] = await connection.query("SELECT id, name, address FROM locations ORDER BY id");
  return locations;
}

async function ensureLocationStockRows(connection, productId, fallbackTotal = 0) {
  const locations = await getLocations(connection);
  const [rows] = await connection.query("SELECT location_id, stock FROM product_stocks WHERE product_id = ?", [productId]);

  if (rows.length === locations.length) {
    return rows.map(row => ({
      location_id: Number(row.location_id),
      stock: Number(row.stock)
    }));
  }

  const normalized = normalizeLocationStocks(rows, locations, fallbackTotal);
  await setProductLocationStocks(connection, productId, normalized);
  return normalized;
}

async function setProductLocationStocks(connection, productId, rawStocks) {
  const locations = await getLocations(connection);
  const normalized = normalizeLocationStocks(rawStocks, locations);

  await connection.query("DELETE FROM product_stocks WHERE product_id = ?", [productId]);

  for (const item of normalized) {
    await connection.query(
      "INSERT INTO product_stocks (product_id, location_id, stock) VALUES (?, ?, ?)",
      [productId, item.location_id, item.stock]
    );
  }

  await syncProductTotalStock(connection, productId);
  return normalized;
}

async function syncProductTotalStock(connection, productId) {
  const [[row]] = await connection.query(
    "SELECT COALESCE(SUM(stock), 0) AS total FROM product_stocks WHERE product_id = ?",
    [productId]
  );

  await connection.query("UPDATE products SET stock = ? WHERE id = ?", [Number(row.total || 0), productId]);
  return Number(row.total || 0);
}

async function syncProductTotalStocks(connection, productIds) {
  const ids = [...new Set(productIds.map(Number).filter(Boolean))];
  for (const productId of ids) {
    await syncProductTotalStock(connection, productId);
  }
}

async function fetchLocationStocksForProducts(connection, productIds) {
  if (!productIds.length) {
    return new Map();
  }

  const [rows] = await connection.query(
    `
      SELECT
        ps.product_id,
        ps.location_id,
        ps.stock,
        l.name AS location_name
      FROM product_stocks ps
      INNER JOIN locations l ON l.id = ps.location_id
      WHERE ps.product_id IN (${productIds.map(() => "?").join(",")})
      ORDER BY ps.product_id, ps.location_id
    `,
    productIds
  );

  const map = new Map();
  for (const row of rows) {
    const productId = Number(row.product_id);
    const current = map.get(productId) || [];
    current.push({
      location_id: Number(row.location_id),
      location_name: row.location_name,
      stock: Number(row.stock)
    });
    map.set(productId, current);
  }

  return map;
}

module.exports = {
  distributeStock,
  ensureLocationStockRows,
  fetchLocationStocksForProducts,
  getLocations,
  normalizeLocationStocks,
  setProductLocationStocks,
  syncProductTotalStock,
  syncProductTotalStocks
};
