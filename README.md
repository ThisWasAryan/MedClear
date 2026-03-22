# MedClear

MedClear is a Flask web application that helps users review **lab reports, prescriptions, and mixed medical documents** in a cleaner, patient-friendly format. It can extract text from PDFs and images, structure the report with a Groq-hosted LLM, translate the output into the selected language, answer follow-up questions, and export the evaluation as a PDF.

> **Medical disclaimer:** MedClear is for education and readability only. It does **not** replace a licensed doctor, pharmacist, radiologist, or emergency service.

---

## What MedClear does

MedClear currently supports:

- Uploading or pasting medical report text.
- Extracting text from:
  - PDF files
  - PNG / JPG / JPEG images
  - TIFF / TIF images
  - BMP images
- Detecting whether a document is primarily:
  - a **lab report**
  - a **prescription**
  - a **combined report**
  - or a more general medical document
- Generating a structured explanation with:
  - overall assessment
  - severity tag
  - extracted lab results
  - highlighted findings
  - medications and patient notes
  - lifestyle suggestions
  - summary
  - translated report output
- Supporting bilingual follow-up answers:
  - the app answers in **English first**
  - then adds the selected-language translation when applicable
- Allowing one-click PDF export of the generated evaluation.
- Supporting dark mode and light mode in the UI.

---

## Current feature set

### 1. Medical text extraction

MedClear extracts text before sending anything to the LLM:

- **PDFs** are processed with **PyMuPDF**.
- **Images** are processed with **Pillow + pytesseract** OCR.
- On Windows, the app checks common Tesseract install paths automatically.

### 2. Structured AI analysis

The backend asks the model to return strict JSON with fields for:

- `report_type`
- `patient`
- `overall_assessment`
- `severity`
- `lab_results`
- `findings`
- `medications`
- `lifestyle_changes`
- `summary`
- `follow_up_suggestions`
- `disclaimer`
- `translated_report`

### 3. UI output

The current UI includes:

- upload / paste workflow
- report mode indicator
- patient detail cards
- lab review table with status colors
- prescription review cards
- findings section
- lifestyle section
- summary section
- translated report section
- follow-up question workflow
- PDF download button

### 4. Translation support

MedClear currently exposes these output languages from the backend:

- English
- Hindi
- Spanish
- French
- German
- Arabic
- Tamil
- Telugu
- Bengali
- Marathi
- Gujarati
- Kannada
- Malayalam
- Punjabi
- Urdu
- Chinese (Simplified)
- Japanese
- Portuguese
- Russian
- Korean

---

## Tech stack

### Backend

- Python
- Flask
- Flask-CORS
- python-dotenv
- PyMuPDF
- Pillow
- pytesseract
- Groq Python SDK

### Frontend

- HTML
- CSS
- Vanilla JavaScript

### Default model

The app currently defaults to:

- `llama-3.3-70b-versatile`

This can be changed through the `LLM_MODEL` environment variable.

---

## Project structure

```text
MedClear/
├── app.py
├── requirements.txt
├── README.md
├── templates/
│   └── index.html
└── static/
    ├── css/
    │   └── style.css
    └── js/
        └── app.js
```

---

## Setup

## 1. Prerequisites

Install or prepare the following before running the app:

- Python 3.10+ recommended
- pip
- Tesseract OCR if you want image OCR support
- A Groq account
- A Groq API key

---

## 2. Clone the repository

```bash
git clone https://github.com/ThisWasAryan/MedClear.git
cd MedClear
```

---

## 3. Create a virtual environment

### macOS / Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### Windows PowerShell

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

If PowerShell blocks activation, run:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

---

## 4. Install dependencies

```bash
pip install -r requirements.txt
```

---

## 5. Get your Groq API key

You need a Groq API key before the app can analyze reports.

### How to get it

1. Create or sign in to your Groq account.
2. Open the Groq Console keys page: `https://console.groq.com/keys`
3. Create a new API key.
4. Copy the key immediately.

Official Groq docs also reference using `GROQ_API_KEY` as the environment variable name and recommend keeping keys in environment variables or secret managers, not in frontend code.

Sources:
- https://console.groq.com/docs
- https://console.groq.com/docs/production-readiness/security-onboarding

---

### Important

After cloning the repo, this is the step where you should paste your Groq key.

- Open `.env`
- Find the `GROQ_API_KEY=` line
- Replace the placeholder / empty value with your real Groq key
- Save the file
- Then proceed to running the app

Do **not** commit your real `.env` file to GitHub.

---

## 7. Run the app

```bash
python app.py
```

The local development server runs at:

- `http://127.0.0.1:5000`

---

## How to use the app

1. Open MedClear in your browser.
2. Upload a file or paste medical text.
3. Choose the output language.
4. Click **Generate evaluation**.
5. Review the result sections:
   - overall assessment
   - patient details
   - report mode
   - lab review
   - prescription review
   - key findings
   - lifestyle changes
   - summary
   - translated report
6. Ask follow-up questions if needed.
7. Download the evaluation as a PDF.

---

## API routes

### `GET /`
Returns the main web UI.

### `GET /api/languages`
Returns the supported output languages.

### `GET /api/status`
Returns API/server status and whether the Groq key is configured.

### `POST /api/upload`
Uploads a file, extracts text, and returns:

- filename
- extracted text
- character count
- word count

### `POST /api/explain`
Accepts JSON input and returns the structured AI evaluation.

Example payload:

```json
{
  "text": "medical report text here",
  "language_code": "hi",
  "language_name": "Hindi"
}
```

### `POST /api/explain-text`
Alias route for direct text analysis.

### `POST /api/follow-up`
Answers a follow-up question grounded in the existing structured analysis.

---

## Security notes

Please keep these in mind:

- Never hardcode your Groq API key in frontend code.
- Never commit your real `.env` file to version control.
- Treat uploaded medical files as sensitive health-related data.
- If deploying publicly, add:
  - proper authentication
  - rate limiting
  - secure logging rules
  - data retention/deletion rules
  - HTTPS
  - server-side secret management
- Review where OCR text, prompts, and logs are stored before using this in production.

---

## Current limitations

MedClear works well for many simple and medium-complexity reports, but there are still important limitations:

- OCR quality depends heavily on image clarity.
- Large reports can still be truncated before analysis.
- The LLM may miss tests, ranges, or medication details in noisy documents.
- The app is not a diagnostic system.
- The PDF export uses browser print behavior, so final styling can vary slightly by browser.
- Follow-up answers are grounded in the generated analysis, so errors in the original extraction can carry forward.
- Very complex hospital records, pathology reports, or highly specialized reports may need manual review.

---

## Known operational issues

Depending on environment and machine setup:

- OCR may fail if Tesseract is not installed correctly.
- The Groq SDK must be available in the Python environment.
- If `GROQ_API_KEY` is missing or invalid, AI analysis will not run.
- Proxy-restricted environments may fail to install or call dependencies/services.

---

## Recommended next improvements

Suggested next steps for the project:

- add automated tests for backend routes and prompt parsing
- add stronger validation for extracted lab values and ranges
- support chunking / merging for very long reports
- improve OCR preprocessing for low-quality scans
- add authentication and audit controls for real deployments
- add stricter PDF export formatting independent of browser print dialogs
- add optional model switching in the UI for complex reports
- add structured monitoring for failed extractions and invalid AI output

---

## Medical and legal disclaimer

MedClear is an educational assistant.

It should **not** be used:

- as a substitute for a licensed clinician
- for emergency triage
- for medication changes without medical supervision
- as the only basis for interpreting a serious lab abnormality

If a report appears urgent, critical, or alarming, the user should contact a qualified medical professional immediately.

---

## Summary

MedClear is now a Groq-powered, structured medical-report review tool with:

- PDF/image/text intake
- OCR and PDF extraction
- lab + prescription aware output
- translated summaries
- bilingual follow-up answers
- PDF export
- dark/light theme support
- a cleaner clinical UI

If you clone the repo, the most important setup step after installing dependencies is:

1. get your Groq API key from `https://console.groq.com/keys`
2. paste it into the project-root `.env` file under `GROQ_API_KEY=`
3. then run the app
