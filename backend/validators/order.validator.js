function getHaitiNowSnapshot() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Port-au-Prince",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(new Date()).map(part => [part.type, part.value])
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`
  };
}

function addMinutesToDateTime(dateString, timeString, minutesToAdd) {
  const [year, month, day] = String(dateString || "")
    .split("-")
    .map(Number);
  const [hour, minute] = String(timeString || "")
    .split(":")
    .map(Number);

  const safeDate = new Date(Date.UTC(year, (month || 1) - 1, day || 1, hour || 0, minute || 0, 0));
  safeDate.setUTCMinutes(safeDate.getUTCMinutes() + Number(minutesToAdd || 0));

  const iso = safeDate.toISOString();
  return {
    date: iso.slice(0, 10),
    time: iso.slice(11, 16)
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

function validateOrderSchedule(dateString, timeString) {
  if (!dateString || !timeString) {
    return {
      isValid: false,
      message: "La date et l'heure de commande sont obligatoires"
    };
  }

  const haitiNow = getHaitiNowSnapshot();
  const closingCutoffTime = "20:45";
  const earliestSlot = addMinutesToDateTime(haitiNow.date, haitiNow.time, 5);
  const normalizedDate = String(dateString).slice(0, 10);
  const normalizedTime = String(timeString).slice(0, 5);

  if (normalizedDate < haitiNow.date) {
    return {
      isValid: false,
      message: "La date de commande doit etre aujourd'hui ou plus tard"
    };
  }

  if (normalizedDate > addDaysToDateString(haitiNow.date, 365)) {
    return {
      isValid: false,
      message: "La date de commande choisie est trop lointaine"
    };
  }

  if (normalizedTime > closingCutoffTime) {
    return {
      isValid: false,
      message: "Les commandes doivent etre programmees au plus tard a 8h45 PM"
    };
  }

  if (normalizedDate === haitiNow.date && normalizedTime < earliestSlot.time) {
    return {
      isValid: false,
      message: "Choisis une heure future pour aujourd'hui"
    };
  }

  if (normalizedDate === haitiNow.date && earliestSlot.time > closingCutoffTime) {
    return {
      isValid: false,
      message: "Les commandes du jour sont fermees apres 8h45 PM"
    };
  }

  return { isValid: true };
}

exports.validateOrderPayload = payload => {
  if (!payload.location_id || !payload.pickup_date || !payload.pickup_time) {
    return {
      isValid: false,
      message: "Lieu et horaire de recuperation sont obligatoires"
    };
  }

  const scheduleValidation = validateOrderSchedule(payload.pickup_date, payload.pickup_time);
  if (!scheduleValidation.isValid) {
    return scheduleValidation;
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

exports.validateOrderSchedule = validateOrderSchedule;
