const state = {
  documents: [],
  details: {},
  activeDocumentId: null,
};

const fileInput = document.getElementById("fileInput");
const documentList = document.getElementById("documentList");
const documentCount = document.getElementById("documentCount");
const overviewStats = document.getElementById("overviewStats");
const overviewSummary = document.getElementById("overviewSummary");
const soilReadingsCount = document.getElementById("soilReadingsCount");
const soilReadingsGrid = document.getElementById("soilReadingsGrid");
const cropName = document.getElementById("cropName");
const cropReason = document.getElementById("cropReason");
const cropAlternatives = document.getElementById("cropAlternatives");
const soilHealthLabel = document.getElementById("soilHealthLabel");
const soilHealthSummary = document.getElementById("soilHealthSummary");
const soilHealthScore = document.getElementById("soilHealthScore");
const fertilizerPlan = document.getElementById("fertilizerPlan");
const questionForm = document.getElementById("questionForm");
const questionInput = document.getElementById("questionInput");
const qaAnswer = document.getElementById("qaAnswer");
const qaSources = document.getElementById("qaSources");
const toastRegion = document.getElementById("toastRegion");
const errorBanner = document.getElementById("errorBanner");

fileInput.addEventListener("change", handleUpload);
documentList.addEventListener("click", handleDocumentSelect);
questionForm.addEventListener("submit", handleQuestionSubmit);

render();
void fetchDocuments();

function normalizeDocument(documentItem) {
  return {
    id: String(documentItem.id || documentItem.stored_name || documentItem.name || ""),
    name: String(documentItem.name || documentItem.filename || "Untitled.pdf"),
    size: Number(documentItem.size || 0),
    updated_at: documentItem.updated_at || new Date().toISOString(),
    chunk_count: Number(documentItem.chunk_count || 0),
    metric_count: Number(documentItem.metric_count || 0),
    out_of_range_count: Number(documentItem.out_of_range_count || 0),
  };
}

function normalizeDetail(documentItem) {
  const detail = normalizeDocument(documentItem);
  detail.page_count = Number(documentItem.page_count || 0);
  detail.summary = String(documentItem.summary || "No extracted summary available.");
  detail.soil_metrics = Array.isArray(documentItem.soil_metrics) ? documentItem.soil_metrics : [];
  detail.predictions = documentItem.predictions || {};
  return detail;
}

function getActiveDocument() {
  return state.documents.find((item) => item.id === state.activeDocumentId) || null;
}

function getActiveDetail() {
  return state.details[state.activeDocumentId] || null;
}

function render() {
  renderOverview();
  renderDocuments();
  renderValues();
  renderPredictions();
}

function renderOverview() {
  const active = getActiveDocument();
  const detail = getActiveDetail();

  if (!active || !detail) {
    overviewStats.innerHTML = `
      <div class="stat-card"><span>Documents</span><strong>${state.documents.length}</strong></div>
      <div class="stat-card"><span>Readings</span><strong>0</strong></div>
      <div class="stat-card"><span>Status</span><strong>Awaiting upload</strong></div>
    `;
    overviewSummary.textContent = "Upload or select a PDF report to see the extracted summary.";
    return;
  }

  overviewStats.innerHTML = `
    <div class="stat-card"><span>File</span><strong>${escapeHtml(active.name)}</strong></div>
    <div class="stat-card"><span>Size</span><strong>${formatBytes(active.size)}</strong></div>
    <div class="stat-card"><span>Pages</span><strong>${detail.page_count || "n/a"}</strong></div>
    <div class="stat-card"><span>Readings</span><strong>${detail.metric_count}</strong></div>
    <div class="stat-card"><span>Flagged</span><strong>${detail.out_of_range_count}</strong></div>
  `;
  overviewSummary.textContent = detail.summary;
}

function renderDocuments() {
  documentCount.textContent = String(state.documents.length);
  if (!state.documents.length) {
    documentList.innerHTML = `<div class="empty-state">No PDFs uploaded yet.</div>`;
    return;
  }

  documentList.innerHTML = state.documents.map((documentItem) => `
    <button class="document-card${documentItem.id === state.activeDocumentId ? " active" : ""}" data-document-id="${escapeAttribute(documentItem.id)}" type="button">
      <span class="document-card-name">${escapeHtml(documentItem.name)}</span>
      <span class="document-meta">${escapeHtml(documentItem.metric_count + " readings")} • ${escapeHtml(formatRelativeDate(documentItem.updated_at))}</span>
    </button>
  `).join("");
}

function renderValues() {
  const detail = getActiveDetail();
  const metrics = detail?.soil_metrics || [];
  soilReadingsCount.textContent = String(metrics.length);

  if (!detail) {
    soilReadingsGrid.innerHTML = `<div class="empty-state">Upload a PDF to extract soil constituents.</div>`;
    return;
  }

  if (!metrics.length) {
    soilReadingsGrid.innerHTML = `<div class="empty-state">No structured values were extracted from the active PDF.</div>`;
    return;
  }

  soilReadingsGrid.innerHTML = metrics.map((metric) => `
    <article class="value-card">
      <div class="value-top">
        <h3>${escapeHtml(metric.label || metric.key || "Reading")}</h3>
        <span class="status-pill ${escapeAttribute(metric.status_code || "normal")}">${escapeHtml(statusLabel(metric.status_code))}</span>
      </div>
      <strong class="value-reading">${escapeHtml(String(metric.reading_display || metric.reading || ""))}</strong>
      <div class="muted-copy">Range: ${escapeHtml(String(metric.range_display || "n/a"))}</div>
    </article>
  `).join("");
}

function renderPredictions() {
  const predictions = getActiveDetail()?.predictions;
  if (!predictions) {
    cropName.textContent = "No prediction";
    cropReason.textContent = "Upload a document to score crop fit.";
    cropAlternatives.innerHTML = "";
    soilHealthLabel.textContent = "No prediction";
    soilHealthSummary.textContent = "Upload a document to score soil health.";
    soilHealthScore.textContent = "Score: --";
    fertilizerPlan.innerHTML = `<div class="empty-state">No fertilizer guidance yet.</div>`;
    qaAnswer.textContent = "Ask a question about the active report.";
    qaSources.innerHTML = "";
    return;
  }

  const crop = predictions.recommended_crop || {};
  const alternatives = Array.isArray(predictions.alternative_crops) ? predictions.alternative_crops : [];
  const health = predictions.soil_health || {};
  const plan = Array.isArray(predictions.fertilizer_plan) ? predictions.fertilizer_plan : [];

  cropName.textContent = crop.name || "No prediction";
  cropReason.textContent = crop.reason || "No crop rationale available.";
  cropAlternatives.innerHTML = alternatives.length
    ? alternatives.map((item) => `<span>${escapeHtml(item.name)} ${escapeHtml(String(item.confidence || item.score || ""))}%</span>`).join("")
    : "";

  soilHealthLabel.textContent = health.label || "No prediction";
  soilHealthSummary.textContent = health.summary || "No soil health summary available.";
  soilHealthScore.textContent = `Score: ${health.score ?? "--"}`;

  fertilizerPlan.innerHTML = plan.length
    ? plan.map((item) => `
        <article class="recommendation-item">
          <strong>${escapeHtml(item.title || "Recommendation")}</strong>
          <div class="muted-copy">${escapeHtml(item.metric || "")}</div>
          <p>${escapeHtml(item.action || "")}</p>
        </article>
      `).join("")
    : `<div class="empty-state">No fertilizer guidance generated.</div>`;
}

function resetQa() {
  qaAnswer.textContent = "Ask a question about the active report.";
  qaSources.innerHTML = "";
}

async function fetchDocuments() {
  hideError();
  try {
    const payload = await requestJson("/api/documents");
    state.documents = Array.isArray(payload.documents)
      ? payload.documents.map(normalizeDocument)
      : [];
    if (!state.documents.length) {
      state.activeDocumentId = null;
      render();
      return;
    }

    if (!state.documents.some((item) => item.id === state.activeDocumentId)) {
      state.activeDocumentId = state.documents[0].id;
    }

    render();
    await fetchDetail(state.activeDocumentId);
  } catch (error) {
    showError(error.message);
  }
}

async function fetchDetail(documentId) {
  try {
    const payload = await requestJson(`/api/documents/${encodeURIComponent(documentId)}`);
    const detail = normalizeDetail(payload);
    state.details[detail.id] = detail;
    state.activeDocumentId = detail.id;
    resetQa();
    render();
  } catch (error) {
    showError(error.message);
  }
}

async function handleUpload() {
  const [file] = fileInput.files || [];
  if (!file) {
    return;
  }
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    showError("Only PDF files are supported.");
    return;
  }

  hideError();
  const formData = new FormData();
  formData.append("file", file);

  try {
    const payload = await requestJson("/api/upload-pdf", { method: "POST", body: formData });
    const detail = normalizeDetail(payload);
    state.details[detail.id] = detail;
    upsertDocument(detail);
    state.activeDocumentId = detail.id;
    resetQa();
    render();
    showToast(`${detail.name} uploaded.`, "success");
  } catch (error) {
    showError(error.message);
    showToast(error.message, "error");
  } finally {
    fileInput.value = "";
  }
}

function upsertDocument(detail) {
  const index = state.documents.findIndex((item) => item.id === detail.id);
  const normalized = normalizeDocument(detail);
  if (index === -1) {
    state.documents.unshift(normalized);
  } else {
    state.documents.splice(index, 1, normalized);
  }
  state.documents.sort((left, right) => new Date(right.updated_at) - new Date(left.updated_at));
}

function handleDocumentSelect(event) {
  const button = event.target.closest("[data-document-id]");
  if (!button) {
    return;
  }
  const documentId = button.dataset.documentId;
  state.activeDocumentId = documentId;
  resetQa();
  render();
  if (!state.details[documentId]) {
    void fetchDetail(documentId);
  }
}

async function handleQuestionSubmit(event) {
  event.preventDefault();
  const question = questionInput.value.trim();
  if (!question) {
    showError("Enter a question first.");
    return;
  }
  if (!state.activeDocumentId) {
    showError("Upload or select a PDF first.");
    return;
  }

  hideError();
  try {
    const payload = await requestJson("/api/ask-question", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        document_id: state.activeDocumentId,
        top_k: 5,
      }),
    });
    qaAnswer.textContent = payload.answer || "No answer returned.";
    const sources = Array.isArray(payload.sources) ? payload.sources : [];
    qaSources.innerHTML = sources.length
      ? sources.map((source) => `
          <article class="source-card">
            <span class="source-title">${escapeHtml(source.file || "Source")}</span>
            <div class="muted-copy">Page ${escapeHtml(String(source.page || "n/a"))} • score ${escapeHtml(String(source.score || ""))}</div>
            <p>${escapeHtml(source.snippet || "")}</p>
          </article>
        `).join("")
      : "";
  } catch (error) {
    showError(error.message);
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : { detail: await response.text() };

  if (!response.ok) {
    throw new Error(payload.detail || payload.message || "Request failed.");
  }
  return payload;
}

function showToast(message, tone) {
  const toast = document.createElement("div");
  toast.className = `toast ${tone}`;
  toast.textContent = message;
  toastRegion.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2800);
}

function showError(message) {
  errorBanner.textContent = message;
  errorBanner.classList.remove("hidden");
}

function hideError() {
  errorBanner.textContent = "";
  errorBanner.classList.add("hidden");
}

function formatBytes(bytes) {
  if (!bytes) {
    return "0 KB";
  }
  const units = ["B", "KB", "MB", "GB"];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** power);
  return `${value.toFixed(value >= 10 || power === 0 ? 0 : 1)} ${units[power]}`;
}

function formatRelativeDate(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function statusLabel(code) {
  if (code === "high") {
    return "High";
  }
  if (code === "low") {
    return "Low";
  }
  return "OK";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
