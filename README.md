# BolOrder MVP

A local voice-to-order prototype using Sarvam Saaras v4 for transcription,
Sarvam-105B for structured order drafts, and Bulbul v4 Flash for spoken
confirmations. Orders remain drafts until a person explicitly confirms them.

## Run locally

1. Add your Sarvam key to `.env` as `SARVAM_API_KEY=...`.
2. Create and install into a virtual environment:

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   ```

3. Start the app: `.\.venv\Scripts\python.exe -m uvicorn main:app --reload`.
4. Open <http://127.0.0.1:8000>.

The app seeds a small mock product catalog and stores orders in `bolorder.db`.
Audio is kept in memory only for transcription. This is a local MVP, not a
production-ready system: use only test data until authentication, access
controls, catalog management, and production data handling are implemented.
The MVP accepts audio up to 20 MB and uses Saaras REST transcription for clips
up to 30 seconds; Batch transcription is not implemented yet.
