const QRCode = require("qrcode");

exports.generateQrPayload = async (token, orderId) => {
  const payload = JSON.stringify({
    type: "point-chaud-order",
    orderId,
    token
  });

  const image = await QRCode.toDataURL(payload);

  return {
    token,
    payload,
    image
  };
};
