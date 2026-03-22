import io
import json
import os
import re
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

app = Flask(__name__)
CORS(app)

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "Groq").strip() or "Groq"
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
_groq_client = None
if GROQ_API_KEY and GROQ_API_KEY != "your_groq_api_key_here":
    _groq_client = Groq(api_key=GROQ_API_KEY)

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
        text = pytesseract.image_to_string(image)
        return text.strip()
    except ImportError:
        return "OCR not available. Please install Tesseract and pytesseract."
    except Exception as e:
        return f"Error extracting image text: {str(e)}"


def extract_text(file_bytes, filename):
    ext = filename.rsplit(".", 1)[1].lower()
    return extract_text_from_pdf(file_bytes) if ext == "pdf" else extract_text_from_image(file_bytes, filename)


def build_analysis_prompt(medical_text, language_name, language_code):
    translation_rule = (
        f'Include a fully translated version of the patient-facing report in {language_name} inside the "translated_report" object. '
        if language_code != "en"
        else 'Set "translated_report" to null because English is selected. '
    )

    return f"""You are a meticulous clinician, medical writer, and patient educator.

Your job is to turn a raw medical report into a highly polished, patient-friendly evaluation that feels personal, calm, and useful.

Important goals:
1. If the report contains a patient name or patient details (age, sex, DOB, clinician, facility, dates), capture them and use them naturally so the result feels personal.
2. Explain all important findings in plain language without losing clinical meaning.
3. If medications are mentioned, list them clearly with purpose and any practical cautions that are explicitly supported by the report.
4. Provide realistic lifestyle changes and next-step questions to ask a doctor.
5. The translation must be high quality, natural, and medically accurate — not literal or robotic.
6. Never invent facts that are not supported by the report. If something is missing, say null or an empty list.

Respond with ONLY valid JSON. No markdown fences. No commentary before or after the JSON.

Use this exact JSON schema:
{{
  "patient": {{
    "name": "Patient name if present, else null",
    "age": "Age if present, else null",
    "sex": "Sex/gender if present, else null",
    "report_date": "Relevant report date if present, else null",
    "clinician": "Doctor or facility if present, else null"
  }},
  "overall_assessment": "2-4 sentence warm overview personalized with the patient's name when available",
  "severity": "Normal|Mild Concern|Moderate Concern|Serious Concern",
  "findings": [
    {{
      "title": "Finding or medical term",
      "category": "Lab|Diagnosis|Procedure|Symptom|Vital|Imaging|Other",
      "status": "Normal|High|Low|Abnormal|Needs Follow-up|N/A",
      "value": "Measured value if present, else null",
      "normal_range": "Normal range if present, else null",
      "why_it_matters": "Plain-language explanation",
      "recommended_follow_up": "What to ask or do next, grounded in the report"
    }}
  ],
  "medications": [
    {{
      "name": "Medication name",
      "purpose": "Why the patient may be taking it based on the report, else null",
      "details": "Dose/frequency/instruction if present, else null",
      "patient_note": "Simple patient-friendly explanation or reminder"
    }}
  ],
  "lifestyle_changes": [
    "Simple, practical lifestyle action"
  ],
  "summary": "A concise closing summary that sounds reassuring, practical, and human",
  "follow_up_suggestions": [
    "A helpful question the patient can ask the AI or their doctor next"
  ],
  "disclaimer": "This AI-generated explanation is for education only and does not replace care from a licensed medical professional.",
  "translated_report": {{
    "overall_assessment": "Translated version",
    "findings": [{{
      "title": "Translated title",
      "why_it_matters": "Translated explanation",
      "recommended_follow_up": "Translated follow-up"
    }}],
    "medications": [{{
      "name": "Translated medication name if needed",
      "purpose": "Translated purpose",
      "details": "Translated details",
      "patient_note": "Translated patient note"
    }}],
    "lifestyle_changes": ["Translated item"],
    "summary": "Translated summary"
  }}
}}

Rules:
- Capture the most important findings first.
- Use compassionate, plain English suitable for a patient or family member.
- Mention the patient name naturally when present, but do not overuse it.
- Keep the tone non-alarmist and professional.
- Include at least 3 lifestyle_changes when the report supports giving them.
- Include at least 3 follow_up_suggestions when possible.
- {translation_rule}
- If the report is unclear, say so directly instead of guessing.

MEDICAL REPORT TEXT:
---
{medical_text}
---"""


def build_followup_prompt(question, analysis, language_name, language_code):
    serialized = json.dumps(analysis, ensure_ascii=False)
    return f"""You are continuing a patient-friendly discussion about a medical report.
Use the prior structured evaluation as the source of truth. Answer the patient's follow-up question clearly, warmly, and accurately.

Rules:
- Stay grounded in the report and prior evaluation.
- If the patient's name is known, use it naturally once.
- Be honest about uncertainty.
- Keep the answer practical and easy to understand.
- If useful, end with 1-3 brief suggested next questions.
- Reply in {language_name}.
- Return ONLY valid JSON in this shape:
{{
  "answer": "Main response",
  "suggested_questions": ["Question 1", "Question 2", "Question 3"]
}}

PRIOR EVALUATION JSON:
{serialized}

PATIENT QUESTION:
{question}
"""


def call_llm(prompt):
    if not _groq_client:
        raise ValueError("Groq API key not configured. Please set GROQ_API_KEY in .env file.")

    response = _groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
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
        file_bytes = file.read()
        extracted_text = extract_text(file_bytes, file.filename)

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
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON body provided"}), 400

    medical_text = data.get("text", "").strip()
    language_code = data.get("language_code", "en")
    language_name = data.get("language_name", "English")

    if not medical_text:
        return jsonify({"error": "No medical text provided"}), 400
    if len(medical_text) < 10:
        return jsonify({"error": "Text too short to analyze"}), 400

    words = medical_text.split()
    if len(words) > 4000:
        medical_text = " ".join(words[:4000]) + "\n[... report truncated for analysis ...]"

    try:
        prompt = build_analysis_prompt(medical_text, language_name, language_code)
        result = parse_json_response(call_llm(prompt))
        result["language_code"] = language_code
        result["language_name"] = language_name
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
    language_code = data.get("language_code", "en")
    language_name = data.get("language_name", "English")

    if not question:
        return jsonify({"error": "No follow-up question provided"}), 400
    if not analysis:
        return jsonify({"error": "No analysis context provided"}), 400

    try:
        prompt = build_followup_prompt(question, analysis, language_name, language_code)
        result = parse_json_response(call_llm(prompt))
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
        "version": "2.0.0",
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
    print("  Open: http://127.0.0.1:5000")
    print("=" * 60)
    app.run(debug=True, host="0.0.0.0", port=5000)
