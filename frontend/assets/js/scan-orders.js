let readyOrdersCache = [];
let scanVideoStream = null;
let scanAnimationFrame = null;
let barcodeDetector = null;
let qrScannerInstance = null;

function setCameraStatus(message, type = "info") {
  const status = document.getElementById("camera-status");
  if (!status) return;
  status.textContent = message;
  status.className = type === "error" ? "message-inline error" : "muted";
}

function extractTokenFromScan(rawValue) {
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue);
    return parsed?.token || rawValue;
  } catch (error) {
    return rawValue;
  }
}

function renderReadyOrders(orders) {
  const container = document.getElementById("scan-ready-list");
  if (!container) return;

  const readyOrders = orders.filter(order => order.status === "paid" && order.order_type !== "delivery" && order.qr_code_token);

  container.innerHTML = readyOrders.length
    ? readyOrders
        .map(
          order => `
            <article class="admin-payment-card">
              <div class="admin-payment-card-head">
                <div>
                  <strong>Commande #${order.id}</strong>
                  <p>${order.customer_name} - ${order.location_name}</p>
                </div>
                <span class="status paid">Prete</span>
              </div>

              <div class="stack-sm">
                <span>Retrait: ${formatDateTime(order.pickup_date, order.pickup_time)}</span>
                <span>Total: ${formatMoney(order.total)}</span>
                <span>Token: ${order.qr_code_token}</span>
              </div>

              <div class="admin-action-group">
                <button class="btn-primary" onclick="submitScanToken('${order.qr_code_token}')">Scanner maintenant</button>
                <button class="btn-light" onclick="openBackofficeOrderDetailByToken('${order.qr_code_token}')">Voir details</button>
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state"><p>Aucune commande QR prete au retrait.</p></div>`;
}

function openBackofficeOrderDetailByToken(token) {
  const order = readyOrdersCache.find(item => item.qr_code_token === token);
  openBackofficeOrderDetail(order);
}

async function submitScanToken(token) {
  try {
    const safeToken = extractTokenFromScan(token);
    const data = await apiRequest(`/orders/scan/${safeToken}`, { method: "POST" });
    showMessage("scan-message", "success", data.message);
    stopCameraScan();
    document.getElementById("scan-token-input")?.focus();
    window.dispatchEvent(new CustomEvent("pointchaud:scan-success", { detail: data }));
    renderScanPage();
  } catch (error) {
    showMessage("scan-message", "error", error.message);
    document.getElementById("scan-token-input")?.focus();
  }
}

function bindScanForm() {
  const form = document.getElementById("scan-form");
  if (!form) return;

  form.addEventListener("submit", async event => {
    event.preventDefault();
    await submitScanToken(form.token.value.trim());
    form.reset();
    document.getElementById("scan-token-input")?.focus();
  });
}

async function detectQrLoop() {
  if (!barcodeDetector || !scanVideoStream) return;

  const video = document.getElementById("qr-video");
  if (!video || video.readyState < 2) {
    scanAnimationFrame = requestAnimationFrame(detectQrLoop);
    return;
  }

  try {
    const barcodes = await barcodeDetector.detect(video);
    if (barcodes.length) {
      const token = extractTokenFromScan(barcodes[0].rawValue);
      if (token) {
        const input = document.getElementById("scan-token-input");
        if (input) {
          input.value = token;
        }
        setCameraStatus("QR detecte. Validation en cours...");
        await submitScanToken(token);
        return;
      }
    }
  } catch (error) {
    setCameraStatus("Impossible de lire le flux camera pour le moment.", "error");
  }

  scanAnimationFrame = requestAnimationFrame(detectQrLoop);
}

async function startCameraScan() {
  if (!("mediaDevices" in navigator) || !navigator.mediaDevices.getUserMedia) {
    setCameraStatus("Cette camera n'est pas disponible sur cet appareil ou ce navigateur.", "error");
    return;
  }

  const video = document.getElementById("qr-video");
  if (!video) return;

  try {
    if (window.QrScanner) {
      stopCameraScan();
      window.QrScanner.WORKER_PATH = "../assets/vendor/qr-scanner-worker.min.js";
      qrScannerInstance = new window.QrScanner(
        video,
        async result => {
          const rawValue = typeof result === "string" ? result : result?.data;
          const token = extractTokenFromScan(rawValue);
          if (!token) return;

          const input = document.getElementById("scan-token-input");
          if (input) input.value = token;
          setCameraStatus("QR detecte. Validation en cours...");
          await submitScanToken(token);
        },
        {
          returnDetailedScanResult: true,
          highlightScanRegion: true,
          highlightCodeOutline: true,
          preferredCamera: "environment"
        }
      );

      await qrScannerInstance.start();
      setCameraStatus("Camera active avec le lecteur QR principal.");
      return;
    }

    if (!("BarcodeDetector" in window)) {
      setCameraStatus("Le navigateur ne prend pas encore en charge le scan QR natif. Utilise le champ manuel ou une douchette USB.", "error");
      return;
    }

    const formats = await window.BarcodeDetector.getSupportedFormats();
    if (!formats.includes("qr_code")) {
      setCameraStatus("Le lecteur QR natif n'est pas disponible ici. Utilise le champ manuel si besoin.", "error");
      return;
    }

    barcodeDetector = new window.BarcodeDetector({ formats: ["qr_code"] });
    scanVideoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });

    video.srcObject = scanVideoStream;
    await video.play();
    setCameraStatus("Camera active. Place le QR dans le cadre.");

    if (scanAnimationFrame) {
      cancelAnimationFrame(scanAnimationFrame);
    }
    scanAnimationFrame = requestAnimationFrame(detectQrLoop);
  } catch (error) {
    setCameraStatus("Autorisation camera refusee ou camera indisponible.", "error");
  }
}

function stopCameraScan() {
  if (qrScannerInstance) {
    qrScannerInstance.stop();
    qrScannerInstance.destroy();
    qrScannerInstance = null;
  }

  if (scanAnimationFrame) {
    cancelAnimationFrame(scanAnimationFrame);
    scanAnimationFrame = null;
  }

  if (scanVideoStream) {
    scanVideoStream.getTracks().forEach(track => track.stop());
    scanVideoStream = null;
  }

  const video = document.getElementById("qr-video");
  if (video) {
    video.srcObject = null;
  }

  setCameraStatus("La camera est arretee.");
}

function bindCameraScan() {
  document.getElementById("start-camera-scan")?.addEventListener("click", startCameraScan);
  document.getElementById("stop-camera-scan")?.addEventListener("click", stopCameraScan);
  window.addEventListener("beforeunload", stopCameraScan);
}

async function renderScanPage() {
  try {
    const user = await loadBackofficeUser();
    if (!user) return;
    if (user.role === "driver") {
      showMessage("scan-message", "error", "Le scan de retrait est reserve aux managers et admins");
      return;
    }

    const orders = await apiRequest("/orders?group=validated");
    readyOrdersCache = orders;
    renderReadyOrders(orders);
  } catch (error) {
    showMessage("scan-message", "error", error.message);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  bindScanForm();
  bindCameraScan();
  renderScanPage();
  if (!document.body.classList.contains("cashier-body")) {
    startLiveRefresh("scan-page", renderScanPage, 10000);
  }
  document.getElementById("scan-token-input")?.focus();
});
