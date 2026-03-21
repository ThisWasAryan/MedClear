# MedClear

**MedClear** is a Flask web app that helps people understand medical reports in plain language. Users can upload a PDF or image, or paste medical text directly, and the app extracts the content, sends it to an LLM for simplification, and returns a patient-friendly summary with explained terms, recommendations, and optional translation output.

## Project description

MedClear is best described as an **AI-powered medical report explainer and translator**. It is designed to turn difficult clinical text—such as lab reports, prescriptions, discharge summaries, and scanned documents—into simpler, more approachable explanations for patients and caregivers.

At its current stage, the project includes:

- A Flask backend with JSON API endpoints.
- OCR and PDF text extraction.
- A modern single-page upload interface.
- Multi-language output support.
- LLM-based summarization using the Groq API.

> **Important:** This project is for educational and informational use only. It is **not** a replacement for professional medical advice, diagnosis, or treatment.

---

## What the app does right now

### Core workflow

1. A user uploads a supported file or pastes medical text.
2. The backend extracts readable text from the document.
3. The app builds a structured medical-analysis prompt.
4. The prompt is sent to a Groq-hosted model.
5. The response is parsed into:
   - an overall assessment,
   - a severity label,
   - simplified explanations for medical terms,
   - practical recommendations,
   - a disclaimer,
   - and optionally a translated explanation.

### Input methods

The current UI supports two ways to analyze content:

- **File upload**
  - PDF
  - PNG
  - JPG / JPEG
  - TIFF / TIF
  - BMP
- **Paste text directly** into the browser UI.

### Output provided by the app

When analysis succeeds, MedClear can return:

- A plain-English overall summary.
- A severity classification:
  - `Normal`
  - `Mild Concern`
  - `Moderate Concern`
  - `Serious Concern`
- A list of extracted medical terms and lab values.
- Simplified explanations for each term.
- Recommended next steps.
- A patient-facing disclaimer.
- A translated explanation when a non-English language is selected.

### Supported output languages

The backend currently exposes support for 20 languages:

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

- **Python**
- **Flask**
- **Flask-CORS**
- **python-dotenv**
- **PyMuPDF** for PDF text extraction
- **Pillow** for image loading
- **pytesseract** for OCR
- **Groq Python SDK** for LLM access

### Frontend

- HTML
- CSS
- Vanilla JavaScript

### AI model

The backend is currently configured to call this Groq model:

- `llama-3.3-70b-versatile`

---

## Project structure

```text
MedClear/
├── app.py                 # Flask app and API routes
├── requirements.txt       # Python dependencies currently listed in repo
├── README.md              # Project documentation
├── templates/
│   └── index.html         # Main web UI
└── static/
    ├── css/
    │   └── style.css      # Stylesheet used by the UI assets folder
    └── js/
        └── app.js         # Frontend interaction logic
```

---

## API routes currently implemented

### `GET /`
Serves the main HTML page.

### `GET /api/languages`
Returns the list of supported output languages.

### `POST /api/upload`
Accepts a file upload, extracts text, and returns:

- filename
- extracted text
- character count
- word count

### `POST /api/explain`
Accepts JSON with medical text and selected language metadata, then returns the structured AI explanation.

Expected request shape:

```json
{
  "text": "medical report content here",
  "language_code": "en",
  "language_name": "English"
}
```

### `POST /api/explain-text`
Alias route that directly reuses the same analysis logic as `/api/explain`.

### `GET /api/status`
Returns a small health/status payload including whether the API key is configured.

---

## How text extraction works

### PDF files
PDF text is extracted using **PyMuPDF**.

### Image files
Image text is extracted using **pytesseract** OCR with **Pillow**.

On Windows, the code also checks common default install locations for the Tesseract executable.

### File validation
The backend allows these file extensions:

- `pdf`
- `png`
- `jpg`
- `jpeg`
- `tiff`
- `tif`
- `bmp`

---

## How the AI analysis works

The app builds a prompt that instructs the LLM to produce a JSON object containing:

- `overall_assessment`
- `severity`
- `key_terms`
- `recommendations`
- `disclaimer`

If the chosen output language is not English, the prompt also requests a translated, patient-friendly explanation after the JSON output using a `===TRANSLATION===` marker.

The backend then:

1. Separates the JSON section from the translation section.
2. Extracts JSON even if it appears inside a Markdown code block.
3. Parses the JSON into a structured API response.
4. Returns translation content when present.

To reduce token usage, the server truncates very long reports to roughly **4,000 words** before sending them for analysis.

---

## Setup instructions

### 1. Prerequisites

You should have:

- **Python 3.11 or 3.12** recommended
- **pip**
- **Tesseract OCR** installed if you want image OCR to work reliably
- A **Groq API key**

### 2. Clone the repository

```bash
git clone https://github.com/ThisWasAryan/MedClear.git
cd MedClear
```

### 3. Create and activate a virtual environment

### macOS / Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### Windows PowerShell

If script execution is blocked:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

Then create and activate the environment:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

### 4. Install dependencies

Install the listed dependencies:

```bash
pip install -r requirements.txt
```

Because the application imports `groq`, you should also install it if it is not already present in your environment:

```bash
pip install groq
```

### 5. Configure environment variables

Create a `.env` file in the project root with:

```env
GROQ_API_KEY=your_groq_api_key_here
```

### 6. Run the app

```bash
python app.py
```

The development server starts on:

- `http://127.0.0.1:5000`

---

## Using the app

1. Open the app in your browser.
2. Choose either:
   - **File Upload**, or
   - **Paste Text**.
3. Select the desired output language.
4. Click **Analyze Report**.
5. Review:
   - overall assessment,
   - severity,
   - explained terms,
   - recommendations,
   - translation (if requested).
6. Optionally copy or download the generated results from the UI.

---

## Example use cases

MedClear can currently be used for documents such as:

- Lab test reports
- Blood work summaries
- Prescriptions
- Discharge summaries
- Scanned medical notes
- Diagnostic summaries pasted as text

---

## Current limitations and known issues

This section documents the project **as it exists right now**.

### 1. Provider naming is inconsistent in the UI
The backend uses **Groq**, but parts of the frontend still refer to **Google Gemini** in labels and status text.

### 2. The stylesheet filename appears mismatched
The HTML template references:

- `/static/css/styles.css`

But the repository currently contains:

- `static/css/style.css`

Depending on local setup, this may cause the page styling not to load unless the filename or reference is corrected.

### 3. `groq` is used but not listed in `requirements.txt`
The backend imports the Groq SDK, so environments created strictly from `requirements.txt` may fail until `groq` is installed manually.

### 4. OCR depends on local Tesseract installation
Image-based extraction will not work fully unless Tesseract is installed and available to `pytesseract`.

### 5. Medical output quality depends on OCR and model accuracy
If the document is blurry, low-resolution, handwritten, or poorly scanned, the explanation quality can degrade.

### 6. This is not a medical device
The app provides AI-generated educational summaries and should not be used as a substitute for a clinician.

---

## Security and privacy note

This project processes medical text and may involve sensitive personal information. Before using it with real patient data, you should carefully review:

- how files are handled,
- where logs are stored,
- whether API providers retain request content,
- whether the deployment environment is compliant with your privacy requirements,
- and whether any PHI/PII should be redacted before upload.

If you plan to use this beyond local experimentation, you should add proper security, retention, and compliance controls.

---

## Recommended next improvements

If you continue developing MedClear, strong next steps would be:

- Add `groq` to `requirements.txt`.
- Fix the stylesheet path mismatch.
- Update the UI copy so it consistently refers to Groq or make the provider configurable.
- Add file size limits and upload safeguards.
- Add test coverage for:
  - OCR extraction,
  - API routes,
  - JSON parsing,
  - and prompt/response formatting.
- Add structured logging and error reporting.
- Add deployment instructions.
- Add sample screenshots and example payloads.
- Add support for stronger privacy controls and redaction.

---

## Disclaimer

MedClear is an AI-assisted educational tool intended to help users better understand medical documents. It does **not** provide medical advice, diagnosis, or treatment. Users should always consult a qualified healthcare professional regarding medical decisions.
