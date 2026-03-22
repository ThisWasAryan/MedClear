let currentFile = null;
let currentTab = 'file';
let analysisResult = null;
let providerName = 'Groq';
let providerEnvVar = 'GROQ_API_KEY';

const severityMap = {
  normal: ['severity-normal', 'Normal'],
  'mild concern': ['severity-mild', 'Mild concern'],
  'moderate concern': ['severity-moderate', 'Moderate concern'],
  'serious concern': ['severity-serious', 'Serious concern'],
};

const reportTypeMeta = {
  lab_report: ['Lab report', 'Focused on test values, ranges, and urgency cues.'],
  prescription: ['Prescription', 'Focused on medications, dosing details, and practical use instructions.'],
  combined_report: ['Lab report + prescription', 'Shows both the full lab review and medication guidance together.'],
  general_report: ['General medical review', 'Used when the document is mixed or does not fit a single report type clearly.'],
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
    select.value = 'hi';
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
  if (event.dataTransfer.files.length > 0) setFile(event.dataTransfer.files[0]);
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

  renderReportType(data.report_type || 'general_report');
  renderPatientCard(data.patient || {});
  renderLabResults(data.lab_results || []);
  renderFindings(data.findings || []);
  renderMedications(data.medications || []);
  renderLifestyle(data.lifestyle_changes || []);
  renderSuggestions(data.follow_up_suggestions || []);
  renderTranslation(data.translated_report, data.languageName || data.language_name || 'Selected language');

  document.getElementById('resultsSection').style.display = 'grid';
  document.getElementById('followupResponse').style.display = 'none';
  document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderReportType(reportType) {
  const [title, description] = reportTypeMeta[reportType] || reportTypeMeta.general_report;
  document.getElementById('reportTypeBadge').textContent = title;
  document.getElementById('reportModeTitle').textContent = title;
  document.getElementById('reportModeDescription').textContent = description;

  const showLab = ['lab_report', 'combined_report', 'general_report'].includes(reportType);
  const showRx = ['prescription', 'combined_report', 'general_report'].includes(reportType);
  document.getElementById('labInterface').style.display = showLab ? 'block' : 'none';
  document.getElementById('prescriptionInterface').style.display = showRx ? 'block' : 'none';

  const layout = document.getElementById('resultLayout');
  layout.classList.remove('layout-lab-only', 'layout-rx-only', 'layout-both');
  if (showLab && showRx) layout.classList.add('layout-both');
  else if (showLab) layout.classList.add('layout-lab-only');
  else layout.classList.add('layout-rx-only');
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
    card.innerHTML = `<span class="patient-label">${escapeHtml(label)}</span><strong class="patient-value">&mdash; ${escapeHtml(value)}</strong>`;
    grid.appendChild(card);
  });
  document.getElementById('patientCard').style.display = rows.length ? 'block' : 'none';
}

function renderLabResults(results) {
  const table = document.getElementById('labResultsTable');
  table.innerHTML = '';

  if (!results.length) {
    table.innerHTML = '<tr><td colspan="5" class="empty-cell">No lab values were identified in this report.</td></tr>';
    return;
  }

  results.forEach(item => {
    const row = document.createElement('tr');
    const valueText = [item.value, item.unit].filter(Boolean).join(' ');
    row.innerHTML = `
      <td data-label="Test"><div class="cell-title">${escapeHtml(item.test_name || '—')}</div><div class="cell-subtitle">${escapeHtml(item.category || 'Other')}</div></td>
      <td data-label="Value">${escapeHtml(valueText || '—')}</td>
      <td data-label="Range">${escapeHtml(item.normal_range || '—')}</td>
      <td data-label="Status"><span class="status-pill ${statusClass(item.status)} urgency-${sanitizeUrgency(item.urgency)}">${escapeHtml(item.status || 'N/A')}</span></td>
      <td data-label="Explanation"><div class="wrap-text">${escapeHtml(item.explanation || '—')}</div>${item.recommended_follow_up ? `<div class="table-followup">${escapeHtml(item.recommended_follow_up)}</div>` : ''}</td>
    `;
    table.appendChild(row);
  });
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
    item.className = `finding-row ${statusClass(finding.status)}`;
    item.innerHTML = `
      <div class="finding-row-top">
        <h5>${escapeHtml(finding.title || 'Finding')}</h5>
        <span class="status-pill ${statusClass(finding.status)}">${escapeHtml(finding.status || 'N/A')}</span>
      </div>
      <p class="wrap-text">${escapeHtml(finding.why_it_matters || '—')}</p>
      ${finding.recommended_follow_up ? `<p class="table-followup">${escapeHtml(finding.recommended_follow_up)}</p>` : ''}
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
    item.className = 'med-card';
    item.innerHTML = `
      <div class="med-header">
        <h5>${escapeHtml(med.name || 'Medication')}</h5>
      </div>
      ${med.purpose ? `<p><strong>Purpose:</strong> <span class="wrap-text">${escapeHtml(med.purpose)}</span></p>` : ''}
      ${med.details ? `<p><strong>Details:</strong> <span class="wrap-text">${escapeHtml(med.details)}</span></p>` : ''}
      ${med.patient_note ? `<p><strong>Patient note:</strong> <span class="wrap-text">${escapeHtml(med.patient_note)}</span></p>` : ''}
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
    list.innerHTML = '<li>You can ask about a specific test, medicine, or next medical step.</li>';
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

  const sections = [];
  if (translatedReport.overall_assessment) sections.push(`<p>${escapeHtml(translatedReport.overall_assessment)}</p>`);
  if (translatedReport.summary) sections.push(`<p><strong>Summary:</strong> ${escapeHtml(translatedReport.summary)}</p>`);
  if (translatedReport.findings?.length) {
    sections.push('<h5>Findings</h5>');
    sections.push(`<ul>${translatedReport.findings.map(item => `<li><strong>${escapeHtml(item.title || '')}</strong>: ${escapeHtml(item.why_it_matters || '')}</li>`).join('')}</ul>`);
  }
  if (translatedReport.lab_results?.length) {
    sections.push('<h5>Lab results</h5>');
    sections.push(`<ul>${translatedReport.lab_results.map(item => `<li><strong>${escapeHtml(item.test_name || '')}</strong>: ${escapeHtml(item.explanation || '')}</li>`).join('')}</ul>`);
  }
  if (translatedReport.medications?.length) {
    sections.push('<h5>Medication</h5>');
    sections.push(`<ul>${translatedReport.medications.map(item => `<li><strong>${escapeHtml(item.name || '')}</strong>: ${escapeHtml(item.patient_note || item.purpose || '')}</li>`).join('')}</ul>`);
  }
  if (translatedReport.lifestyle_changes?.length) {
    sections.push('<h5>Lifestyle changes</h5>');
    sections.push(`<ul>${translatedReport.lifestyle_changes.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`);
  }

  document.getElementById('translationTitle').textContent = `Translated report (${languageName})`;
  document.getElementById('translationText').innerHTML = sections.join('');
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
        language_name: analysisResult.languageName || analysisResult.language_name || 'English',
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Follow-up failed.');

    document.getElementById('followupAnswerEnglish').textContent = data.answer_english || '—';
    const translationSection = document.getElementById('followupTranslationSection');
    if (data.answer_translated) {
      document.getElementById('followupTranslationTitle').textContent = `Translated answer (${data.translated_language || analysisResult.languageName || 'Selected language'})`;
      document.getElementById('followupAnswerTranslated').textContent = data.answer_translated;
      translationSection.style.display = 'block';
    } else {
      translationSection.style.display = 'none';
    }

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

function downloadResultsPdf() {
  if (!analysisResult) return;
  const printWindow = window.open('', '_blank', 'width=980,height=1180');
  if (!printWindow) {
    showError('Popup blocked. Please allow popups to download the PDF.');
    return;
  }

  printWindow.document.write(`
    <html>
      <head>
        <title>MedClear Evaluation</title>
        <style>
          body { font-family: Inter, Arial, sans-serif; padding: 34px; color: #0f172a; line-height: 1.55; }
          h1, h2, h3, h4 { margin: 0 0 10px; }
          .section { margin-top: 24px; }
          .card { border: 1px solid #d6dde8; border-radius: 14px; padding: 14px 16px; margin-top: 10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
          th, td { border: 1px solid #d6dde8; padding: 10px; text-align: left; vertical-align: top; }
          .status { font-weight: 700; }
          .high, .abnormal, .critical { color: #b91c1c; }
          .low { color: #1d4ed8; }
          .normal { color: #047857; }
          ul { padding-left: 18px; }
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
  const translated = data.translated_report;
  return `
    <h1>MedClear Evaluation</h1>
    <p><strong>Patient:</strong> ${escapeHtml(patient.name || 'Not provided')}</p>
    <p><strong>Report type:</strong> ${escapeHtml((reportTypeMeta[data.report_type] || reportTypeMeta.general_report)[0])}</p>
    <p><strong>Severity:</strong> ${escapeHtml(data.severity || 'N/A')}</p>
    <div class="section"><h2>Overall assessment</h2><div class="card">${escapeHtml(data.overall_assessment || '—')}</div></div>
    <div class="section"><h2>Lab review</h2>
      ${(data.lab_results || []).length ? `<table><thead><tr><th>Test</th><th>Value</th><th>Range</th><th>Status</th><th>Explanation</th></tr></thead><tbody>${data.lab_results.map(item => `<tr><td>${escapeHtml(item.test_name || '—')}</td><td>${escapeHtml([item.value, item.unit].filter(Boolean).join(' ') || '—')}</td><td>${escapeHtml(item.normal_range || '—')}</td><td class="status ${statusClass(item.status)}">${escapeHtml(item.status || 'N/A')}</td><td>${escapeHtml(item.explanation || '—')}</td></tr>`).join('')}</tbody></table>` : '<p>No lab values were identified in this report.</p>'}
    </div>
    <div class="section"><h2>Prescription review</h2>${(data.medications || []).map(item => `<div class="card"><h3>${escapeHtml(item.name || 'Medication')}</h3><p>${escapeHtml(item.patient_note || item.purpose || '—')}</p>${item.details ? `<p><strong>Details:</strong> ${escapeHtml(item.details)}</p>` : ''}</div>`).join('') || '<p>No medications were identified in this report.</p>'}</div>
    <div class="section"><h2>Key findings</h2>${(data.findings || []).map(item => `<div class="card"><h3>${escapeHtml(item.title || 'Finding')}</h3><p>${escapeHtml(item.why_it_matters || '—')}</p></div>`).join('') || '<p>No key findings listed.</p>'}</div>
    <div class="section"><h2>Lifestyle changes</h2><ul>${(data.lifestyle_changes || []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>
    <div class="section"><h2>Summary</h2><div class="card">${escapeHtml(data.summary || '—')}</div></div>
    ${translated ? `<div class="section"><h2>Translated report (${escapeHtml(data.languageName || data.language_name || 'Selected language')})</h2><div class="card">${buildTranslatedPrintableHtml(translated)}</div></div>` : ''}
    <div class="section"><p>${escapeHtml(data.disclaimer || '')}</p></div>
  `;
}

function buildTranslatedPrintableHtml(translated) {
  const chunks = [];
  if (translated.overall_assessment) chunks.push(`<p>${escapeHtml(translated.overall_assessment)}</p>`);
  if (translated.summary) chunks.push(`<p><strong>Summary:</strong> ${escapeHtml(translated.summary)}</p>`);
  if (translated.findings?.length) chunks.push(`<h4>Findings</h4><ul>${translated.findings.map(item => `<li><strong>${escapeHtml(item.title || '')}</strong>: ${escapeHtml(item.why_it_matters || '')}</li>`).join('')}</ul>`);
  if (translated.lab_results?.length) chunks.push(`<h4>Lab results</h4><ul>${translated.lab_results.map(item => `<li><strong>${escapeHtml(item.test_name || '')}</strong>: ${escapeHtml(item.explanation || '')}</li>`).join('')}</ul>`);
  if (translated.medications?.length) chunks.push(`<h4>Medication</h4><ul>${translated.medications.map(item => `<li><strong>${escapeHtml(item.name || '')}</strong>: ${escapeHtml(item.patient_note || item.purpose || '')}</li>`).join('')}</ul>`);
  if (translated.lifestyle_changes?.length) chunks.push(`<h4>Lifestyle changes</h4><ul>${translated.lifestyle_changes.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`);
  return chunks.join('');
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

function sanitizeUrgency(value) {
  return String(value || 'n-a').toLowerCase().replace(/[^a-z]/g, '') || 'na';
}

function statusClass(status) {
  const key = String(status || 'n/a').toLowerCase();
  if (key.includes('critical')) return 'status-critical';
  if (key.includes('high')) return 'status-high';
  if (key.includes('low')) return 'status-low';
  if (key.includes('deficient')) return 'status-deficient';
  if (key.includes('abnormal') || key.includes('follow')) return 'status-abnormal';
  if (key.includes('borderline')) return 'status-borderline';
  if (key.includes('normal')) return 'status-normal';
  return 'status-na';
}

function escapeHtml(value) {
  if (typeof value !== 'string') return String(value ?? '');
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
