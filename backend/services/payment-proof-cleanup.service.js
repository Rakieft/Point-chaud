const fs = require("fs/promises");
const path = require("path");
const db = require("../config/db");

const cleanupState = {
  startedAt: null,
  nextRunAt: null,
  lastRunAt: null,
  lastResult: null,
  running: false,
  timer: null
};

function getRetentionDays() {
  const parsed = Number(process.env.PROOF_RETENTION_DAYS || 90);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 90;
}

function getIntervalHours() {
  const parsed = Number(process.env.PROOF_CLEANUP_INTERVAL_HOURS || 24);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 24;
}

function getUploadDir() {
  return path.resolve(__dirname, "..", process.env.UPLOAD_PATH || "uploads");
}

function getCutoffDate(retentionDays = getRetentionDays()) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  return cutoff;
}

async function countFilesOnDisk() {
  try {
    const entries = await fs.readdir(getUploadDir(), { withFileTypes: true });
    return entries.filter(entry => entry.isFile()).length;
  } catch (error) {
    if (error.code === "ENOENT") return 0;
    throw error;
  }
}

async function listCleanupCandidates(retentionDays = getRetentionDays()) {
  const cutoffDate = getCutoffDate(retentionDays);
  const [rows] = await db.query(
    `
      SELECT
        id,
        payment_proof,
        status,
        payment_status,
        delivery_status,
        confirmed_at,
        created_at
      FROM orders
      WHERE payment_proof IS NOT NULL
        AND payment_proof <> ''
        AND COALESCE(confirmed_at, created_at) < ?
        AND (
          status IN ('completed', 'cancelled')
          OR delivery_status = 'delivered'
        )
      ORDER BY COALESCE(confirmed_at, created_at) ASC, id ASC
    `,
    [cutoffDate]
  );

  return rows;
}

async function getPaymentProofCleanupStats() {
  const retentionDays = getRetentionDays();
  const intervalHours = getIntervalHours();
  const cutoffDate = getCutoffDate(retentionDays);

  const [[orderCounts]] = await db.query(
    `
      SELECT
        SUM(CASE WHEN payment_proof IS NOT NULL AND payment_proof <> '' THEN 1 ELSE 0 END) AS proofs_referenced,
        SUM(
          CASE
            WHEN payment_proof IS NOT NULL
              AND payment_proof <> ''
              AND COALESCE(confirmed_at, created_at) < ?
              AND (status IN ('completed', 'cancelled') OR delivery_status = 'delivered')
            THEN 1
            ELSE 0
          END
        ) AS eligible_cleanup
      FROM orders
    `,
    [cutoffDate]
  );

  return {
    retentionDays,
    intervalHours,
    uploadPath: getUploadDir(),
    proofsReferenced: Number(orderCounts.proofs_referenced || 0),
    eligibleCleanup: Number(orderCounts.eligible_cleanup || 0),
    filesOnDisk: await countFilesOnDisk(),
    scheduler: {
      startedAt: cleanupState.startedAt,
      nextRunAt: cleanupState.nextRunAt,
      lastRunAt: cleanupState.lastRunAt,
      running: cleanupState.running,
      lastResult: cleanupState.lastResult
    }
  };
}

async function runPaymentProofCleanup(options = {}) {
  if (cleanupState.running) {
    return {
      alreadyRunning: true,
      message: "Un nettoyage des preuves est deja en cours.",
      scheduler: {
        startedAt: cleanupState.startedAt,
        nextRunAt: cleanupState.nextRunAt,
        lastRunAt: cleanupState.lastRunAt
      }
    };
  }

  cleanupState.running = true;
  const startedAt = new Date().toISOString();
  const retentionDays = getRetentionDays();
  const uploadDir = getUploadDir();

  try {
    const candidates = await listCleanupCandidates(retentionDays);
    let filesDeleted = 0;
    let filesMissing = 0;
    let filesFailed = 0;
    const cleanedOrderIds = [];
    const failures = [];

    for (const order of candidates) {
      const safeFilename = path.basename(order.payment_proof || "");
      if (!safeFilename) continue;

      const absolutePath = path.join(uploadDir, safeFilename);

      try {
        await fs.unlink(absolutePath);
        filesDeleted += 1;
      } catch (error) {
        if (error.code === "ENOENT") {
          filesMissing += 1;
        } else {
          filesFailed += 1;
          failures.push({ orderId: order.id, file: safeFilename, error: error.message });
          continue;
        }
      }

      cleanedOrderIds.push(Number(order.id));
    }

    if (cleanedOrderIds.length) {
      const placeholders = cleanedOrderIds.map(() => "?").join(", ");
      await db.query(
        `
          UPDATE orders
          SET payment_proof = NULL
          WHERE id IN (${placeholders})
        `,
        cleanedOrderIds
      );
    }

    const result = {
      trigger: options.trigger || "manual",
      startedAt,
      finishedAt: new Date().toISOString(),
      retentionDays,
      scannedOrders: candidates.length,
      cleanedOrders: cleanedOrderIds.length,
      filesDeleted,
      filesMissing,
      filesFailed,
      failures
    };

    cleanupState.lastRunAt = result.finishedAt;
    cleanupState.lastResult = result;

    return result;
  } finally {
    cleanupState.running = false;
  }
}

function startPaymentProofCleanupScheduler() {
  if (cleanupState.timer) {
    return cleanupState;
  }

  const intervalHours = getIntervalHours();
  const intervalMs = intervalHours * 60 * 60 * 1000;
  cleanupState.startedAt = new Date().toISOString();
  cleanupState.nextRunAt = new Date(Date.now() + intervalMs).toISOString();

  cleanupState.timer = setInterval(async () => {
    try {
      await runPaymentProofCleanup({ trigger: "automatic" });
    } catch (error) {
      cleanupState.lastRunAt = new Date().toISOString();
      cleanupState.lastResult = {
        trigger: "automatic",
        finishedAt: cleanupState.lastRunAt,
        error: error.message
      };
      console.error("Erreur nettoyage automatique des preuves:", error.message);
    } finally {
      cleanupState.nextRunAt = new Date(Date.now() + intervalMs).toISOString();
    }
  }, intervalMs);

  if (typeof cleanupState.timer.unref === "function") {
    cleanupState.timer.unref();
  }

  return cleanupState;
}

module.exports = {
  getPaymentProofCleanupStats,
  runPaymentProofCleanup,
  startPaymentProofCleanupScheduler
};
