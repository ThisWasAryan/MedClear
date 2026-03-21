import os
import io
import json
import tempfile
import re
from pathlib import Path
from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

app = Flask(__name__)
CORS(app)

# Configure AI provider
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
    """Extract text from PDF using PyMuPDF."""
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        text = ""
        for page in doc:
            text += page.get_text()
        doc.close()
        return text.strip()
    except Exception as e:
        return f"Error extracting PDF text: {str(e)}"


def extract_text_from_image(file_bytes, filename):
    """Extract text from image using Pillow + pytesseract OCR."""
    try:
        import pytesseract
        from PIL import Image

        # Try to find tesseract on Windows common paths
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
    """Route text extraction based on file type."""
    ext = filename.rsplit(".", 1)[1].lower()
    if ext == "pdf":
        return extract_text_from_pdf(file_bytes)
    else:
        return extract_text_from_image(file_bytes, filename)


def build_analysis_prompt(medical_text, language_name, language_code):
    """Build the prompt for medical report analysis."""
    lang_instruction = ""
    if language_code != "en":
        lang_instruction = f"""
5. **TRANSLATION**: After the JSON, provide the full patient-friendly summary translated into {language_name}. 
   Start the translation with the exact marker: ===TRANSLATION===
   Then provide the complete translated explanation in {language_name}.
"""
    else:
        lang_instruction = """
5. **TRANSLATION**: No translation needed since English is selected. Skip the ===TRANSLATION=== section.
"""

    return f"""You are a medical expert who helps patients understand their medical reports in simple, friendly language.

Analyze the following medical report text and respond in EXACTLY this format:

First, provide a JSON object with this exact structure:
{{
  "overall_assessment": "A 2-3 sentence plain English summary of the overall health picture",
  "severity": "Normal|Mild Concern|Moderate Concern|Serious Concern",
  "key_terms": [
    {{
      "term": "Medical term",
      "simple_name": "Common name or short description",
      "explanation": "Simple explanation a 12-year-old could understand",
      "value": "The measured value if applicable, else null",
      "normal_range": "Normal range if applicable, else null",
      "status": "Normal|High|Low|Abnormal|N/A"
    }}
  ],
  "recommendations": ["Simple actionable recommendation 1", "Simple actionable recommendation 2"],
  "disclaimer": "This is an AI-generated summary for educational purposes only. Always consult your doctor for medical advice."
}}

Rules for the JSON:
- Extract ALL medical terms, lab values, medications, diagnoses, procedures mentioned
- Use ONLY simple, everyday English in explanations - avoid jargon
- Be warm, reassuring, and non-alarming in tone
- If a value is abnormal, explain what that might mean in simple terms
- Include at least 3 recommendations

{lang_instruction}

MEDICAL REPORT TEXT:
---
{medical_text}
---

Remember: Output the JSON first, then optionally the ===TRANSLATION=== section."""


def call_llm(prompt):
    """Call Groq API and return the response text."""
    if not _groq_client:
        raise ValueError("Groq API key not configured. Please set GROQ_API_KEY in .env file.")

    response = _groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )
    return response.choices[0].message.content


def parse_llm_response(response_text, language_code):
    """Parse LLM response into structured data."""
    translation = None

    # Split on translation marker if present
    if "===TRANSLATION===" in response_text:
        parts = response_text.split("===TRANSLATION===", 1)
        json_part = parts[0].strip()
        translation = parts[1].strip()
    else:
        json_part = response_text.strip()

    # Extract JSON from the response (handle markdown code blocks)
    json_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", json_part)
    if json_match:
        json_str = json_match.group(1)
    else:
        # Try to find raw JSON object
        json_match = re.search(r"\{[\s\S]*\}", json_part)
        if json_match:
            json_str = json_match.group(0)
        else:
            raise ValueError("Could not extract JSON from LLM response.")

    data = json.loads(json_str)
    data["translation"] = translation
    data["language_code"] = language_code
    return data


# ─────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/languages", methods=["GET"])
def get_languages():
    return jsonify({"languages": SUPPORTED_LANGUAGES})


@app.route("/api/upload", methods=["POST"])
def upload_file():
    """Upload a file and extract raw text from it."""
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"}), 400

    try:
        file_bytes = file.read()
        filename = file.filename
        extracted_text = extract_text(file_bytes, filename)

        if not extracted_text or len(extracted_text.strip()) < 10:
            return jsonify({"error": "Could not extract meaningful text from the file. Please ensure the file contains readable text."}), 422

        return jsonify({
            "success": True,
            "filename": filename,
            "text": extracted_text,
            "char_count": len(extracted_text),
            "word_count": len(extracted_text.split()),
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/explain", methods=["POST"])
def explain_report():
    """Send extracted text to LLM and return simplified explanation."""
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

    # Truncate to ~4000 words to stay within token limits
    words = medical_text.split()
    if len(words) > 4000:
        medical_text = " ".join(words[:4000]) + "\n[... report truncated for analysis ...]"

    try:
        prompt = build_analysis_prompt(medical_text, language_name, language_code)
        response_text = call_llm(prompt)
        result = parse_llm_response(response_text, language_code)
        result["success"] = True
        return jsonify(result)

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except json.JSONDecodeError as e:
        return jsonify({"error": f"Failed to parse AI response: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"Analysis failed: {str(e)}"}), 500


@app.route("/api/explain-text", methods=["POST"])
def explain_text_direct():
    """Directly analyze pasted text (no file upload needed)."""
    return explain_report()


@app.route("/api/status", methods=["GET"])
def status():
    """Health check and API key status."""
    key_configured = bool(GROQ_API_KEY and GROQ_API_KEY != "your_groq_api_key_here")
    return jsonify({
        "status": "running",
        "api_key_configured": key_configured,
        "provider_name": LLM_PROVIDER,
        "api_key_env_var": "GROQ_API_KEY",
        "api_key_placeholder": "your_groq_api_key_here",
        "version": "1.0.0"
    })


if __name__ == "__main__":
    print("=" * 60)
    print("  Medical Report Translator")
    print("=" * 60)
    if not GROQ_API_KEY or GROQ_API_KEY == "your_groq_api_key_here":
        print("  WARNING: GROQ_API_KEY not set in .env file")
        print("  Set your key in .env before using the analysis feature")
    else:
        print(f"  OK: {LLM_PROVIDER} API key loaded")
    print("  Open: http://127.0.0.1:5000")
    print("=" * 60)
    app.run(debug=True, host="0.0.0.0", port=5000)
