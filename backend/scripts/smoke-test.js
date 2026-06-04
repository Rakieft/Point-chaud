const fs = require("fs/promises");
const path = require("path");

const base = process.env.SMOKE_BASE_URL || "http://localhost:5000/api";
const HAITI_TIMEZONE = "America/Port-au-Prince";
const ORDER_CUTOFF_HOUR = 20;
const ORDER_CUTOFF_MINUTE = 45;
const ORDER_MIN_LEAD_MINUTES = 5;

async function request(pathname, { method = "GET", token, json, form } = {}) {
  const headers = {};
  let body;

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (json) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  } else if (form) {
    body = form;
  }

  const response = await fetch(`${base}${pathname}`, {
    method,
    headers,
    body
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || `HTTP ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

async function login(email, password) {
  const data = await request("/auth/login", {
    method: "POST",
    json: { email, password }
  });

  return data.token;
}

function getHaitiNowSnapshot() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: HAITI_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });

  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map(part => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute)
  };
}

function addDaysToDateString(dateString, daysToAdd) {
  const [year, month, day] = String(dateString || "")
    .split("-")
    .map(Number);
  const safeDate = new Date(Date.UTC(year, (month || 1) - 1, day || 1, 0, 0, 0));
  safeDate.setUTCDate(safeDate.getUTCDate() + Number(daysToAdd || 0));
  return safeDate.toISOString().slice(0, 10);
}

function buildUpcomingSchedule(offsetMinutes = 0) {
  const now = getHaitiNowSnapshot();
  const totalMinutesNow = now.hour * 60 + now.minute;
  const requestedMinutes = totalMinutesNow + ORDER_MIN_LEAD_MINUTES + Number(offsetMinutes || 0);
  const cutoffMinutes = ORDER_CUTOFF_HOUR * 60 + ORDER_CUTOFF_MINUTE;

  if (requestedMinutes <= cutoffMinutes) {
    const hours = String(Math.floor(requestedMinutes / 60)).padStart(2, "0");
    const minutes = String(requestedMinutes % 60).padStart(2, "0");
    return {
      pickup_date: now.date,
      pickup_time: `${hours}:${minutes}:00`
    };
  }

  return {
    pickup_date: addDaysToDateString(now.date, 1),
    pickup_time: "09:00:00"
  };
}

function selectAvailableProduct(products, { excludeIds = [], minStock = 1 } = {}) {
  return products.find(product => {
    const stock = Number(product.location_stock ?? product.stock ?? 0);
    return stock >= minStock && !excludeIds.includes(Number(product.id));
  });
}

async function main() {
  const adminToken = await login("kieftraphterjoly@gmail.com", "admin123");
  const clientToken = await login("client@pointchaud.com", "client123");
  const managerToken = await login("manager@pointchaud.com", "manager123");
  const routeManagerToken = await login("route.manager@pointchaud.com", "manager123");
  const driverToken = await login("driver.delmas@pointchaud.com", "manager123");
  const pickupSchedule = buildUpcomingSchedule(0);
  const deliverySchedule = buildUpcomingSchedule(45);
  const rejectedSchedule = buildUpcomingSchedule(90);

  const delmasCatalogBefore = await request("/products?location_id=3");
  const routeCatalogBefore = await request("/products?location_id=1");
  const pickupProductBefore = selectAvailableProduct(delmasCatalogBefore.products, { minStock: 2 });
  const routePickupBefore = selectAvailableProduct(routeCatalogBefore.products, { minStock: 1 });
  const deliveryProductBefore =
    selectAvailableProduct(delmasCatalogBefore.products, {
      excludeIds: [Number(pickupProductBefore?.id)],
      minStock: 2
    }) || pickupProductBefore;

  if (!pickupProductBefore || !deliveryProductBefore || !routePickupBefore) {
    throw new Error("Produits de smoke test introuvables");
  }

  const proofPath = path.join(__dirname, "payment-proof-test.png");
  const tinyPngBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=",
    "base64"
  );
  await fs.writeFile(proofPath, tinyPngBytes);
  const proofBlob = new Blob([await fs.readFile(proofPath)], { type: "image/png" });

  const pickupCreate = await request("/orders", {
    method: "POST",
    token: clientToken,
    json: {
      location_id: 3,
      pickup_date: pickupSchedule.pickup_date,
      pickup_time: pickupSchedule.pickup_time,
      notes: "Smoke pickup",
      order_type: "pickup",
      items: [{ product_id: pickupProductBefore.id, quantity: 1 }]
    }
  });

  let crossBranchStatus = null;
  try {
    await request(`/orders/${pickupCreate.order.id}/validate`, {
      method: "PATCH",
      token: routeManagerToken,
      json: { action: "validate" }
    });
  } catch (error) {
    crossBranchStatus = error.status;
  }

  const pickupValidated = await request(`/orders/${pickupCreate.order.id}/validate`, {
    method: "PATCH",
    token: managerToken,
    json: { action: "validate" }
  });

  const pickupForm = new FormData();
  pickupForm.set("payment_method", "moncash");
  pickupForm.set("transaction_reference", "SMOKE-PICKUP-001");
  pickupForm.set("proof", proofBlob, "payment-proof-test.png");

  await request(`/payments/${pickupCreate.order.id}/proof`, {
    method: "POST",
    token: clientToken,
    form: pickupForm
  });

  await request(`/payments/${pickupCreate.order.id}/confirm`, {
    method: "PATCH",
    token: managerToken,
    json: { action: "confirm" }
  });

  const clientOrdersAfterPickup = await request("/orders/my", { token: clientToken });
  const paidPickupOrder = clientOrdersAfterPickup.find(order => order.id === pickupCreate.order.id);

  const pickupScanned = await request(`/orders/scan/${paidPickupOrder.qr_code_token}`, {
    method: "POST",
    token: managerToken
  });

  const deliveryCreate = await request("/orders", {
    method: "POST",
    token: clientToken,
    json: {
      location_id: 3,
      pickup_date: deliverySchedule.pickup_date,
      pickup_time: deliverySchedule.pickup_time,
      notes: "Smoke delivery",
      order_type: "delivery",
      delivery_address: "12 Rue Clerveaux, Delmas",
      delivery_zone: "Delmas 75",
      items: [{ product_id: deliveryProductBefore.id, quantity: 1 }]
    }
  });

  await request(`/orders/${deliveryCreate.order.id}/validate`, {
    method: "PATCH",
    token: managerToken,
    json: { action: "validate" }
  });

  const deliveryForm = new FormData();
  deliveryForm.set("payment_method", "natcash");
  deliveryForm.set("transaction_reference", "SMOKE-DELIVERY-001");
  deliveryForm.set("proof", proofBlob, "payment-proof-test.png");

  await request(`/payments/${deliveryCreate.order.id}/proof`, {
    method: "POST",
    token: clientToken,
    form: deliveryForm
  });

  const deliveryConfirmed = await request(`/payments/${deliveryCreate.order.id}/confirm`, {
    method: "PATCH",
    token: managerToken,
    json: { action: "confirm" }
  });

  const deliveryOrdersAfterConfirm = await request("/orders/deliveries", { token: managerToken });
  const deliveryAfterConfirm = deliveryOrdersAfterConfirm.find(order => order.id === deliveryCreate.order.id);

  const drivers = await request("/users/drivers", { token: adminToken });
  const delmasDriver = drivers.find(driver => driver.email === "driver.delmas@pointchaud.com");
  if (!delmasDriver) {
    throw new Error("Livreur Delmas introuvable");
  }

  const assigned = await request(`/orders/${deliveryCreate.order.id}/assign-driver`, {
    method: "PATCH",
    token: managerToken,
    json: { driver_id: delmasDriver.id }
  });

  await request(`/orders/${deliveryCreate.order.id}/delivery-status`, {
    method: "PATCH",
    token: driverToken,
    json: { delivery_status: "out_for_delivery" }
  });

  const delivered = await request(`/orders/${deliveryCreate.order.id}/delivery-status`, {
    method: "PATCH",
    token: driverToken,
    json: {
      delivery_status: "delivered",
      signature_name: "Client Smoke Test",
      signature_data:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII="
    }
  });

  const rejectedCreate = await request("/orders", {
    method: "POST",
    token: clientToken,
    json: {
      location_id: 3,
      pickup_date: rejectedSchedule.pickup_date,
      pickup_time: rejectedSchedule.pickup_time,
      notes: "Smoke reject",
      order_type: "pickup",
      items: [{ product_id: pickupProductBefore.id, quantity: 1 }]
    }
  });

  await request(`/orders/${rejectedCreate.order.id}/validate`, {
    method: "PATCH",
    token: managerToken,
    json: { action: "reject" }
  });

  const pendingOrders = await request("/orders?group=pending", { token: managerToken });
  const validatedOrders = await request("/orders?group=validated", { token: managerToken });

  const delmasCatalogAfter = await request("/products?location_id=3");
  const routeCatalogAfter = await request("/products?location_id=1");
  const pickupProductAfter = delmasCatalogAfter.products.find(product => product.id === pickupProductBefore.id);
  const routePickupAfter = routeCatalogAfter.products.find(product => product.id === routePickupBefore.id);
  const deliveryProductAfter = delmasCatalogAfter.products.find(product => product.id === deliveryProductBefore.id);

  const result = {
    auth: {
      admin: Boolean(adminToken),
      client: Boolean(clientToken),
      manager: Boolean(managerToken),
      routeManager: Boolean(routeManagerToken),
      driver: Boolean(driverToken)
    },
    stockByLocation: {
      delmasBeforePickup: pickupProductBefore.location_stock,
      delmasAfterPickup: pickupProductAfter.location_stock,
      routeBeforePickup: routePickupBefore.location_stock,
      routeAfterPickup: routePickupAfter.location_stock,
      delmasBeforeDelivery: deliveryProductBefore.location_stock,
      delmasAfterDelivery: deliveryProductAfter.location_stock
    },
    pickup: {
      product: pickupProductBefore.name,
      orderId: pickupCreate.order.id,
      crossBranchStatus,
      validatedStatus: pickupValidated.order.status,
      qrPresent: Boolean(paidPickupOrder.qr_code_token),
      finalStatus: pickupScanned.order.status
    },
    delivery: {
      product: deliveryProductBefore.name,
      orderId: deliveryCreate.order.id,
      confirmMessage: deliveryConfirmed.message,
      confirmStatus: deliveryAfterConfirm?.status || null,
      confirmDeliveryStatus: deliveryAfterConfirm?.delivery_status || null,
      assignedDriver: assigned.order.driver_name,
      deliveredStatus: delivered.order.delivery_status,
      finalOrderStatus: delivered.order.status
    },
    rejection: {
      orderId: rejectedCreate.order.id,
      pendingContainsRejected: pendingOrders.some(order => order.id === rejectedCreate.order.id),
      validatedContainsRejected: validatedOrders.some(order => order.id === rejectedCreate.order.id),
      rejectedOrder: validatedOrders.find(order => order.id === rejectedCreate.order.id) || null
    }
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
