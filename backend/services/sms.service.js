let cachedTwilioClient = null;
let twilioLoadAttempted = false;

function normalizePhone(phone) {
  if (!phone) return null;

  const trimmed = String(phone).trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("+")) {
    return trimmed;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("509")) {
    return `+${digits}`;
  }

  if (digits.length === 8) {
    return `+509${digits}`;
  }

  return `+${digits}`;
}

function getSmsConfig() {
  return {
    provider: (process.env.SMS_PROVIDER || "simulation").toLowerCase(),
    from: process.env.SMS_FROM || process.env.TWILIO_PHONE_NUMBER || "",
    twilioSid: process.env.TWILIO_ACCOUNT_SID || "",
    twilioToken: process.env.TWILIO_AUTH_TOKEN || ""
  };
}

function getTwilioClient() {
  if (cachedTwilioClient) {
    return cachedTwilioClient;
  }

  if (twilioLoadAttempted) {
    return null;
  }

  twilioLoadAttempted = true;

  try {
    // Optional dependency: installed when the project is ready for real SMS sending.
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const twilio = require("twilio");
    const config = getSmsConfig();

    if (!config.twilioSid || !config.twilioToken) {
      return null;
    }

    cachedTwilioClient = twilio(config.twilioSid, config.twilioToken);
    return cachedTwilioClient;
  } catch (error) {
    console.warn("[SMS] Module Twilio non disponible. Mode simulation conserve.");
    return null;
  }
}

async function sendWithTwilio(phone, message) {
  const client = getTwilioClient();
  const config = getSmsConfig();

  if (!client || !config.from) {
    return {
      delivered: false,
      mode: "simulation",
      reason: "twilio_not_ready"
    };
  }

  await client.messages.create({
    body: message,
    from: config.from,
    to: phone
  });

  return {
    delivered: true,
    mode: "twilio"
  };
}

async function sendSmsNotification(phone, message) {
  const target = normalizePhone(phone);
  const config = getSmsConfig();

  if (!target) {
    console.log(`[SMS simulation] numero non fourni: ${message}`);
    return {
      delivered: false,
      mode: "simulation",
      reason: "missing_phone"
    };
  }

  if (config.provider !== "twilio") {
    console.log(`[SMS simulation] ${target}: ${message}`);
    return {
      delivered: false,
      mode: "simulation",
      reason: "provider_not_enabled"
    };
  }

  try {
    const result = await sendWithTwilio(target, message);

    if (result.mode === "simulation") {
      console.log(`[SMS simulation] ${target}: ${message}`);
    }

    return result;
  } catch (error) {
    console.error(`[SMS] Echec Twilio vers ${target}: ${error.message}`);
    console.log(`[SMS fallback] ${target}: ${message}`);
    return {
      delivered: false,
      mode: "simulation",
      reason: "send_failed",
      error: error.message
    };
  }
}

function getSmsProviderStatus() {
  const config = getSmsConfig();
  const ready =
    config.provider === "twilio" && Boolean(config.from && config.twilioSid && config.twilioToken && getTwilioClient());

  return {
    provider: config.provider,
    ready,
    from: config.from || null
  };
}

module.exports = {
  normalizePhone,
  sendSmsNotification,
  getSmsProviderStatus
};
