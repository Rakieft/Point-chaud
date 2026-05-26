const db = require("../config/db");
const {
  __monthlyAuditInternals
} = require("../controllers/user.controller");

const monthlyAuditState = {
  startedAt: null,
  nextRunAt: null,
  lastRunAt: null,
  lastResult: null,
  running: false,
  timer: null
};

function getIntervalHours() {
  const parsed = Number(process.env.MONTHLY_AUDIT_CHECK_INTERVAL_HOURS || 6);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 6;
}

function getHaitiNowParts() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Port-au-Prince",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return Object.fromEntries(formatter.formatToParts(new Date()).map(part => [part.type, part.value]));
}

async function listLocations() {
  const [rows] = await db.query(
    `
      SELECT id, name
      FROM locations
      ORDER BY name
    `
  );
  return rows.map(row => ({
    id: Number(row.id),
    name: row.name
  }));
}

async function generateMonthlyAuditSnapshots() {
  if (!__monthlyAuditInternals) {
    throw new Error("Les outils internes du rapport mensuel sont indisponibles.");
  }

  const {
    getPreviousMonthSnapshot,
    normalizeAuditPeriod,
    computeMonthlyAuditReport,
    storeMonthlyAudit
  } = __monthlyAuditInternals;

  const parts = getHaitiNowParts();
  if (Number(parts.day) !== 1) {
    return {
      skipped: true,
      reason: "Le generateur automatique s'execute uniquement le 1er du mois en heure Haiti."
    };
  }

  const previousMonth = getPreviousMonthSnapshot();
  const period = normalizeAuditPeriod(previousMonth);
  const locations = await listLocations();
  const generated = [];

  const globalActor = { id: null, role: "admin", assigned_location_name: "Reseau complet" };
  const globalPayload = await computeMonthlyAuditReport(globalActor, period);
  const globalSnapshot = await storeMonthlyAudit(globalActor, period, globalPayload);
  generated.push({
    scope: "global",
    period: globalPayload.period.label,
    snapshot_id: globalSnapshot?.id || null
  });

  for (const location of locations) {
    const actor = {
      id: null,
      role: "manager",
      assigned_location_id: location.id,
      assigned_location_name: location.name
    };
    const payload = await computeMonthlyAuditReport(actor, period);
    const snapshot = await storeMonthlyAudit(actor, period, payload);
    generated.push({
      scope: "location",
      location_id: location.id,
      location_name: location.name,
      snapshot_id: snapshot?.id || null
    });
  }

  return {
    skipped: false,
    generated
  };
}

async function runMonthlyAuditScheduler() {
  if (monthlyAuditState.running) {
    return monthlyAuditState.lastResult;
  }

  monthlyAuditState.running = true;

  try {
    const result = await generateMonthlyAuditSnapshots();
    monthlyAuditState.lastRunAt = new Date().toISOString();
    monthlyAuditState.lastResult = result;
    return result;
  } catch (error) {
    monthlyAuditState.lastRunAt = new Date().toISOString();
    monthlyAuditState.lastResult = { skipped: false, error: error.message };
    throw error;
  } finally {
    monthlyAuditState.running = false;
  }
}

function scheduleNextRun() {
  const intervalMs = getIntervalHours() * 60 * 60 * 1000;
  monthlyAuditState.nextRunAt = new Date(Date.now() + intervalMs).toISOString();

  monthlyAuditState.timer = setTimeout(async () => {
    try {
      await runMonthlyAuditScheduler();
    } catch (error) {
      console.error("[MONTHLY AUDIT] Erreur pendant la generation automatique:", error.message);
    } finally {
      scheduleNextRun();
    }
  }, intervalMs);
}

function startMonthlyAuditScheduler() {
  if (monthlyAuditState.timer) {
    return monthlyAuditState;
  }

  monthlyAuditState.startedAt = new Date().toISOString();

  runMonthlyAuditScheduler()
    .catch(error => {
      console.error("[MONTHLY AUDIT] Erreur au demarrage:", error.message);
    })
    .finally(() => {
      scheduleNextRun();
    });

  return monthlyAuditState;
}

module.exports = {
  startMonthlyAuditScheduler,
  runMonthlyAuditScheduler
};
