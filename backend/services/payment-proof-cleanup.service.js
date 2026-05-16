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
  const parsed = Number(process.env.ORDER_RETENTION_DAYS || process.env.PROOF_RETENTION_DAYS || 90);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 90;
}

function getIntervalHours() {
  const parsed = Number(process.env.ORDER_CLEANUP_INTERVAL_HOURS || process.env.PROOF_CLEANUP_INTERVAL_HOURS || 24);
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

function getFinalizedOrderDateExpression() {
  return `
    COALESCE(
      customer_received_at,
      returned_at,
      delivered_at,
      confirmed_at,
      validated_at,
      created_at
    )
  `;
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

async function listOrderCleanupCandidates(retentionDays = getRetentionDays()) {
  const cutoffDate = getCutoffDate(retentionDays);
  const finalizedDateExpression = getFinalizedOrderDateExpression();

  const [rows] = await db.query(
    `
      SELECT
        id,
        status,
        delivery_status,
        payment_proof,
        created_at,
        validated_at,
        confirmed_at,
        delivered_at,
        returned_at,
        customer_received_at,
        ${finalizedDateExpression} AS finalized_at
      FROM orders
      WHERE status IN ('completed', 'cancelled')
        AND ${finalizedDateExpression} < ?
      ORDER BY ${finalizedDateExpression} ASC, id ASC
    `,
    [cutoffDate]
  );

  return rows;
}

function buildNotificationRegex(orderIds) {
  const uniqueIds = [...new Set(orderIds.map(id => Number(id)).filter(Number.isFinite))];
  if (!uniqueIds.length) return null;
  return `#(?:${uniqueIds.join("|")})([^0-9]|$)`;
}

async function getPaymentProofCleanupStats() {
  const retentionDays = getRetentionDays();
  const intervalHours = getIntervalHours();
  const cutoffDate = getCutoffDate(retentionDays);
  const finalizedDateExpression = getFinalizedOrderDateExpression();

  const [[orderCounts]] = await db.query(
    `
      SELECT
        COUNT(*) AS total_orders,
        SUM(CASE WHEN status IN ('pending_validation', 'validated', 'awaiting_payment', 'paid') THEN 1 ELSE 0 END) AS active_orders,
        SUM(CASE WHEN status IN ('completed', 'cancelled') THEN 1 ELSE 0 END) AS finalized_orders,
        SUM(CASE WHEN payment_proof IS NOT NULL AND payment_proof <> '' THEN 1 ELSE 0 END) AS proofs_referenced,
        SUM(
          CASE
            WHEN status IN ('completed', 'cancelled')
             AND ${finalizedDateExpression} < ?
            THEN 1
            ELSE 0
          END
        ) AS eligible_order_cleanup,
        SUM(
          CASE
            WHEN status IN ('completed', 'cancelled')
             AND payment_proof IS NOT NULL
             AND payment_proof <> ''
             AND ${finalizedDateExpression} < ?
            THEN 1
            ELSE 0
          END
        ) AS eligible_proof_cleanup
      FROM orders
    `,
    [cutoffDate, cutoffDate]
  );

  return {
    retentionDays,
    intervalHours,
    uploadPath: getUploadDir(),
    totalOrders: Number(orderCounts.total_orders || 0),
    activeOrders: Number(orderCounts.active_orders || 0),
    finalizedOrders: Number(orderCounts.finalized_orders || 0),
    proofsReferenced: Number(orderCounts.proofs_referenced || 0),
    eligibleOrderCleanup: Number(orderCounts.eligible_order_cleanup || 0),
    eligibleProofCleanup: Number(orderCounts.eligible_proof_cleanup || 0),
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

async function deletePaymentProofFile(uploadDir, proofPath) {
  const safeFilename = path.basename(proofPath || "");
  if (!safeFilename) {
    return { deleted: false, missing: false, failed: false, skipped: true, file: "" };
  }

  const absolutePath = path.join(uploadDir, safeFilename);

  try {
    await fs.unlink(absolutePath);
    return { deleted: true, missing: false, failed: false, skipped: false, file: safeFilename };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { deleted: false, missing: true, failed: false, skipped: false, file: safeFilename };
    }

    return {
      deleted: false,
      missing: false,
      failed: true,
      skipped: false,
      file: safeFilename,
      error: error.message
    };
  }
}

async function runPaymentProofCleanup(options = {}) {
  if (cleanupState.running) {
    return {
      alreadyRunning: true,
      message: "Un nettoyage automatique est deja en cours.",
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
    const candidates = await listOrderCleanupCandidates(retentionDays);
    const orderIdsToDelete = [];
    const failures = [];
    let filesDeleted = 0;
    let filesMissing = 0;
    let filesFailed = 0;

    for (const order of candidates) {
      if (order.payment_proof) {
        const fileResult = await deletePaymentProofFile(uploadDir, order.payment_proof);

        if (fileResult.deleted) {
          filesDeleted += 1;
        } else if (fileResult.missing) {
          filesMissing += 1;
        } else if (fileResult.failed) {
          filesFailed += 1;
          failures.push({ orderId: Number(order.id), file: fileResult.file, error: fileResult.error });
          continue;
        }
      }

      orderIdsToDelete.push(Number(order.id));
    }

    let notificationsDeleted = 0;
    let ordersDeleted = 0;
    let orderItemsDeleted = 0;

    if (orderIdsToDelete.length) {
      const connection = await db.getConnection();

      try {
        await connection.beginTransaction();

        const notificationRegex = buildNotificationRegex(orderIdsToDelete);
        if (notificationRegex) {
          const [notificationResult] = await connection.query(
            `
              DELETE FROM notifications
              WHERE message REGEXP ?
            `,
            [notificationRegex]
          );
          notificationsDeleted = Number(notificationResult.affectedRows || 0);
        }

        const orderItemsPlaceholders = orderIdsToDelete.map(() => "?").join(", ");
        const [orderItemResult] = await connection.query(
          `
            DELETE FROM order_items
            WHERE order_id IN (${orderItemsPlaceholders})
          `,
          orderIdsToDelete
        );
        orderItemsDeleted = Number(orderItemResult.affectedRows || 0);

        const orderPlaceholders = orderIdsToDelete.map(() => "?").join(", ");
        const [orderResult] = await connection.query(
          `
            DELETE FROM orders
            WHERE id IN (${orderPlaceholders})
          `,
          orderIdsToDelete
        );
        ordersDeleted = Number(orderResult.affectedRows || 0);

        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    }

    const result = {
      trigger: options.trigger || "manual",
      startedAt,
      finishedAt: new Date().toISOString(),
      retentionDays,
      scannedOrders: candidates.length,
      deletedOrders: ordersDeleted,
      deletedOrderItems: orderItemsDeleted,
      deletedNotifications: notificationsDeleted,
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
      console.error("Erreur nettoyage automatique des commandes archivees:", error.message);
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
