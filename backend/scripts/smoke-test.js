const fs = require("fs/promises");
const path = require("path");

const base = process.env.SMOKE_BASE_URL || "http://localhost:5000/api";

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

async function main() {
  const adminToken = await login("kieftraphterjoly@gmail.com", "admin123");
  const clientToken = await login("client@pointchaud.com", "client123");
  const managerToken = await login("manager@pointchaud.com", "manager123");
  const routeManagerToken = await login("route.manager@pointchaud.com", "manager123");
  const driverToken = await login("driver.delmas@pointchaud.com", "manager123");

  const delmasCatalogBefore = await request("/products?location_id=3");
  const routeCatalogBefore = await request("/products?location_id=1");
  const pickupProductBefore = delmasCatalogBefore.products.find(product => product.name === "Pain chaud");
  const routePickupBefore = routeCatalogBefore.products.find(product => product.name === "Pain chaud");
  const deliveryProductBefore = delmasCatalogBefore.products.find(product => product.name === "Pate poulet");

  if (!pickupProductBefore || !deliveryProductBefore || !routePickupBefore) {
    throw new Error("Produits de smoke test introuvables");
  }

  const proofPath = path.join(__dirname, "payment-proof-test.txt");
  await fs.writeFile(proofPath, "proof for smoke test");
  const proofBlob = new Blob([await fs.readFile(proofPath)], { type: "text/plain" });

  const pickupCreate = await request("/orders", {
    method: "POST",
    token: clientToken,
    json: {
      location_id: 3,
      pickup_date: "2026-05-02",
      pickup_time: "09:30:00",
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
      pickup_date: "2026-05-02",
      pickup_time: "11:15:00",
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
    json: { delivery_status: "delivered" }
  });

  const rejectedCreate = await request("/orders", {
    method: "POST",
    token: clientToken,
    json: {
      location_id: 3,
      pickup_date: "2026-05-03",
      pickup_time: "08:10:00",
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
      delmasBeforePainChaud: pickupProductBefore.location_stock,
      delmasAfterPainChaud: pickupProductAfter.location_stock,
      routeBeforePainChaud: routePickupBefore.location_stock,
      routeAfterPainChaud: routePickupAfter.location_stock,
      delmasBeforePatePoulet: deliveryProductBefore.location_stock,
      delmasAfterPatePoulet: deliveryProductAfter.location_stock
    },
    pickup: {
      orderId: pickupCreate.order.id,
      crossBranchStatus,
      validatedStatus: pickupValidated.order.status,
      qrPresent: Boolean(paidPickupOrder.qr_code_token),
      finalStatus: pickupScanned.order.status
    },
    delivery: {
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
