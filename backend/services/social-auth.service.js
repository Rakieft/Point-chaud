const { OAuth2Client } = require("google-auth-library");

const googleClient = process.env.GOOGLE_CLIENT_ID ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID) : null;
let appleJosePromise = null;
let appleJwks = null;

function getAppleJose() {
  if (!appleJosePromise) {
    appleJosePromise = import("jose");
  }

  return appleJosePromise;
}

async function verifyGoogleToken(idToken) {
  if (!process.env.GOOGLE_CLIENT_ID || !googleClient) {
    throw new Error("La connexion Google n'est pas configuree");
  }

  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID
  });

  const payload = ticket.getPayload();
  if (!payload?.email) {
    throw new Error("Le compte Google ne contient pas d'email exploitable");
  }

  return {
    provider: "google",
    subject: payload.sub,
    email: payload.email,
    emailVerified: Boolean(payload.email_verified),
    name: payload.name || payload.given_name || payload.email.split("@")[0]
  };
}

async function verifyAppleToken(idToken) {
  if (!process.env.APPLE_CLIENT_ID) {
    throw new Error("La connexion Apple n'est pas configuree");
  }

  const { createRemoteJWKSet, jwtVerify } = await getAppleJose();

  if (!appleJwks) {
    appleJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
  }

  const { payload } = await jwtVerify(idToken, appleJwks, {
    issuer: "https://appleid.apple.com",
    audience: process.env.APPLE_CLIENT_ID
  });

  if (!payload?.email) {
    throw new Error("Le compte Apple ne contient pas d'email exploitable");
  }

  return {
    provider: "apple",
    subject: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
    name: payload.name || payload.email.split("@")[0]
  };
}

async function verifySocialIdentity(provider, idToken) {
  if (!idToken) {
    throw new Error("Le token social est obligatoire");
  }

  if (provider === "google") {
    return verifyGoogleToken(idToken);
  }

  if (provider === "apple") {
    return verifyAppleToken(idToken);
  }

  throw new Error("Fournisseur social non pris en charge");
}

module.exports = {
  verifySocialIdentity
};
