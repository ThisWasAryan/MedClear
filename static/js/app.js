let currentFile = null;
let currentTab = 'file';
let currentResultTab = 'findings';
let analysisResult = null;
let providerName = 'Groq';
let providerEnvVar = 'GROQ_API_KEY';

const severityMap = {
  normal: ['severity-normal', 'Normal'],
  'mild concern': ['severity-mild', 'Mild concern'],
  'moderate concern': ['severity-moderate', 'Moderate concern'],
  'serious concern': ['severity-serious', 'Serious concern'],
};

document.addEventListener('DOMContentLoaded', () => {
  loadTheme();
  loadLanguages();
  checkApiStatus();
});

async function checkApiStatus() {
  const badge = document.getElementById('apiStatusBadge');
  const dot = badge.querySelector('.badge-dot');
  const text = badge.querySelector('.badge-text');

  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    providerName = data.provider_name || providerName;
    providerEnvVar = data.api_key_env_var || providerEnvVar;
    updateProviderCopy(data);

    if (data.api_key_configured) {
      dot.classList.add('online');
      text.textContent = `${providerName} ready`;
    } else {
      dot.classList.add('offline');
      text.textContent = `${providerName} key missing`;
      showApiAlert();
    }
  } catch {
    dot.classList.add('offline');
    text.textContent = 'Server offline';
  }
}

function updateProviderCopy(status = {}) {
  providerName = status.provider_name || providerName;
  providerEnvVar = status.api_key_env_var || providerEnvVar;
  document.getElementById('providerName').textContent = providerName;
  document.getElementById('providerAlertName').textContent = providerName;
  document.getElementById('providerEnvVar').textContent = providerEnvVar;
}

function showApiAlert() {
  document.getElementById('apiAlert').style.display = 'block';
}

async function loadLanguages() {
  try {
    const res = await fetch('/api/languages');
    const data = await res.json();
    const select = document.getElementById('languageSelect');
    select.innerHTML = '';
    (data.languages || []).forEach(lang => {
      const option = document.createElement('option');
      option.value = lang.code;
      option.dataset.name = lang.name;
      option.textContent = `${lang.name} (${lang.native})`;
      select.appendChild(option);
    });
  } catch {
    showError('Unable to load languages.');
  }
}

function loadTheme() {
  const saved = localStorage.getItem('medclear-theme') || 'dark';
  document.documentElement.dataset.theme = saved;
  updateThemeLabel(saved);
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('medclear-theme', next);
  updateThemeLabel(next);
}

function updateThemeLabel(theme) {
  document.getElementById('themeToggleLabel').textContent = theme === 'light' ? 'Light mode' : 'Dark mode';
}

function switchTab(tab) {
  currentTab = tab;
  ['file', 'text'].forEach(name => {
    document.getElementById(`tab-${name}`).classList.toggle('active', name === tab);
    document.getElementById(`panel-${name}`).classList.toggle('active', name === tab);
  });
}

function switchResultTab(tab) {
  currentResultTab = tab;
  document.querySelectorAll('.report-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.reportTab === tab));
  document.querySelectorAll('.report-panel').forEach(panel => panel.classList.toggle('active', panel.id === `result-${tab}`));
}

function handleDragOver(event) {
  event.preventDefault();
  document.getElementById('dropzone').classList.add('drag-over');
}

function handleDragLeave(event) {
  event.preventDefault();
  document.getElementById('dropzone').classList.remove('drag-over');
}

function handleDrop(event) {
  event.preventDefault();
  document.getElementById('dropzone').classList.remove('drag-over');
  const files = event.dataTransfer.files;
  if (files.length > 0) setFile(files[0]);
}

function handleFileSelect(event) {
  if (event.target.files.length > 0) setFile(event.target.files[0]);
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
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function analyzeReport() {
  hideError();
  const select = document.getElementById('languageSelect');
  const languageCode = select.value;
  const languageName = select.options[select.selectedIndex]?.dataset?.name || 'English';
  let medicalText = '';

  try {
    setLoading(true, 'analyze');
    if (currentTab === 'file') {
      if (!currentFile) throw new Error('Please select a file to upload.');
      medicalText = await uploadFile(currentFile);
    } else {
      medicalText = document.getElementById('pasteText').value.trim();
      if (!medicalText) throw new Error('Please paste some medical report text.');
    }

    const result = await explainText(medicalText, languageCode, languageName);
    analysisResult = { ...result, languageName };
    renderResults(analysisResult);
  } catch (error) {
    showError(error.message || 'Something went wrong. Please try again.');
  } finally {
    setLoading(false, 'analyze');
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
    body: JSON.stringify({ text, language_code: languageCode, language_name: languageName }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Analysis failed.');
  return data;
}

function renderResults(data) {
  const patientName = data.patient?.name ? `${data.patient.name}'s evaluation` : 'Evaluation summary';
  document.getElementById('patientHeading').textContent = patientName;
  document.getElementById('assessmentText').textContent = data.overall_assessment || '—';
  document.getElementById('summaryText').textContent = data.summary || '—';
  document.getElementById('disclaimerText').textContent = data.disclaimer || '';

  const [severityClass, severityLabel] = severityMap[(data.severity || '').toLowerCase()] || ['severity-na', data.severity || 'N/A'];
  const severityBadge = document.getElementById('severityBadge');
  severityBadge.className = `severity-badge ${severityClass}`;
  severityBadge.textContent = severityLabel;

  renderPatientCard(data.patient || {});
  renderFindings(data.findings || []);
  renderMedications(data.medications || []);
  renderLifestyle(data.lifestyle_changes || []);
  renderSuggestions(data.follow_up_suggestions || []);
  renderTranslation(data.translated_report, data.languageName || data.language_name || 'Selected language');

  document.getElementById('resultsSection').style.display = 'grid';
  document.getElementById('followupResponse').style.display = 'none';
  switchResultTab(currentResultTab);
  document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderPatientCard(patient) {
  const rows = [
    ['Patient', patient.name],
    ['Age', patient.age],
    ['Sex', patient.sex],
    ['Report date', patient.report_date],
    ['Clinician / facility', patient.clinician],
  ].filter(([, value]) => value);

  const grid = document.getElementById('patientGrid');
  grid.innerHTML = '';
  rows.forEach(([label, value]) => {
    const card = document.createElement('div');
    card.className = 'patient-metric';
    card.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`;
    grid.appendChild(card);
  });
  document.getElementById('patientCard').style.display = rows.length ? 'block' : 'none';
}

function renderFindings(findings) {
  const container = document.getElementById('findingsList');
  container.innerHTML = '';
  if (!findings.length) {
    container.innerHTML = '<p class="empty-state">No major findings were identified in the extracted text.</p>';
    return;
  }

  findings.forEach(finding => {
    const item = document.createElement('article');
    item.className = 'stack-card';
    const chips = [finding.category, finding.status].filter(Boolean).map(value => `<span class="chip">${escapeHtml(value)}</span>`).join('');
    const values = [finding.value ? `Value: ${escapeHtml(finding.value)}` : '', finding.normal_range ? `Normal: ${escapeHtml(finding.normal_range)}` : ''].filter(Boolean).join(' · ');
    item.innerHTML = `
      <div class="stack-head">
        <h4>${escapeHtml(finding.title || 'Finding')}</h4>
        <div class="chip-row">${chips}</div>
      </div>
      ${values ? `<p class="meta-line">${values}</p>` : ''}
      <p>${escapeHtml(finding.why_it_matters || '—')}</p>
      ${finding.recommended_follow_up ? `<p class="follow-line"><strong>Follow-up:</strong> ${escapeHtml(finding.recommended_follow_up)}</p>` : ''}
    `;
    container.appendChild(item);
  });
}

function renderMedications(medications) {
  const container = document.getElementById('medicationsList');
  container.innerHTML = '';
  if (!medications.length) {
    container.innerHTML = '<p class="empty-state">No medications were clearly listed in the report.</p>';
    return;
  }

  medications.forEach(med => {
    const item = document.createElement('article');
    item.className = 'stack-card';
    item.innerHTML = `
      <div class="stack-head"><h4>${escapeHtml(med.name || 'Medication')}</h4></div>
      ${med.purpose ? `<p><strong>Purpose:</strong> ${escapeHtml(med.purpose)}</p>` : ''}
      ${med.details ? `<p><strong>Details:</strong> ${escapeHtml(med.details)}</p>` : ''}
      ${med.patient_note ? `<p><strong>Patient note:</strong> ${escapeHtml(med.patient_note)}</p>` : ''}
    `;
    container.appendChild(item);
  });
}

function renderLifestyle(items) {
  const list = document.getElementById('lifestyleList');
  list.innerHTML = '';
  if (!items.length) {
    list.innerHTML = '<li>No lifestyle guidance was confidently supported by the report.</li>';
    return;
  }
  items.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item;
    list.appendChild(li);
  });
}

function renderSuggestions(items) {
  const list = document.getElementById('suggestionList');
  list.innerHTML = '';
  if (!items.length) {
    list.innerHTML = '<li>You can ask for help understanding a specific result, medication, or next step.</li>';
    return;
  }
  items.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item;
    list.appendChild(li);
  });
}

function renderTranslation(translatedReport, languageName) {
  const block = document.getElementById('translationBlock');
  if (!translatedReport) {
    block.style.display = 'none';
    return;
  }

  const lines = [];
  if (translatedReport.overall_assessment) lines.push(`<p>${escapeHtml(translatedReport.overall_assessment)}</p>`);
  if (translatedReport.findings?.length) {
    lines.push('<h5>Findings</h5>');
    translatedReport.findings.forEach(item => lines.push(`<p><strong>${escapeHtml(item.title || '')}</strong>: ${escapeHtml(item.why_it_matters || '')}</p>`));
  }
  if (translatedReport.medications?.length) {
    lines.push('<h5>Medication</h5>');
    translatedReport.medications.forEach(item => lines.push(`<p><strong>${escapeHtml(item.name || '')}</strong>: ${escapeHtml(item.patient_note || item.purpose || '')}</p>`));
  }
  if (translatedReport.lifestyle_changes?.length) {
    lines.push('<h5>Lifestyle changes</h5>');
    lines.push(`<ul>${translatedReport.lifestyle_changes.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`);
  }
  if (translatedReport.summary) lines.push(`<h5>Summary</h5><p>${escapeHtml(translatedReport.summary)}</p>`);

  document.getElementById('translationTitle').textContent = `Translated report (${languageName})`;
  document.getElementById('translationText').innerHTML = lines.join('');
  block.style.display = 'block';
}

async function askFollowUp() {
  if (!analysisResult) {
    showError('Generate an evaluation before asking a follow-up question.');
    return;
  }

  const question = document.getElementById('followupInput').value.trim();
  if (!question) {
    showError('Please type a follow-up question first.');
    return;
  }

  try {
    setLoading(true, 'followup');
    hideError();
    const res = await fetch('/api/follow-up', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        analysis: analysisResult,
        language_code: analysisResult.language_code || 'en',
        language_name: analysisResult.languageName || analysisResult.language_name || 'English',
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Follow-up failed.');

    document.getElementById('followupAnswer').textContent = data.answer || '—';
    const list = document.getElementById('followupSuggestions');
    list.innerHTML = '';
    (data.suggested_questions || []).forEach(item => {
      const li = document.createElement('li');
      li.textContent = item;
      list.appendChild(li);
    });
    document.getElementById('followupResponse').style.display = 'block';
  } catch (error) {
    showError(error.message || 'Unable to get a follow-up answer.');
  } finally {
    setLoading(false, 'followup');
  }
}

function copyResults() {
  if (!analysisResult) return;
  navigator.clipboard.writeText(buildPlainText(analysisResult));
}

function downloadResultsPdf() {
  if (!analysisResult) return;
  const printWindow = window.open('', '_blank', 'width=900,height=1100');
  if (!printWindow) {
    showError('Popup blocked. Please allow popups to download the PDF.');
    return;
  }

  printWindow.document.write(`
    <html>
      <head>
        <title>MedClear Evaluation</title>
        <style>
          body { font-family: Inter, Arial, sans-serif; padding: 40px; color: #111827; line-height: 1.6; }
          h1, h2, h3 { margin-bottom: 8px; }
          .section { margin-top: 28px; }
          .card { border: 1px solid #d1d5db; border-radius: 14px; padding: 16px; margin-top: 12px; }
          ul { padding-left: 20px; }
        </style>
      </head>
      <body>
        ${buildPrintableHtml(analysisResult)}
        <script>
          window.onload = () => { window.print(); setTimeout(() => window.close(), 200); };
        <\/script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

function buildPrintableHtml(data) {
  const patient = data.patient || {};
  return `
    <h1>MedClear Evaluation</h1>
    <p><strong>Patient:</strong> ${escapeHtml(patient.name || 'Not provided')}</p>
    <p><strong>Severity:</strong> ${escapeHtml(data.severity || 'N/A')}</p>
    <div class="section"><h2>Overall assessment</h2><div class="card">${escapeHtml(data.overall_assessment || '—')}</div></div>
    <div class="section"><h2>Findings</h2>${(data.findings || []).map(item => `<div class="card"><h3>${escapeHtml(item.title || 'Finding')}</h3><p>${escapeHtml(item.why_it_matters || '—')}</p></div>`).join('') || '<p>No findings listed.</p>'}</div>
    <div class="section"><h2>Medication</h2>${(data.medications || []).map(item => `<div class="card"><h3>${escapeHtml(item.name || 'Medication')}</h3><p>${escapeHtml(item.patient_note || item.purpose || '—')}</p></div>`).join('') || '<p>No medications listed.</p>'}</div>
    <div class="section"><h2>Lifestyle changes</h2><ul>${(data.lifestyle_changes || []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>
    <div class="section"><h2>Summary</h2><div class="card">${escapeHtml(data.summary || '—')}</div></div>
    <div class="section"><p>${escapeHtml(data.disclaimer || '')}</p></div>
  `;
}

function buildPlainText(data) {
  const patient = data.patient || {};
  let out = `MedClear Evaluation\n====================\n`;
  if (patient.name) out += `Patient: ${patient.name}\n`;
  if (patient.age) out += `Age: ${patient.age}\n`;
  if (patient.sex) out += `Sex: ${patient.sex}\n`;
  out += `Severity: ${data.severity || 'N/A'}\n\nOverall Assessment\n------------------\n${data.overall_assessment || '—'}\n\nFindings\n--------\n`;
  (data.findings || []).forEach(item => {
    out += `• ${item.title || 'Finding'}\n  ${item.why_it_matters || ''}\n`;
  });
  out += `\nMedication\n----------\n`;
  (data.medications || []).forEach(item => {
    out += `• ${item.name || 'Medication'}: ${item.patient_note || item.purpose || ''}\n`;
  });
  out += `\nLifestyle changes\n-----------------\n`;
  (data.lifestyle_changes || []).forEach(item => {
    out += `• ${item}\n`;
  });
  out += `\nSummary\n-------\n${data.summary || '—'}\n\n${data.disclaimer || ''}`;
  return out;
}

function setLoading(loading, mode) {
  if (mode === 'analyze') {
    const btn = document.getElementById('analyzeBtn');
    btn.disabled = loading;
    btn.querySelector('.btn-text').style.display = loading ? 'none' : 'inline-flex';
    btn.querySelector('.btn-loader').style.display = loading ? 'inline-flex' : 'none';
  }
  if (mode === 'followup') {
    const btn = document.getElementById('followupBtn');
    btn.disabled = loading;
    btn.textContent = loading ? 'Thinking...' : 'Ask AI';
  }
}

function showError(message) {
  const alert = document.getElementById('errorAlert');
  document.getElementById('errorMessage').textContent = message;
  alert.style.display = 'block';
}

function hideError() {
  document.getElementById('errorAlert').style.display = 'none';
}

function escapeHtml(value) {
  if (typeof value !== 'string') return String(value ?? '');
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
