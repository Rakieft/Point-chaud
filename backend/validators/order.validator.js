exports.validateOrderPayload = payload => {
  if (!payload.location_id || !payload.pickup_date || !payload.pickup_time) {
    return {
      isValid: false,
      message: "Lieu et horaire de recuperation sont obligatoires"
    };
  }

  if (payload.order_type === "delivery" && !payload.delivery_address) {
    return {
      isValid: false,
      message: "L'adresse de livraison est obligatoire pour une commande en livraison"
    };
  }

  if (!Array.isArray(payload.items) || !payload.items.length) {
    return {
      isValid: false,
      message: "Ajoutez au moins un produit dans le panier"
    };
  }

  const hasInvalidItem = payload.items.some(
    item =>
      !item.product_id ||
      !Number.isInteger(Number(item.quantity)) ||
      Number(item.quantity) <= 0
  );

  if (hasInvalidItem) {
    return {
      isValid: false,
      message: "Le panier contient des produits invalides"
    };
  }

  return { isValid: true };
};
