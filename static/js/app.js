// ─── State ───────────────────────────────────────────────
let currentFile = null;
let currentTab = 'file';
let analysisResult = null;

// ─── Init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadLanguages();
  checkApiStatus();
});

// ─── API Status ───────────────────────────────────────────
async function checkApiStatus() {
  const badge = document.getElementById('apiStatusBadge');
  const dot   = badge.querySelector('.badge-dot');
  const text  = badge.querySelector('.badge-text');
  try {
    const res  = await fetch('/api/status');
    const data = await res.json();
    if (data.api_key_configured) {
      dot.classList.add('online');
      text.textContent = 'Gemini Ready';
    } else {
      dot.classList.add('offline');
      text.textContent = 'API Key Missing';
      showApiAlert();
    }
  } catch {
    dot.classList.add('offline');
    text.textContent = 'Server Offline';
  }
}

function showApiAlert() {
  document.getElementById('apiAlert').style.display = 'flex';
}

// ─── Languages ────────────────────────────────────────────
async function loadLanguages() {
  try {
    const res  = await fetch('/api/languages');
    const data = await res.json();
    const sel  = document.getElementById('languageSelect');
    sel.innerHTML = '';
    data.languages.forEach(lang => {
      const opt   = document.createElement('option');
      opt.value   = lang.code;
      opt.dataset.name = lang.name;
      opt.textContent  = `${getFlagEmoji(lang.code)} ${lang.name} (${lang.native})`;
      sel.appendChild(opt);
    });
  } catch (e) {
    console.error('Could not load languages:', e);
  }
}

function getFlagEmoji(code) {
  const flags = {
    en:'🇬🇧', hi:'🇮🇳', es:'🇪🇸', fr:'🇫🇷', de:'🇩🇪', ar:'🇸🇦',
    ta:'🇮🇳', te:'🇮🇳', bn:'🇧🇩', mr:'🇮🇳', gu:'🇮🇳', kn:'🇮🇳',
    ml:'🇮🇳', pa:'🇮🇳', ur:'🇵🇰', zh:'🇨🇳', ja:'🇯🇵', pt:'🇵🇹',
    ru:'🇷🇺', ko:'🇰🇷'
  };
  return flags[code] || '🌐';
}

// ─── Tabs ─────────────────────────────────────────────────
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.getElementById(`panel-${tab}`).classList.add('active');
}

// ─── File Handling ────────────────────────────────────────
function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('dropzone').classList.add('drag-over');
}

function handleDragLeave(e) {
  document.getElementById('dropzone').classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  document.getElementById('dropzone').classList.remove('drag-over');
  const files = e.dataTransfer.files;
  if (files.length > 0) setFile(files[0]);
}

function handleFileSelect(e) {
  if (e.target.files.length > 0) setFile(e.target.files[0]);
}

function setFile(file) {
  const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/tiff', 'image/bmp'];
  const allowedExt = ['pdf', 'png', 'jpg', 'jpeg', 'tiff', 'tif', 'bmp'];
  const ext = file.name.split('.').pop().toLowerCase();

  if (!allowed.includes(file.type) && !allowedExt.includes(ext)) {
    showError(`Unsupported file type: .${ext}. Please upload a PDF or image.`);
    return;
  }
  currentFile = file;

  document.getElementById('fileName').textContent = file.name;
  document.getElementById('fileSize').textContent = formatBytes(file.size);
  document.getElementById('filePreview').style.display = 'flex';
  document.getElementById('dropzone').style.display = 'none';
  hideError();
}

function removeFile() {
  currentFile = null;
  document.getElementById('fileInput').value = '';
  document.getElementById('filePreview').style.display = 'none';
  document.getElementById('dropzone').style.display = 'block';
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ─── Main Analysis Flow ───────────────────────────────────
async function analyzeReport() {
  hideError();
  const sel  = document.getElementById('languageSelect');
  const code = sel.value;
  const name = sel.options[sel.selectedIndex]?.dataset?.name || 'English';

  let medicalText = '';

  try {
    setLoading(true);

    if (currentTab === 'file') {
      if (!currentFile) { showError('Please select a file to upload.'); setLoading(false); return; }
      medicalText = await uploadFile(currentFile);
    } else {
      medicalText = document.getElementById('pasteText').value.trim();
      if (!medicalText) { showError('Please paste some medical report text.'); setLoading(false); return; }
    }

    const result = await explainText(medicalText, code, name);
    analysisResult = { ...result, languageName: name };
    renderResults(result, name);

  } catch (err) {
    showError(err.message || 'Something went wrong. Please try again.');
  } finally {
    setLoading(false);
  }
}

async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'File upload failed.');
  return data.text;
}

async function explainText(text, languageCode, languageName) {
  const res = await fetch('/api/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, language_code: languageCode, language_name: languageName })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Analysis failed.');
  return data;
}

// ─── Render Results ───────────────────────────────────────
function renderResults(data, languageName) {
  // Overall assessment
  document.getElementById('assessmentText').textContent = data.overall_assessment || '—';

  // Severity badge
  const badge = document.getElementById('severityBadge');
  const sev   = (data.severity || 'N/A').toLowerCase();
  const sevMap = {
    'normal':           ['severity-normal',   '✓ Normal'],
    'mild concern':     ['severity-mild',     '⚠ Mild Concern'],
    'moderate concern': ['severity-moderate', '⚠ Moderate Concern'],
    'serious concern':  ['severity-serious',  '⚠ Serious Concern'],
  };
  const [cls, label] = sevMap[sev] || ['severity-na', data.severity || '—'];
  badge.className = `severity-badge ${cls}`;
  badge.textContent = label;

  // Key terms
  const grid = document.getElementById('termsGrid');
  grid.innerHTML = '';
  (data.key_terms || []).forEach(term => {
    grid.appendChild(createTermCard(term));
  });
  document.getElementById('termsCard').style.display = (data.key_terms?.length) ? 'block' : 'none';

  // Recommendations
  const list = document.getElementById('recsList');
  list.innerHTML = '';
  (data.recommendations || []).forEach((rec, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<div class="rec-num">${i + 1}</div><span>${escapeHtml(rec)}</span>`;
    list.appendChild(li);
  });
  document.getElementById('recsCard').style.display = (data.recommendations?.length) ? 'block' : 'none';

  // Translation
  const transCard = document.getElementById('translationCard');
  if (data.translation) {
    document.getElementById('translationTitle').textContent = `Explanation in ${languageName}`;
    document.getElementById('translationText').textContent = data.translation;
    transCard.style.display = 'block';
  } else {
    transCard.style.display = 'none';
  }

  // Disclaimer
  if (data.disclaimer) {
    document.getElementById('disclaimerText').textContent = data.disclaimer;
  }

  // Show results
  const section = document.getElementById('resultsSection');
  section.style.display = 'flex';
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function createTermCard(term) {
  const card = document.createElement('div');
  card.className = 'term-item';

  const statusKey = (term.status || 'n/a').toLowerCase().replace(' ', '-');
  const statusClass = {
    'normal': 'status-normal', 'high': 'status-high',
    'low': 'status-low', 'abnormal': 'status-abnormal', 'n/a': 'status-na'
  }[statusKey] || 'status-na';

  let valueHtml = '';
  if (term.value || term.normal_range) {
    valueHtml = `<div class="term-value">
      ${term.value ? `<span>Value:</span> ${escapeHtml(term.value)}` : ''}
      ${term.value && term.normal_range ? '&nbsp;·&nbsp;' : ''}
      ${term.normal_range ? `<span>Normal:</span> ${escapeHtml(term.normal_range)}` : ''}
    </div>`;
  }

  card.innerHTML = `
    <div class="term-header">
      <div>
        <div class="term-name">${escapeHtml(term.term || '—')}</div>
        <div class="term-simple">${escapeHtml(term.simple_name || '')}</div>
      </div>
      <div class="term-status ${statusClass}">${escapeHtml(term.status || 'N/A')}</div>
    </div>
    <p class="term-explanation">${escapeHtml(term.explanation || '')}</p>
    ${valueHtml}
  `;
  return card;
}

// ─── Copy / Download ──────────────────────────────────────
function copyResults() {
  if (!analysisResult) return;
  const text = buildPlainText(analysisResult);
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copyBtn');
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
    setTimeout(() => {
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    }, 2000);
  });
}

function downloadResults() {
  if (!analysisResult) return;
  const text = buildPlainText(analysisResult);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `medclear-report-${Date.now()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildPlainText(data) {
  let out = `MedClear - Medical Report Analysis\n${'='.repeat(40)}\n\n`;
  out += `OVERALL ASSESSMENT\n${'-'.repeat(20)}\n${data.overall_assessment || '—'}\nSeverity: ${data.severity || '—'}\n\n`;

  out += `KEY MEDICAL TERMS\n${'-'.repeat(20)}\n`;
  (data.key_terms || []).forEach(t => {
    out += `\n• ${t.term} (${t.simple_name || 'N/A'})\n`;
    out += `  Status: ${t.status || 'N/A'}\n`;
    if (t.value)        out += `  Value: ${t.value}\n`;
    if (t.normal_range) out += `  Normal Range: ${t.normal_range}\n`;
    out += `  Explanation: ${t.explanation}\n`;
  });

  out += `\nRECOMMENDATIONS\n${'-'.repeat(20)}\n`;
  (data.recommendations || []).forEach((r, i) => {
    out += `${i + 1}. ${r}\n`;
  });

  if (data.translation) {
    out += `\nTRANSLATION (${data.languageName || ''})\n${'-'.repeat(20)}\n${data.translation}\n`;
  }

  out += `\n${'='.repeat(40)}\n${data.disclaimer || ''}`;
  return out;
}

// ─── UI Helpers ───────────────────────────────────────────
function setLoading(loading) {
  const btn    = document.getElementById('analyzeBtn');
  const text   = btn.querySelector('.btn-text');
  const loader = btn.querySelector('.btn-loader');
  btn.disabled          = loading;
  text.style.display    = loading ? 'none'  : 'flex';
  loader.style.display  = loading ? 'flex'  : 'none';
  if (!loading) document.getElementById('resultsSection').style.display = analysisResult ? 'flex' : 'none';
}

function showError(msg) {
  const el = document.getElementById('errorAlert');
  document.getElementById('errorMessage').textContent = msg;
  el.style.display = 'flex';
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideError() {
  document.getElementById('errorAlert').style.display = 'none';
}

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
