exports.sendSmsNotification = (phone, message) => {
  const target = phone || "numero non fourni";
  console.log(`[SMS simulation] ${target}: ${message}`);
};
