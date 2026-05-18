const buckets = new Map();
const { logSecurityEvent } = require("../services/security-log.service");

function now() {
  return Date.now();
}

function cleanupBucket(bucket, currentTime) {
  if (!bucket) return null;

  if (bucket.blockedUntil && bucket.blockedUntil <= currentTime) {
    bucket.blockedUntil = 0;
    bucket.hits = [];
  }

  bucket.hits = bucket.hits.filter(timestamp => currentTime - timestamp < bucket.windowMs);
  return bucket;
}

function buildKey(req, keyFactory) {
  try {
    const customKey = keyFactory?.(req);
    if (customKey) {
      return String(customKey).trim().toLowerCase();
    }
  } catch (error) {
    // Ignore custom key failures and fall back to IP.
  }

  return String(req.ip || req.headers["x-forwarded-for"] || "unknown").trim().toLowerCase();
}

function createRateLimiter({
  windowMs,
  maxHits,
  blockMs = 0,
  keyFactory,
  message = "Trop de tentatives. Reessaie un peu plus tard."
}) {
  return (req, res, next) => {
    const currentTime = now();
    const key = buildKey(req, keyFactory);
    const bucketKey = `${req.method}:${req.baseUrl || ""}${req.path}:${key}`;
    const bucket = cleanupBucket(
      buckets.get(bucketKey) || {
        hits: [],
        blockedUntil: 0,
        windowMs
      },
      currentTime
    );

    if (bucket.blockedUntil && bucket.blockedUntil > currentTime) {
      const retryAfterSeconds = Math.ceil((bucket.blockedUntil - currentTime) / 1000);
      res.setHeader("Retry-After", retryAfterSeconds);
      return res.status(429).json({ message });
    }

    bucket.hits.push(currentTime);

    if (bucket.hits.length > maxHits) {
      bucket.blockedUntil = blockMs ? currentTime + blockMs : currentTime + windowMs;
      buckets.set(bucketKey, bucket);
      const retryAfterSeconds = Math.ceil((bucket.blockedUntil - currentTime) / 1000);
      logSecurityEvent({
        eventType: "rate_limit_blocked",
        severity: "warning",
        email: req.body?.email || null,
        ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
        details: {
          path: req.path,
          method: req.method,
          key
        }
      });
      res.setHeader("Retry-After", retryAfterSeconds);
      return res.status(429).json({ message });
    }

    buckets.set(bucketKey, bucket);
    return next();
  };
}

module.exports = {
  createRateLimiter
};
