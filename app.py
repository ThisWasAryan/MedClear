import io
import json
import os
import re
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS
from dotenv import load_dotenv
import importlib

load_dotenv()

app = Flask(__name__)
CORS(app)

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "Groq").strip() or "Groq"
LLM_MODEL = os.getenv("LLM_MODEL", "llama-3.3-70b-versatile").strip() or "llama-3.3-70b-versatile"
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
_groq_client = None

ALLOWED_EXTENSIONS = {"pdf", "png", "jpg", "jpeg", "tiff", "tif", "bmp"}

SUPPORTED_LANGUAGES = [
    {"code": "en", "name": "English", "native": "English"},
    {"code": "hi", "name": "Hindi", "native": "हिन्दी"},
    {"code": "es", "name": "Spanish", "native": "Español"},
    {"code": "fr", "name": "French", "native": "Français"},
    {"code": "de", "name": "German", "native": "Deutsch"},
    {"code": "ar", "name": "Arabic", "native": "العربية"},
    {"code": "ta", "name": "Tamil", "native": "தமிழ்"},
    {"code": "te", "name": "Telugu", "native": "తెలుగు"},
    {"code": "bn", "name": "Bengali", "native": "বাংলা"},
    {"code": "mr", "name": "Marathi", "native": "मराठी"},
    {"code": "gu", "name": "Gujarati", "native": "ગુજરાતી"},
    {"code": "kn", "name": "Kannada", "native": "ಕನ್ನಡ"},
    {"code": "ml", "name": "Malayalam", "native": "മലയാളം"},
    {"code": "pa", "name": "Punjabi", "native": "ਪੰਜਾਬੀ"},
    {"code": "ur", "name": "Urdu", "native": "اردو"},
    {"code": "zh", "name": "Chinese (Simplified)", "native": "中文"},
    {"code": "ja", "name": "Japanese", "native": "日本語"},
    {"code": "pt", "name": "Portuguese", "native": "Português"},
    {"code": "ru", "name": "Russian", "native": "Русский"},
    {"code": "ko", "name": "Korean", "native": "한국어"},
]

def get_groq_client():
    global _groq_client
    if _groq_client is not None:
        return _groq_client
    if not GROQ_API_KEY or GROQ_API_KEY == "your_groq_api_key_here":
        return None

    groq_module = importlib.import_module("groq")
    _groq_client = groq_module.Groq(api_key=GROQ_API_KEY)
    return _groq_client


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def extract_text_from_pdf(file_bytes):
    try:
        import fitz

        doc = fitz.open(stream=file_bytes, filetype="pdf")
        text = ""
        for page in doc:
            text += page.get_text()
        doc.close()
        return text.strip()
    except Exception as e:
        return f"Error extracting PDF text: {str(e)}"


def extract_text_from_image(file_bytes, filename):
    try:
        import pytesseract
        from PIL import Image

        tesseract_paths = [
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        ]
        for path in tesseract_paths:
            if os.path.exists(path):
                pytesseract.pytesseract.tesseract_cmd = path
                break

        image = Image.open(io.BytesIO(file_bytes))
        return pytesseract.image_to_string(image).strip()
    except ImportError:
        return "OCR not available. Please install Tesseract and pytesseract."
    except Exception as e:
        return f"Error extracting image text: {str(e)}"


def extract_text(file_bytes, filename):
    ext = filename.rsplit(".", 1)[1].lower()
    return extract_text_from_pdf(file_bytes) if ext == "pdf" else extract_text_from_image(file_bytes, filename)


def build_analysis_prompt(medical_text, language_name, language_code):
    translation_rule = (
        f'Populate "translated_report" with a polished, natural {language_name} translation for every major section. '
        if language_code != "en"
        else 'Set "translated_report" to null because English is selected. '
    )

    return f"""You are a meticulous clinician, lab interpreter, pharmacist-style medication explainer, and patient educator.

Turn the medical text into a polished, structured report for a patient-facing portal.

Non-negotiable goals:
1. Detect whether this is mainly a prescription, mainly a lab report, or a combined report containing both. Use report_type = prescription|lab_report|combined_report|general_report.
2. Capture patient identity/details when present and use the patient's name naturally in the overview.
3. Extract ALL report tests/results that appear in the text, not just the abnormal ones. If 22 tests are listed, the JSON must contain all 22 in lab_results unless the source text is unreadable.
4. Preserve urgency cues by correctly labeling each test as Normal, High, Low, Abnormal, Critical, Borderline, or N/A.
5. Keep the language warm, clear, and medically accurate. Never invent values or medications.
6. If medications are listed, explain them clearly and separately from lab findings.
7. Provide good translation quality in {language_name if language_code != 'en' else 'English'} that sounds natural and professional, not literal.

Return ONLY valid JSON. No markdown fences.

Use this exact JSON schema:
{{
  "report_type": "prescription|lab_report|combined_report|general_report",
  "patient": {{
    "name": "Patient name if present, else null",
    "age": "Age if present, else null",
    "sex": "Sex/gender if present, else null",
    "report_date": "Relevant report date if present, else null",
    "clinician": "Doctor/facility if present, else null"
  }},
  "overall_assessment": "2-4 sentence personalized overview",
  "severity": "Normal|Mild Concern|Moderate Concern|Serious Concern",
  "lab_results": [
    {{
      "test_name": "Name of test",
      "category": "CBC|Liver|Kidney|Thyroid|Lipid|Sugar|Urine|Vitamin|Hormone|Imaging|Other",
      "value": "Reported value if present, else null",
      "unit": "Unit if present, else null",
      "normal_range": "Range if present, else null",
      "status": "Normal|High|Low|Abnormal|Critical|Borderline|N/A",
      "urgency": "routine|attention|urgent|n/a",
      "explanation": "Plain-language meaning",
      "recommended_follow_up": "What to ask or do next"
    }}
  ],
  "findings": [
    {{
      "title": "Key finding title",
      "status": "Normal|High|Low|Abnormal|Critical|Needs Follow-up|N/A",
      "why_it_matters": "Plain-language explanation",
      "recommended_follow_up": "Simple next step"
    }}
  ],
  "medications": [
    {{
      "name": "Medication name",
      "purpose": "Likely purpose if supported by the report, else null",
      "details": "Dose/frequency/instructions if present, else null",
      "patient_note": "Short patient-friendly explanation"
    }}
  ],
  "lifestyle_changes": ["Practical lifestyle suggestion"],
  "summary": "Short closing summary",
  "follow_up_suggestions": ["Question the patient can ask next"],
  "disclaimer": "This AI-generated explanation is for education only and does not replace care from a licensed medical professional.",
  "translated_report": {{
    "overall_assessment": "Translated assessment",
    "summary": "Translated summary",
    "findings": [{{
      "title": "Translated title",
      "why_it_matters": "Translated explanation",
      "recommended_follow_up": "Translated follow-up"
    }}],
    "lab_results": [{{
      "test_name": "Translated or localized test name if appropriate",
      "status": "Translated status",
      "explanation": "Translated explanation",
      "recommended_follow_up": "Translated follow-up"
    }}],
    "medications": [{{
      "name": "Medication name",
      "purpose": "Translated purpose",
      "details": "Translated details",
      "patient_note": "Translated note"
    }}],
    "lifestyle_changes": ["Translated lifestyle item"]
  }}
}}

Rules:
- Include every identifiable test/result in lab_results.
- Use null instead of guessing missing values.
- If the report is prescription-only, lab_results can be an empty list.
- If the report is lab-only, medications can be an empty list.
- Put the most clinically important abnormalities near the top of findings.
- {translation_rule}
- Keep the output concise but complete.

MEDICAL REPORT TEXT:
---
{medical_text}
---"""


def build_followup_prompt(question, analysis, language_name):
    serialized = json.dumps(analysis, ensure_ascii=False)
    translated_rule = (
        f'After the English answer, provide a polished {language_name} translation in "answer_translated".'
        if language_name.lower() != "english"
        else 'Set "answer_translated" to null because English is selected.'
    )

    return f"""You are continuing a patient-friendly conversation about a medical report.
Use the prior structured evaluation as the source of truth.

Rules:
- First answer in English using clear, calm language.
- {translated_rule}
- If the patient name is known, use it naturally once.
- Stay grounded in the report. Do not invent diagnoses.
- End with up to 3 short suggested next questions when useful.
- Return ONLY valid JSON:
{{
  "answer_english": "English answer",
  "answer_translated": "Translated answer or null",
  "translated_language": "{language_name}",
  "suggested_questions": ["Question 1", "Question 2"]
}}

PRIOR EVALUATION JSON:
{serialized}

PATIENT QUESTION:
{question}
"""


def call_llm(prompt):
    client = get_groq_client()
    if not client:
        raise ValueError("Groq API key not configured. Please set GROQ_API_KEY in .env file.")

    response = client.chat.completions.create(
        model=LLM_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        max_completion_tokens=8192,
        response_format={"type": "json_object"},
    )
    return response.choices[0].message.content


def parse_json_response(response_text):
    json_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", response_text)
    if json_match:
        response_text = json_match.group(1)

    json_match = re.search(r"\{[\s\S]*\}", response_text.strip())
    if not json_match:
        raise ValueError("Could not extract JSON from LLM response.")
    return json.loads(json_match.group(0))


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/languages", methods=["GET"])
def get_languages():
    return jsonify({"languages": SUPPORTED_LANGUAGES})


@app.route("/api/upload", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400
    if not allowed_file(file.filename):
        return jsonify({"error": f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"}), 400

    try:
        extracted_text = extract_text(file.read(), file.filename)
        if not extracted_text or len(extracted_text.strip()) < 10:
            return jsonify({"error": "Could not extract meaningful text from the file. Please ensure the file contains readable text."}), 422
        return jsonify({
            "success": True,
            "filename": file.filename,
            "text": extracted_text,
            "char_count": len(extracted_text),
            "word_count": len(extracted_text.split()),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/explain", methods=["POST"])
def explain_report():
    data = request.get_json() or {}
    medical_text = (data.get("text") or "").strip()
    language_code = data.get("language_code", "en")
    language_name = data.get("language_name", "English")

    if not medical_text:
        return jsonify({"error": "No medical text provided"}), 400
    if len(medical_text) < 10:
        return jsonify({"error": "Text too short to analyze"}), 400

    words = medical_text.split()
    if len(words) > 12000:
        medical_text = " ".join(words[:12000]) + "\n[... report truncated for analysis due to length ...]"

    try:
        result = parse_json_response(call_llm(build_analysis_prompt(medical_text, language_name, language_code)))
        result["language_code"] = language_code
        result["language_name"] = language_name
        result["model"] = LLM_MODEL
        result["success"] = True
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except json.JSONDecodeError as e:
        return jsonify({"error": f"Failed to parse AI response: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"Analysis failed: {str(e)}"}), 500


@app.route("/api/follow-up", methods=["POST"])
def follow_up():
    data = request.get_json() or {}
    question = (data.get("question") or "").strip()
    analysis = data.get("analysis")
    language_name = data.get("language_name", "English")

    if not question:
        return jsonify({"error": "No follow-up question provided"}), 400
    if not analysis:
        return jsonify({"error": "No analysis context provided"}), 400

    try:
        result = parse_json_response(call_llm(build_followup_prompt(question, analysis, language_name)))
        result["success"] = True
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except json.JSONDecodeError as e:
        return jsonify({"error": f"Failed to parse AI response: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"Follow-up failed: {str(e)}"}), 500


@app.route("/api/explain-text", methods=["POST"])
def explain_text_direct():
    return explain_report()


@app.route("/api/status", methods=["GET"])
def status():
    key_configured = bool(GROQ_API_KEY and GROQ_API_KEY != "your_groq_api_key_here")
    return jsonify({
        "status": "running",
        "api_key_configured": key_configured,
        "provider_name": LLM_PROVIDER,
        "api_key_env_var": "GROQ_API_KEY",
        "api_key_placeholder": "your_groq_api_key_here",
        "model": LLM_MODEL,
        "version": "2.1.0",
    })


if __name__ == "__main__":
    print("=" * 60)
    print("  MedClear")
    print("=" * 60)
    if not GROQ_API_KEY or GROQ_API_KEY == "your_groq_api_key_here":
        print("  WARNING: GROQ_API_KEY not set in .env file")
        print("  Set your key in .env before using the analysis feature")
    else:
        print(f"  OK: {LLM_PROVIDER} API key loaded")
        print(f"  MODEL: {LLM_MODEL}")
    print("  Open: http://127.0.0.1:5000")
    print("=" * 60)
    app.run(debug=True, host="0.0.0.0", port=5000)
