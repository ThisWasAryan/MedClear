🚀 Project Setup Guide

Follow these steps to run the project correctly:

1. Enable script execution (PowerShell only)

Run this once:

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
2. Make sure Python is installed

Check:

python --version

If not installed, install Python (recommended 3.11 or 3.12).

3. Create virtual environment
python -m venv .venv
4. Activate virtual environment
.venv\Scripts\activate
5. Install dependencies
pip install -r requirements.txt

Since Groq may not be included:

pip install groq
6. Verify installation
pip list
7. Add your API key

Create a .env file in the project folder and add:

GROQ_API_KEY=your_api_key_here

Get your key from Groq console.

8. (Optional) Select interpreter in VS Code
Press Ctrl + Shift + P
Select Python: Select Interpreter
Choose .venv
9. Run the project
python app.py
10. Open in browser

Go to:

http://127.0.0.1:5000
